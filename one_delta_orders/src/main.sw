contract;

use std::{
    asset::transfer,
    b512::B512,
    block::height,
    bytes::Bytes,
    call_frames::msg_asset_id,
    context::{
        msg_amount,
        this_balance,
    },
    hash::*,
    revert::require,
    storage::storage_vec::*,
};
use sway_libs::reentrancy::reentrancy_guard;
use order_utils::{
    compute_order_hash,
    get_expiry,
    IFlashCallback,
    is_contract_receiver,
    min64,
    no_partial_fill,
    OneDeltaOrders,
    pack_order,
    recover_signer,
    structs::{
        CancelEvent,
        CancelPairEvent,
        DepositEvent,
        Order,
        OrderFillEvent,
        WithdrawEvent,
    },
};

storage {
    // maker -> maker_asset -> taker_asset -> nonce_value
    nonces: StorageMap<b256, StorageMap<b256, StorageMap<b256, u64>>> = StorageMap {},
    // hash -> taker_asset_filled_amount
    order_hash_to_filled_amount: StorageMap<b256, (bool, u64)> = StorageMap {},
    // owner -> assetId -> balance
    maker_balances: StorageMap<b256, StorageMap<b256, u64>> = StorageMap {},
    // assetId -> contract balance
    balances: StorageMap<b256, u64> = StorageMap {},
    // signer -> signer on behalf
    order_signer_registry: StorageMap<b256, StorageMap<b256, bool>> = StorageMap {},
    // taker_asset_lock
    taker_asset_locked: StorageMap<b256, bool> = StorageMap {},
}

// constants
const ZERO_B256 = b256::zero();

// error codes
const NO_ERROR = 0u64;
const INVALID_ORDER_SIGNATURE = 1u64;
const INVALID_NONCE = 2u64;
const EXPIRED = 3u64;
const INSUFFICIENT_TAKER_AMOUNT_RECEIVED = 4u64;
const MAKER_BALANCE_TOO_LOW = 5u64;
const WITHDRAW_TOO_MUCH = 6u64;
const CANCELLED = 7u64;
const ORDER_ALREADY_FILLED = 8u64;
const INVALID_CANCEL = 9u64;
const ZERO_FILL_AMOUNT = 10u64;
const NO_PARTIAL_FILL = 11u64;
const BALANCE_VIOLATION = 12u64;
const MAKER_RECEIVER_CANNOT_BE_THIS = 13u64;
const REENTER_TAKER_ASSET = 14u64;

