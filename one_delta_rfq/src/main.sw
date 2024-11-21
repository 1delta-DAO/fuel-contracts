contract;

use order_utils::{
    min64,
    compute_rfq_order_hash,
    IRfqFlashCallback,
    OneDeltaRfq,
    pack_rfq_order,
    recover_signer,
    structs::{
        DepositEvent,
        OrderFillEvent,
        RfqOrder,
        WithdrawEvent,
    },
};
use sway_libs::reentrancy::reentrancy_guard;
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

storage {
    // maker -> maker_asset -> taker_asset -> nonce_value
    nonces: StorageMap<b256, StorageMap<b256, StorageMap<b256, u64>>> = StorageMap {},
    // hash -> taker_asset_filled_amount
    order_hash_to_filled_amount: StorageMap<b256, (bool, u64)> = StorageMap {},
    // owner -> assetId -> balance
    maker_balances: StorageMap<b256, StorageMap<b256, u64>> = StorageMap {},
    // assetId -> contract balance
    balances: StorageMap<b256, u64> = StorageMap {},
}

// error codes
const NO_ERROR: u64 = 0u64;
const INVALID_ORDER_SIGNATURE = 1u64;
const INVALID_NONCE = 2u64;
const EXPIRED = 3u64;
const INVALID_TAKER_ASSET = 4u64;
const TAKER_FILL_AMOUNT_TOO_HIGH = 5u64;
const INSUFFICIENT_TAKER_AMOUNT_RECEIVED = 6u64;
const MAKER_BALANCE_TOO_LOW = 7u64;
const WITHDRAW_TOO_MUCH = 8u64;
const CANCELLED = 9u64;

impl OneDeltaRfq for Contract {
    // Safe and simple function to directly
    // fill an Rfq Order. The taker_amount has
    // to be attached to fill the order
    // This function is ideal for filling directly from 
    // an EOA and not optimal when used in batch-swaps
    #[storage(write, read), payable]
    fn fill(
        order: RfqOrder,
        order_signature: B512,
        taker_receiver: Identity,
    ) -> (u64, u64) {
        reentrancy_guard();

        // validate order
        let (order_hash, error, taker_asset_already_filled_amount) = validate_order_internal(order, order_signature);

        // revert if error in validation
        if error != 0u64 {
            revert(error);
        }

        // validate asset sent
        require(
            msg_asset_id()
                .bits() == order.taker_asset,
            INVALID_TAKER_ASSET,
        );

        let taker_fill_amount = msg_amount();

        // compute fill amounts
        let maker_fill_amount = compute_fill_amounts(
            taker_fill_amount,
            taker_asset_already_filled_amount,
            order.maker_amount,
            order.taker_amount,
        );

        // get stored maker_balances
        let maker_taker_asset_balance = storage.maker_balances.get(order.maker).get(order.taker_asset).try_read().unwrap_or(0u64);
        let maker_maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        // make sure that the maker has enough balance
        require(
            maker_fill_amount <= maker_maker_asset_balance,
            MAKER_BALANCE_TOO_LOW,
        );

        // get stored total balances
        let taker_asset_balance = storage.balances.get(order.taker_asset).try_read().unwrap_or(0u64);
        let maker_asset_balance = storage.balances.get(order.maker_asset).try_read().unwrap_or(0u64);

        // maker_token::maker -> receiver
        transfer(
            taker_receiver,
            AssetId::from(order.maker_asset),
            maker_fill_amount,
        );

        // update accounting state for totals
        update_internal_total_balances(
            order.maker_asset,
            order.taker_asset,
            taker_asset_balance,
            maker_asset_balance,
            maker_fill_amount,
            taker_fill_amount,
        );

        // update accounting state for maker
        update_maker_balances(
            order.maker_asset,
            order.taker_asset,
            maker_taker_asset_balance,
            maker_maker_asset_balance,
            maker_fill_amount,
            taker_fill_amount,
            order.maker,
        );

        // update fill status for order
        update_remaining_fill_amount(
            order_hash,
            taker_asset_already_filled_amount,
            taker_fill_amount,
        );

        // log the fill info and hash
        log(OrderFillEvent {
            order_hash,
            maker_fill_amount,
            taker_fill_amount,
        });

        // return filled amounts
        (taker_fill_amount, maker_fill_amount)
    }

