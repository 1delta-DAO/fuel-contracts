contract;

use order_utils::{
    compute_order_hash,
    compute_taker_fill_amount,
    EMPTY_ORDER,
    FlashCallback,
    FlashLogRegistry,
    FlashLogSettlement,
    pack_order,
    structs::{
        Error,
        LimitOrder,
        OrderFillReturn,
        OrderState,
    },
    ZERO_B256,
};

use std::{b512::B512, ecr::{ec_recover, ec_recover_address, EcRecoverError}};
use std::hash::*;
use std::bytes::Bytes;
use std::{asset::transfer, call_frames::msg_asset_id, context::msg_amount, context::this_balance,};
use std::storage::storage_vec::*;
use std::revert::require;
use std::{
    bytes_conversions::b256::*,
    bytes_conversions::u256::*,
    bytes_conversions::u64::*,
    primitive_conversions::b256::*,
    primitive_conversions::u256::*,
    primitive_conversions::u64::*,
};

/// The storage variables for the contract.
storage {
    order_registry: b256 = ZERO_B256,
    // map order hash to state
    hash_to_order: StorageMap<b256, LimitOrder> = StorageMap {},
    locked_orders: StorageMap<b256, bool> = StorageMap {},
}

impl FlashLogSettlement for Contract {
    #[storage(write)]
    fn register_filling(order_hashes: Vec<b256>, amounts: Vec<u64>) {}

    #[storage(write)]
    fn verify_settlement(order_hashes: Vec<b256>, amounts: Vec<u64>) {}

    #[allow(deprecated)]
    #[storage(write, read), payable]
    fn fill_single(
        order_hash: b256,
        amount: u64,
        receiver: Address,
        callback_data: Bytes,
    ) -> OrderFillReturn {
        let mut order = storage.hash_to_order.get(order_hash).try_read().unwrap_or(EMPTY_ORDER);

        require(order.maker_amount > 0, Error::OrderNotDefined);

        // prevent reenter
        require(
            !storage
                .locked_orders
                .get(order_hash)
                .try_read()
                .unwrap_or(false),
            Error::OrderReenter,
        );

        storage.locked_orders.insert(order_hash, true);

        // the taker fill amount is the minimum of the fillable amount and provided amount
        let mut taker_fill_amount = order.taker_amount;

        // revert if too much is sent
        require(
            taker_fill_amount >= amount,
            Error::TryToFillMoreThanRequired,
        );

        taker_fill_amount = amount;

        // compute maker fill amount
        let maker_fill_amount = taker_fill_amount * order.maker_amount / order.taker_amount;

        // maker_token::maker -> receiver
        transfer(
            Identity::Address(receiver),
            AssetId::from(order.maker_token),
            maker_fill_amount,
        );

        // pull funds from maker through the
        // registry
        abi(FlashLogRegistry, storage
            .order_registry
            .read())
            .pull_maker_funds(
                Address::from(order.maker),
                order.maker_token,
                maker_fill_amount,
                receiver,
            );

        // the callback allows using this function
        // without sending funds
        if callback_data.len() > 0 {
            // get before balance of this
            let taker_balance_before = this_balance(AssetId::from(order.taker_token));
            abi(FlashCallback, receiver
                .bits())
                .flashCallback(
                    taker_fill_amount,
                    maker_fill_amount,
                    order.maker_token,
                    order.taker_token,
                    callback_data,
                );
            // get after balance of this
            let taker_balance_after = this_balance(AssetId::from(order.taker_token));

            // make sure that the callback resulted in an increase
            require(
                taker_balance_after - taker_balance_before >= amount,
                Error::InsufficientTakerTokensReceivedFromCallback,
            );
        } else {
            // if no callback is provided, revert
            require(
                msg_asset_id()
                    .bits() == order.taker_token,
                Error::SentAssetIdDoesNotMatchMakerToken,
            );

            //if insufficient funds were sent
            require(
                msg_amount() == amount,
                Error::SentAssetAmountDoesNotMatchFillAmount,
            );
        }

        // taker_token::this -> maker
        transfer(
            Identity::Address(order.maker),
            AssetId::from(order.taker_token),
            taker_fill_amount,
        );

        // update the order
        order.maker_amount = order.maker_amount - maker_fill_amount;
        order.taker_amount = order.taker_amount - taker_fill_amount;
        storage.hash_to_order.insert(order_hash, order);

        // unlock order
        storage.locked_orders.insert(order_hash, false);

        return OrderFillReturn {
            taker_fill_amount,
            maker_fill_amount,
        };
    }

    // The `get_count` function returns the current value of the counter.
    #[storage(read)]
    fn get_order_hash(order: LimitOrder) -> b256 {
        // hash the order
        compute_order_hash(order)
    }

    #[storage(read)]
    fn pack_order(order: LimitOrder) -> Bytes {
        pack_order(order)
    }

    #[storage(write)]
    fn initialize(registry: Address) {
        require(
            storage
                .order_registry
                .read() != ZERO_B256,
            Error::AlreadyIntitialized,
        );
        storage.order_registry.write(registry.bits());
    }
}