impl OneDeltaOrders for Contract {
    /* Fills an order
     * The filler either
     *   - attaches msg_amount=taker_fill_amount with msg_asset_id=taker_asset; or
     *   - pre-funded the order by sending the taker amount to this
     *     contract and then calls this function; or
     *   - has no funds and intents to use the callback to originate them
     */
    #[storage(write, read), payable]
    fn fill(
        order: Order,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) -> (u64, u64) {
        // reentrancy check for taker_asset
        if storage.taker_asset_locked.get(order.taker_asset).try_read().unwrap_or(false)
        {
            revert(REENTER_TAKER_ASSET);
        }
        // lock taker_asset
        storage.taker_asset_locked.insert(order.taker_asset, true);

        // validate order
        let (order_hash, error, taker_asset_already_filled_amount) = validate_order_internal(order, order_signature);

        // revert if error in validation
        if error != 0u64 {
            revert(error);
        }

        // get stored maker_asset balance
        let maker_maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        // compute fill amounts
        let (maker_filled_amount, taker_filled_amount) = compute_fill_amounts(
            taker_fill_amount,
            taker_asset_already_filled_amount,
            order.maker_amount,
            order.taker_amount,
        );

        // if any of the amounts is zero, we revert
        // this is to ensure that no msg_amount is lost 
        // attempting to fill an empty order
        require(
            maker_filled_amount != 0u64 && taker_filled_amount != 0u64,
            ZERO_FILL_AMOUNT,
        );

        // make sure that the maker balance is high enough
        if (maker_filled_amount > maker_maker_asset_balance) {
            revert(MAKER_BALANCE_TOO_LOW)
        }

        // prevent partial fills if specified as such
        if no_partial_fill(order.maker_traits) {
            if taker_fill_amount < order.taker_amount {
                revert(NO_PARTIAL_FILL);
            }
        }

        // reduce maker's recods for maker_asset
        // this must be done before the flash call
        update_maker_maker_asset_balances(
            order.maker_asset,
            maker_maker_asset_balance,
            maker_filled_amount,
            order.maker,
        );

        // register the order as filed
        update_remaining_fill_amount(
            order_hash,
            taker_asset_already_filled_amount,
            taker_fill_amount,
        );

        // reduce the total maker balance
        // we account for the fact that we might transfer back
        // to this contract
        transfer_maker_asset_out(order.maker_asset, maker_filled_amount, taker_receiver);

        // flash callback if the data is specified
        // note that we already validated the maker_asset
        // all validations for the taker_asset happen after the callback
        // That is why we check against reentrancy for the taker_asset
        if let Some(d) = data {
            abi(IFlashCallback, msg_sender()
                .unwrap()
                .bits())
                .flash(
                    order.maker_asset,
                    order.taker_asset,
                    maker_filled_amount,
                    taker_fill_amount,
                    d,
                );
        }

        // fetch the real taker asset balance
        let real_taker_asset_balance = this_balance(AssetId::from(order.taker_asset));
        // this internal balance is unadjusted for the amount received 
        let taker_asset_accounting_balance = get_total_asset_balance(order.taker_asset);
        // the funds received are real balance minus accounting balance
        let taker_fill_amount_received = real_taker_asset_balance - taker_asset_accounting_balance;

        // validate that we received enough
        // note that a too high amount will be consumed by the maker
        if taker_fill_amount_received < taker_filled_amount {
            revert(INSUFFICIENT_TAKER_AMOUNT_RECEIVED);
        }

        // if the maker receiver is not provided we default to maker 
        let maker_receiver = if order.maker_receiver != ZERO_B256 {
            order.maker_receiver
        } else {
            order.maker
        };

        // if the maker_receiver is defined, we send the funds to
        // the provided address
        transfer(
            if is_contract_receiver(order.maker_traits) {
                // we enforce that the maker_receiver cannot be this contract
                // this is the default behaviour which assumes maker_receiver==0
                require(
                    maker_receiver != ContractId::this()
                        .bits(),
                    MAKER_RECEIVER_CANNOT_BE_THIS,
                );
                Identity::ContractId(ContractId::from(maker_receiver))
            } else {
                Identity::Address(Address::from(maker_receiver))
            },
            AssetId::from(order.taker_asset),
            taker_fill_amount_received,
        );

        // log the fill info and hash
        log(OrderFillEvent {
            order_hash,
            taker_filled_amount,
            maker_filled_amount,
        });
        // unlock taker_asset
        storage.taker_asset_locked.insert(order.taker_asset, false);
        // return filled amounts
        (taker_filled_amount, maker_filled_amount)
    }

    // deposit assets to the contract
    // absorbs the difference between accounting and real balance
    #[storage(write, read), payable]
    fn deposit(asset: b256, receiver: Identity) {
        reentrancy_guard();

        // get the accounting balance
        let total_asset_balance_accounting = get_total_asset_balance(asset);
        // get the actual balance
        let total_asset_balance_real = this_balance(AssetId::from(asset));

        // deposit amount is the difference between real balance and accounting balance
        let deposit_amount = total_asset_balance_real - total_asset_balance_accounting;

        // return early if deposit is zero
        if deposit_amount != 0 {
            let fund_recipient = receiver.bits();
            let fund_recipient_asset_balance = storage.maker_balances.get(fund_recipient).get(asset).try_read().unwrap_or(0u64);

            // update depositor's balance
            storage
                .maker_balances
                .get(fund_recipient)
                .insert(asset, fund_recipient_asset_balance + deposit_amount);

            // update total balance
            storage.balances.insert(asset, total_asset_balance_real);

            // log the deposit
            log(DepositEvent {
                maker: fund_recipient,
                asset,
                amount: deposit_amount,
            });
        }
    }