    // Fills a funded order
    // This means that the filler either
    //    - pre-funded the order by sending the taker amount to this
    //      contract and then calls this function
    //    - has no funds and intents to use the callback to originate them
    // This version is less efficient than the `fill` function that is directly
    // payable.
    #[storage(write, read)]
    fn fill_funded(
        order: RfqOrder,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) -> (u64, u64) {
        reentrancy_guard();

        // validate order
        let (order_hash, error, taker_asset_already_filled_amount) = validate_order_internal(order, order_signature);

        // revert if error in validation
        if error != 0u64 {
            revert(error);
        }

        // get stored maker_balances
        let maker_taker_asset_balance = storage.maker_balances.get(order.maker).get(order.taker_asset).try_read().unwrap_or(0u64);
        let maker_maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        // get stored total balances
        let maker_asset_balance = storage.balances.get(order.maker_asset).try_read().unwrap_or(0u64);

        // compute fill amounts
        let maker_fill_amount = compute_fill_amounts(
            taker_fill_amount,
            taker_asset_already_filled_amount,
            order.maker_amount,
            order.taker_amount,
        );

        // make sure that the maker balance is high enough
        require(
            maker_fill_amount <= maker_maker_asset_balance,
            MAKER_BALANCE_TOO_LOW,
        );

        // optimistically transfer maker_token::maker -> receiver
        transfer(
            taker_receiver,
            AssetId::from(order.maker_asset),
            maker_fill_amount,
        );

        // this internal balance is unadjusted for the amount received 
        let taker_asset_accounting_balance = get_asset_balance(order.taker_asset);

        if let Some(d) = data {
            abi(IRfqFlashCallback, taker_receiver
                .as_contract_id()
                .unwrap()
                .into())
                .flash(
                    msg_sender()
                        .unwrap(),
                    order.maker_asset,
                    order.taker_asset,
                    maker_fill_amount,
                    taker_fill_amount,
                    d,
                );
        }
        // fetch the real taker asset balance
        let real_taker_asset_balance = this_balance(AssetId::from(order.taker_asset));
        // the funds received are real balance minus accounting balance
        let taker_fill_amount_received = real_taker_asset_balance - taker_asset_accounting_balance;

        // manually handle the error where the balance has not grown enough
        require(
            taker_fill_amount_received >= taker_fill_amount,
            INSUFFICIENT_TAKER_AMOUNT_RECEIVED,
        );

        // update accounting state for totals
        update_internal_total_balances_funded(
            order.maker_asset,
            order.taker_asset,
            maker_asset_balance,
            real_taker_asset_balance,
            maker_fill_amount,
        );

        // update accounting state for maker
        update_maker_balances(
            order.maker_asset,
            order.taker_asset,
            maker_taker_asset_balance,
            maker_maker_asset_balance,
            maker_fill_amount,
            taker_fill_amount_received,
            order.maker,
        );

        update_remaining_fill_amount(
            order_hash,
            taker_asset_already_filled_amount,
            taker_fill_amount,
        );

        // log the fill info and hash
        log(OrderFillEvent {
            order_hash,
            taker_fill_amount: taker_fill_amount_received,
            maker_fill_amount,
        });

        // return filled amounts
        (taker_fill_amount_received, maker_fill_amount)
    }

    #[storage(write, read), payable]
    fn deposit() {
        reentrancy_guard();
        // validate asset sent
        let asset = msg_asset_id().bits();

        let deposit_amount = msg_amount();

        let owner = msg_sender().unwrap().bits();
        let mut owner_asset_balance = storage.maker_balances.get(owner).get(asset).try_read().unwrap_or(0u64);

        owner_asset_balance += deposit_amount;

        // update depositor's balance
        storage
            .maker_balances
            .get(owner)
            .insert(asset, owner_asset_balance);

        // update total balance
        storage
            .balances
            .insert(asset, this_balance(AssetId::from(asset)));

        // log the deposit
        log(DepositEvent {
            maker: owner,
            asset,
            amount: deposit_amount,
        });
    }

    // Makers deposit their exchange balances and internally mutate them as swappers fill
    // their Rfq Orders 
    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64) {
        reentrancy_guard();
        let owner = msg_sender().unwrap();

        // convert to bits for maps
        let owner_bits = owner.bits();
        let mut owner_asset_balance = storage.maker_balances.get(owner_bits).get(asset).try_read().unwrap_or(0u64);

        require(owner_asset_balance >= amount, WITHDRAW_TOO_MUCH);

        owner_asset_balance -= amount;

        storage
            .maker_balances
            .get(owner_bits)
            .insert(asset, owner_asset_balance);

        // we sync the overall balance by 
        let total_balance_before = storage.balances.get(asset).try_read().unwrap_or(0u64);

        // update total balance
        storage
            .balances
            .insert(asset, total_balance_before - amount);

        // asset -> owner
        transfer(owner, AssetId::from(asset), amount);

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
        let owner = msg_sender().unwrap().bits();
        // get current maker nonce
        let mut old_nonce: u64 = storage.nonces.get(owner).get(maker_asset).get(taker_asset).try_read().unwrap_or(0u64);

        // valdiate nonce
        require(new_nonce > old_nonce, INVALID_NONCE);

        // set new nonce
        storage
            .nonces
            .get(owner) // maker
            .get(maker_asset) // maker_asset
            .insert(taker_asset, new_nonce);
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
    fn validate_order(order: RfqOrder, order_signature: B512) -> (b256, u64, u64) {
        validate_order_internal(order, order_signature)
    }

    // Gets the signer of an Rfq Order given a signature
    fn get_signer_of_order(order: RfqOrder, order_signature: B512) -> b256 {
        let order_hash = compute_rfq_order_hash(order, ContractId::this().bits());
        let signer = recover_signer(order_signature, order_hash);
        signer.bits()
    }

    // Get the hash of an order
    fn get_order_hash(order: RfqOrder) -> b256 {
        compute_rfq_order_hash(order, ContractId::this().bits())
    }

    // Pack an order into a signable bytes-blob
    fn pack_order(order: RfqOrder) -> Bytes {
        pack_rfq_order(order, ContractId::this().bits())
    }
}

