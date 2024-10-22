contract;

use order_utils::{
    compute_order_hash,
    compute_taker_fill_amount,
    EMPTY_ORDER,
    FlashCallback,
    FlashLogRegistry,
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
    // settlement contract address
    order_settlement: b256 = ZERO_B256,
    // order mapping
    hash_to_order: StorageMap<b256, LimitOrder> = StorageMap {},
    // maker address to nonce
    nonces: StorageMap<b256, u256> = StorageMap {},
    // user deposits
    deposits: StorageMap<b256, StorageMap<b256, u64>> = StorageMap {},
}

impl FlashLogRegistry for Contract {
    #[storage(write), payable]
    fn create_order(
        expriy: u64,
        taker_amount: u64,
        taker_asset: b256,
        taker: Address,
    ) -> b256 {
        // get context
        let maker = msg_sender().unwrap().bits();
        let maker_token = msg_asset_id().bits();
        let maker_amount = msg_amount();

        // increment maker's funds
        let maker_funds = storage.deposits.get(maker).get(maker_token).read();
        storage
            .deposits
            .get(maker)
            .insert(maker_token, maker_funds + maker_amount);

        // use nonce for order
        let nonce = storage.nonces.get(maker).read();
        let order = LimitOrder {
            taker_amount,
            maker_amount,
            taker_token: taker_asset,
            maker_token,
            expriy,
            nonce,
            maker: Address::from(maker),
            taker: Address::from(taker),
        };

        // increase nonce
        storage.nonces.insert(maker, nonce + 1);

        // store order
        let hash = compute_order_hash(order);
        storage.hash_to_order.insert(hash, order);

        return hash;
    }

    #[storage(write)]
    fn pull_maker_funds(
        maker: Address,
        maker_asset: b256,
        maker_amount: u64,
        receiver: Address,
    ) {
        // require sender to be settlement contract
        require(
            msg_sender()
                .unwrap()
                .bits() == storage
                .order_settlement
                .read(),
            Error::OnlySettlementCanInteract,
        );

        // get funds of maker
        let maker_funds = storage.deposits.get(maker.bits()).get(maker_asset).read();

        // Cannot pull more than assigned
        require(maker_funds >= maker_amount, Error::MakerHasNotEnoughFunds);

        // update deposit balance
        storage
            .deposits
            .get(maker.bits())
            .insert(maker_asset, maker_funds - maker_amount);

        // transfer to receiver
        transfer(
            Identity::Address(receiver),
            AssetId::from(maker_asset),
            maker_amount,
        );
    }

    #[storage(write)]
    fn initialize(settlement: Address) {
        require(
            storage
                .order_settlement
                .read() != ZERO_B256,
            Error::AlreadyIntitialized,
        );
        storage.order_settlement.write(settlement.bits());
    }

    #[storage(read)]
    fn get_order(hash: b256) -> LimitOrder {
        return storage.hash_to_order.get(hash).read();
    }

    #[storage(write), payable]
    fn cancel_order(hash: b256) -> b256 {
        return ZERO_B256;
    }
}