    // Makers deposit their exchange balances and internally mutate them as swappers fill
    // their orders 
    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64, receiver: Identity) {
        reentrancy_guard();

        // convert to bits for maps
        let owner_bits = msg_sender().unwrap().bits();
        let owner_asset_balance = storage.maker_balances.get(owner_bits).get(asset).try_read().unwrap_or(0u64);

        // require that the owner has enough balance
        if owner_asset_balance < amount {
            revert(WITHDRAW_TOO_MUCH);
        }

        // update balance as reduced
        storage
            .maker_balances
            .get(owner_bits)
            .insert(asset, owner_asset_balance - amount);

        // we sync the overall balance by 
        let total_balance_before = storage.balances.get(asset).try_read().unwrap_or(0u64);

        // ensure that in no way there are withdrawals
        // that violate the total balance post transfer
        let new_balance = total_balance_before - amount;
        if new_balance > this_balance(AssetId::from(asset)) {
            revert(BALANCE_VIOLATION);
        }

        // update total balance
        storage.balances.insert(asset, new_balance);

        // finalize transfer from this to owner
        transfer(receiver, AssetId::from(asset), amount);

        // log the withdrawal
        log(WithdrawEvent {
            maker: owner_bits,
            asset,
            amount,
        });
    }

    // Makers can emergency-cancel orders by setting the nonce to a higher value than
    // order have that they signed
    #[storage(write, read)]
    fn invalidate_nonce(maker_asset: b256, taker_asset: b256, new_nonce: u64) {
        reentrancy_guard();

        let maker = msg_sender().unwrap().bits();
        // get current maker nonce
        let mut old_nonce: u64 = storage.nonces.get(maker).get(maker_asset).get(taker_asset).try_read().unwrap_or(0u64);

        // valdiate nonce
        require(new_nonce > old_nonce, INVALID_NONCE);

        // set new nonce
        storage
            .nonces
            .get(maker) // maker
            .get(maker_asset) // maker_asset
            .insert(taker_asset, new_nonce);

        log(CancelPairEvent {
            maker,
            maker_asset,
            taker_asset,
            nonce: new_nonce,
        });
    }

    // cancel an order with signature
    #[storage(write, read)]
    fn cancel_order(order: Order) {
        reentrancy_guard();

        let order_hash = compute_order_hash(order, ContractId::this().bits());
        let caller = msg_sender().unwrap().bits();
        require(
            caller == order.maker || is_order_signer_delegate_internal(order.maker, caller),
            INVALID_CANCEL,
        );

        // we ignore thje cancel flag here and always override
        let (_, amount_filled) = storage.order_hash_to_filled_amount.get(order_hash).try_read().unwrap_or((false, 0u64));

        // we deduct add the fill amount to the already filled amount for the hash 
        storage
            .order_hash_to_filled_amount
            // we already know that the order is not cancelled
            .insert(order_hash, (true, amount_filled));

        // log the cancellation
        log(CancelEvent { order_hash });
    }

    // allows the signer_delegate to sign on behalf of the caller if allowed=true
    #[storage(write)]
    fn register_order_signer_delegate(signer_delegate: b256, allowed: bool) {
        reentrancy_guard();

        let caller = msg_sender().unwrap().bits();
        storage
            .order_signer_registry
            .get(caller)
            .insert(signer_delegate, allowed);
    }

    // Get a maker's nonce for a trading pair
    #[storage(read)]
    fn get_nonce(maker: b256, maker_asset: b256, taker_asset: b256) -> u64 {
        storage.nonces.get(maker).get(maker_asset).get(taker_asset).try_read().unwrap_or(0u64)
    }

    // Return the balance of an asset that a maker owns in this contract
    #[storage(read)]
    fn get_maker_balance(maker: b256, asset: b256) -> u64 {
        storage.maker_balances.get(maker).get(asset).try_read().unwrap_or(0u64)
    }

    // Return the total (accounting) balance
    #[storage(read)]
    fn get_balance(asset: b256) -> u64 {
        storage.balances.get(asset).try_read().unwrap_or(0u64)
    }

    // Soft-validate an order as read function
    #[storage(read)]
    fn validate_order(order: Order, order_signature: B512) -> (b256, u64, u64) {
        validate_order_internal(order, order_signature)
    }

    #[storage(read)]
    fn is_order_signer_delegate(signer: b256, signer_delegate: b256) -> bool {
        is_order_signer_delegate_internal(signer, signer_delegate)
    }

    #[storage(read)]
    fn get_order_fill_status(order_hash: b256) -> (bool, u64) {
        storage.order_hash_to_filled_amount.get(order_hash).try_read().unwrap_or((false, 0u64))
    }
}

// Getter for the internal total balance
#[storage(read)]
fn get_total_asset_balance(asset: b256) -> u64 {
    storage.balances.get(asset).try_read().unwrap_or(0)
}

