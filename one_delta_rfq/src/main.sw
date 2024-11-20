contract;

use order_utils::{
    compute_maker_fill_amount,
    compute_rfq_order_hash,
    IRfqFlashCallback,
    OneDeltaRfq,
    pack_rfq_order,
    recover_signer,
    structs::{
        Error,
        OrderFillEvent,
        DepositEvent,
        WithdrawEvent,
        RfqOrder,
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
    // owner -> assetId -> balance
    maker_balances: StorageMap<b256, StorageMap<b256, u64>> = StorageMap {},
    // assetId -> contract balance
    balances: StorageMap<b256, u64> = StorageMap {},
}

// Getter for the internal total balance
#[storage(read)]
fn get_asset_balance(asset: b256) -> u64 {
    storage.balances.get(asset).try_read().unwrap_or(0)
}

// Validates the order (expiry, signature, nonce)
// Increments the nonce (and therefore invalidares the order for replays)
// Returns the computed order hash
#[storage(read, write)]
fn validate_order_and_increment_nonce_internal(order: RfqOrder, order_signature: B512) -> b256 {
    // check expiry first
    require(order.expiry >= height(), Error::Expired);

    // compute hash
    let order_hash = compute_rfq_order_hash(order, ContractId::this().bits());

    // get and validate signer
    let signer = recover_signer(order_signature, order_hash);
    require(signer.bits() == order.maker, Error::InvalidOrderSignature);

    // get old maker nonce
    let mut old_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

    // valdiate nonce
    require(order.nonce > old_nonce, Error::InvalidNonce);

    // set new nonce
    storage
        .nonces
        .get(order.maker) // maker
        .get(order.maker_asset) // maker_asset
        .insert(order.taker_asset, order.nonce);

    order_hash
}

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
        let order_hash = validate_order_and_increment_nonce_internal(order, order_signature);

        // validate asset sent
        require(
            msg_asset_id()
                .bits() == order.taker_asset,
            Error::InvalidTakerAsset,
        );

        let taker_fill_amount = msg_amount();

        // validate amount sent
        require(
            taker_fill_amount <= order.taker_amount,
            Error::TakerFillAmountTooHigh,
        );

        // compute maker fill amount relative to input amount
        let maker_fill_amount = compute_maker_fill_amount(taker_fill_amount, order.maker_amount, order.taker_amount);

        // get stored maker_balances
        let maker_taker_asset_balance = storage.maker_balances.get(order.maker).get(order.taker_asset).try_read().unwrap_or(0u64);
        let maker_maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        // make sure that the maker has enough balance
        require(
            maker_fill_amount <= maker_maker_asset_balance,
            Error::MakerBalanceTooLow,
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
        let order_hash = validate_order_and_increment_nonce_internal(order, order_signature);

        // validate taker_amount desired to be exchange
        require(
            taker_fill_amount <= order.taker_amount,
            Error::TakerFillAmountTooHigh,
        );

        // get stored maker_balances
        let maker_taker_asset_balance = storage.maker_balances.get(order.maker).get(order.taker_asset).try_read().unwrap_or(0u64);
        let maker_maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        // get stored total balances
        let maker_asset_balance = storage.balances.get(order.maker_asset).try_read().unwrap_or(0u64);

        // compute makerfill amount relative to input amount
        let maker_fill_amount = compute_maker_fill_amount(taker_fill_amount, order.maker_amount, order.taker_amount);

        // make sure that the maker amount is nonzero
        require(
            maker_fill_amount <= maker_maker_asset_balance,
            Error::MakerBalanceTooLow,
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
            Error::InsufficientTakerAmountReceived,
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

        require(owner_asset_balance >= amount, Error::WithdrawTooMuch);

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
        require(new_nonce > old_nonce, Error::InvalidNonce);

        // set new nonce
        storage
            .nonces
            .get(owner) // maker
            .get(maker_asset) // maker_asset
            .insert(taker_asset, new_nonce);
    }

    // Soft-validate an order as read function
    #[storage(read)]
    fn validate_order(order: RfqOrder, order_signature: B512) -> Error {
        // get current maker nonce
        let old_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

        if order.expiry < height() {
            return Error::Expired;
        }

        let order_hash = compute_rfq_order_hash(order, ContractId::this().bits());
        let signer = recover_signer(order_signature, order_hash);
        if signer.bits() != order.maker {
            return Error::InvalidOrderSignature;
        }

        // valdiate nonce
        if order.nonce <= old_nonce {
            return Error::InvalidNonce;
        }

        // valdiate maker balance
        let maker_asset_balance = storage.maker_balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);
        if order.maker_amount > maker_asset_balance {
            return Error::MakerBalanceTooLow;
        }

        return Error::None;
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
    } /** Helper functions to validate behavior using on-chain data */

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