// Getter for the internal total balance
#[storage(read)]
fn get_asset_balance(asset: b256) -> u64 {
    storage.balances.get(asset).try_read().unwrap_or(0)
}

// Soft-validate an order as read function
#[storage(read)]
fn validate_order_internal(order: RfqOrder, order_signature: B512) -> (b256, u64, u64) {
    // get current maker nonce
    let old_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

    let order_hash = compute_rfq_order_hash(order, ContractId::this().bits());

    // the the amount that is already filled
    let (cancelled, taker_asset_filled_amount) = storage.order_hash_to_filled_amount.get(order_hash).try_read().unwrap_or((false, 0u64));

    if cancelled {
        return (order_hash, CANCELLED, taker_asset_filled_amount);
    }

    if order.expiry < height() {
        return (order_hash, EXPIRED, taker_asset_filled_amount);
    }

    let signer = recover_signer(order_signature, order_hash);
    if signer.bits() != order.maker {
        return (order_hash, INVALID_ORDER_SIGNATURE, taker_asset_filled_amount);
    }

    // valdiate nonce
    if order.nonce <= old_nonce {
        return (order_hash, INVALID_NONCE, taker_asset_filled_amount);
    }

    return (order_hash, NO_ERROR, taker_asset_filled_amount);
}

// Update the internal balances based on order fill info
// All `_balance` terms will be
//      incremented for taker_asset
//      decremented for maker_asset
#[storage(read, write)]
fn update_internal_total_balances(
    maker_asset: b256,
    taker_asset: b256,
    taker_asset_balance: u64,
    maker_asset_balance: u64,
    maker_fill_amount: u64,
    taker_fill_amount: u64,
) {
    // add taker asset filled amount to total balance
    storage
        .balances
        .insert(taker_asset, taker_asset_balance + taker_fill_amount);

    // deduct maker asset filled amount from total balance
    storage
        .balances
        .insert(maker_asset, maker_asset_balance - maker_fill_amount);
}

// Update the internal balances based on order fill info
// for the case where the real_taker_asset_balance is provided
#[storage(read, write)]
fn update_internal_total_balances_funded(
    maker_asset: b256,
    taker_asset: b256,
    maker_asset_balance: u64,
    real_taker_asset_balance: u64,
    maker_fill_amount: u64,
) {
    // add taker asset filled amount to total balance
    storage
        .balances
        .insert(taker_asset, real_taker_asset_balance);

    // deduct maker asset filled amount from total balance
    storage
        .balances
        .insert(maker_asset, maker_asset_balance - maker_fill_amount);
}

// Update the internal balances based on order fill info
// for the case where the real_taker_asset_balance is provided
// all `_balance` terms will be
//      incremented for taker_asset
//      decremented for maker_asset
#[storage(read, write)]
fn update_maker_balances(
    maker_asset: b256,
    taker_asset: b256,
    maker_taker_asset_balance: u64,
    maker_maker_asset_balance: u64,
    maker_fill_amount: u64,
    taker_fill_amount: u64,
    maker: b256,
) {
    // add taker asset filled amount to maker's balance
    storage
        .maker_balances
        .get(maker)
        .insert(taker_asset, maker_taker_asset_balance + taker_fill_amount);
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


pub fn compute_fill_amounts(
    taker_fill_amount: u64,
    taker_asset_already_filled_amount: u64,
    maker_amount: u64,
    taker_amount: u64,
) -> u64 {
    // compute the amount that can be filled
    let taker_asset_amount_available = taker_amount - taker_asset_already_filled_amount;

    if taker_fill_amount > taker_asset_amount_available {
        revert(TAKER_FILL_AMOUNT_TOO_HIGH);
        } 
    // Clamp the taker asset fill amount to the fillable amount.
    let taker_fill_amount: u256 = min64(
        taker_fill_amount,
        taker_amount - taker_asset_already_filled_amount,
    ).into();
    // Compute the maker asset amount.
    // This should never overflow because the values are all clamped to
    // (2^64-1).
    let maker_asset_filled_amount = (taker_fill_amount * maker_amount.into() / taker_amount.into());
    
    u64::try_from(maker_asset_filled_amount).unwrap()
}