// Soft-validate an order as read function
#[storage(read)]
fn validate_order_internal(order: Order, order_signature: B512) -> (b256, u64, u64) {
    // get current maker nonce
    let old_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

    let order_hash = compute_order_hash(order, ContractId::this().bits());

    // the the amount that is already filled
    let (cancelled, taker_asset_filled_amount) = storage.order_hash_to_filled_amount.get(order_hash).try_read().unwrap_or((false, 0u64));

    // check cancellation status
    if cancelled {
        return (order_hash, CANCELLED, taker_asset_filled_amount);
    }

    // check expiry
    if get_expiry(order.maker_traits) < height() {
        return (order_hash, EXPIRED, taker_asset_filled_amount);
    }

    // check that signer is maker or delegate
    let signer = recover_signer(order_signature, order_hash).bits();
    if signer != order.maker
        && !is_order_signer_delegate_internal(order.maker, signer)
    {
        return (order_hash, INVALID_ORDER_SIGNATURE, taker_asset_filled_amount);
    }

    // valdiate nonce
    if order.nonce <= old_nonce {
        return (order_hash, INVALID_NONCE, taker_asset_filled_amount);
    }

    return (order_hash, NO_ERROR, taker_asset_filled_amount);
}

// Update the internal balances based on order fill info
// for the case where the real_taker_asset_balance is provided
#[storage(read, write)]
fn transfer_maker_asset_out(
    maker_asset: b256,
    maker_filled_amount: u64,
    taker_receiver: Identity,
) {
    let maker_asset_id = AssetId::from(maker_asset);

    // skip the transfer if it is not to self
    if (Identity::ContractId(ContractId::this()) != taker_receiver) {
        // optimistically transfer maker_token::maker -> receiver
        transfer(taker_receiver, maker_asset_id, maker_filled_amount);
    }

    // always deduct the accounting balance
    let accounting_balance = get_total_asset_balance(maker_asset) - maker_filled_amount;
    // the real balance of maker asset (this is post transfer,
    // as such, "- maker_filled_amount" is implicitly included here)
    let real_balance = this_balance(maker_asset_id);
    // make sure that maker_asset balance does not decline
    // more than expected after payout
    if accounting_balance > real_balance {
        revert(BALANCE_VIOLATION);
    }
    // deduct maker asset filled amount from total balance
    storage.balances.insert(maker_asset, accounting_balance);
}

// Update the internal balances based on order fill info inca se a custom maker receiver is provided
// just update the maker balances
#[storage(read, write)]
fn update_maker_maker_asset_balances(
    maker_asset: b256,
    maker_maker_asset_balance: u64,
    maker_fill_amount: u64,
    maker: b256,
) {
    // deduct maker asset filled amount from maker's balance
    storage
        .maker_balances
        .get(maker)
        .insert(maker_asset, maker_maker_asset_balance - maker_fill_amount);
}

// Update the filled amound for an order hash
// Obviously this needs all validations beforehand
#[storage(read, write)]
fn update_remaining_fill_amount(
    order_hash: b256,
    taker_already_filled_amount: u64,
    taker_fill_amount: u64,
) {
    // we deduct add the fill amount to the already filled amount for the hash 
    storage
        .order_hash_to_filled_amount
        // we already know that the order is not cancelled
        .insert(
            order_hash,
            (false, taker_already_filled_amount + taker_fill_amount),
        );
}

fn compute_fill_amounts(
    taker_fill_amount: u64,
    taker_asset_already_filled_amount: u64,
    maker_amount: u64,
    taker_amount: u64,
) -> (u64, u64) {
    // revert if the order is already filled
    require(
        taker_asset_already_filled_amount < taker_amount,
        ORDER_ALREADY_FILLED,
    );
    // Clamp the taker asset fill amount to the fillable amount.
    let taker_asset_amount_available: u256 = min64(
        taker_fill_amount,
        taker_amount - taker_asset_already_filled_amount,
    ).into();
    // Compute the maker asset amount.
    // This should never overflow because the values are all clamped to
    // (2^64-1).
    let maker_asset_filled_amount = (taker_asset_amount_available * maker_amount.into() / taker_amount.into());
    (
        u64::try_from(maker_asset_filled_amount).unwrap(),
        u64::try_from(taker_asset_amount_available).unwrap(),
    )
}

// check the registry if signer delegated to signer_delegate
#[storage(read)]
fn is_order_signer_delegate_internal(signer: b256, signer_delegate: b256) -> bool {
    storage.order_signer_registry.get(signer).get(signer_delegate).try_read().unwrap_or(false)
}
