contract;

use order_utils::{
    compute_rfq_order_hash,
    pack_rfq_order,
    recover_signer,
    structs::{
        OrderFillReturn,
        RfqOrder,
    },
};

use std::block::height;
use std::{b512::B512,};
use std::hash::*;
use std::bytes::Bytes;
use std::{asset::transfer, call_frames::msg_asset_id, context::msg_amount,};
use std::storage::storage_vec::*;
use std::revert::require;

enum Error {
    None: (),
    InvalidOrderSignature: (),
    InvalidNonce: (),
    Expired: (),
    InvalidTakerAsset: (),
    TakerAmountTooHigh: (),
    MakerInsufficientBalance: (),
    WithdrawTooMuch: (),
}

// The storage variables for the contract.
storage {
    // maker -> maker_asset -> taker_asset -> nonce_value
    nonces: StorageMap<b256, StorageMap<b256, StorageMap<b256, u64>>> = StorageMap {},
    // owner -> assetId -> balance
    balances: StorageMap<b256, StorageMap<b256, u64>> = StorageMap {},
}

impl OneDeltaRfq for Contract {
    fn get_order_hash(order: RfqOrder) -> b256 {
        compute_rfq_order_hash(order)
    }

    fn pack_order(order: RfqOrder) -> Bytes {
        pack_rfq_order(order)
    }

    #[storage(write, read), payable]
    fn fill(
        order: RfqOrder,
        order_signature: B512,
        taker_receiver: Identity,
    ) -> OrderFillReturn {
        // check expiry first
        require(order.expiry >= height(), Error::Expired);

        // compute hash
        let order_hash = compute_rfq_order_hash(order);

        // get and validate signer
        let signer = recover_signer(order_signature, order_hash);
        require(signer.bits() == order.maker, Error::InvalidOrderSignature);

        // get current maker nonce
        let mut current_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

        // valdiate nonce
        require(order.nonce >= current_nonce, Error::InvalidNonce);

        // increment nonce
        current_nonce += 1;

        // set incremented nonce
        storage
            .nonces
            .get(order.maker) // maker
            .get(order.maker_asset) // maker_asset
            .insert(order.taker_asset, current_nonce);

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
            Error::TakerAmountTooHigh,
        );

        // compute maker fill amount relative to input amount
        let maker_fill_amount = taker_fill_amount * order.maker_amount / order.taker_amount;

        // get stored balances
        let mut maker_taker_asset_balance = storage.balances.get(order.maker).get(order.taker_asset).try_read().unwrap_or(0u64);
        let mut maker_maker_asset_balance = storage.balances.get(order.maker).get(order.maker_asset).try_read().unwrap_or(0u64);

        require(
            maker_maker_asset_balance >= maker_fill_amount,
            Error::MakerInsufficientBalance,
        );

        // maker_token::maker -> receiver
        transfer(
            taker_receiver,
            AssetId::from(order.maker_asset),
            maker_fill_amount,
        );

        // increment maker balance by taker amount
        maker_taker_asset_balance += taker_fill_amount;
        // decrement maker balance by maker amount
        maker_maker_asset_balance -= maker_fill_amount;

        // update balances
        storage
            .balances
            .get(order.maker)
            .insert(order.taker_asset, maker_taker_asset_balance);
        storage
            .balances
            .get(order.maker)
            .insert(order.maker_asset, maker_maker_asset_balance);

        OrderFillReturn {
            taker_fill_amount,
            maker_fill_amount,
        }
    }

    #[storage(write, read), payable]
    fn deposit() {
        // validate asset sent
        let asset = msg_asset_id().bits();

        let deposit_amount = msg_amount();

        let owner = msg_sender().unwrap().bits();
        let mut owner_asset_balance = storage.balances.get(owner).get(asset).try_read().unwrap_or(0u64);

        owner_asset_balance += deposit_amount;

        storage
            .balances
            .get(owner)
            .insert(asset, owner_asset_balance);
    }

    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64) {
        let owner = msg_sender().unwrap();
        let mut owner_asset_balance = storage.balances.get(owner.bits()).get(asset).try_read().unwrap_or(0u64);

        require(owner_asset_balance >= amount, Error::WithdrawTooMuch);

        owner_asset_balance -= amount;

        storage
            .balances
            .get(owner.bits())
            .insert(asset, owner_asset_balance);

        // asset -> owner
        transfer(owner, AssetId::from(asset), amount);
    }

    #[storage(write, read)]
    fn invalidate_nonce(maker_asset: b256, taker_asset: b256, new_nonce: u64) {
        let owner = msg_sender().unwrap().bits();
        // get current maker nonce
        let mut current_nonce: u64 = storage.nonces.get(owner).get(maker_asset).get(taker_asset).try_read().unwrap_or(0u64);

        // valdiate nonce
        require(new_nonce >= current_nonce, Error::InvalidNonce);

        // set new nonce
        storage
            .nonces
            .get(owner) // maker
            .get(maker_asset) // maker_asset
            .insert(taker_asset, new_nonce);
    }

    #[storage(read)]
    fn validate_order(order: RfqOrder, order_signature: B512) -> Error {
        if order.expiry < height() {
            return Error::Expired;
        }

        let order_hash = compute_rfq_order_hash(order);
        let signer = recover_signer(order_signature, order_hash);
        if signer.bits() != order.maker {
            return Error::InvalidOrderSignature;
        }

        // get current maker nonce
        let current_nonce: u64 = storage.nonces.get(order.maker).get(order.maker_asset).get(order.taker_asset).try_read().unwrap_or(0u64);

        // valdiate nonce
        if order.nonce < current_nonce {
            return Error::InvalidNonce;
        }

        return Error::None;
    }

    fn get_signer_of_order(order: RfqOrder, order_signature: B512) -> b256 {
        let order_hash = compute_rfq_order_hash(order);
        let signer = recover_signer(order_signature, order_hash);
        signer.bits()
    }

    fn recover_signer(signature: B512, msg_hash: b256) -> Address {
        recover_signer(signature, msg_hash)
    }

    #[storage(read)]
    fn get_nonce(maker: b256, maker_asset: b256, taker_asset: b256) -> u64 {
        storage.nonces.get(maker).get(maker_asset).get(taker_asset).try_read().unwrap_or(0u64)
    }

    #[storage(read)]
    fn get_balance(maker: b256, asset: b256) -> u64 {
        storage.balances.get(maker).get(asset).try_read().unwrap_or(0u64)
    }
}

// The abi defines the blueprint for the contract.
abi OneDeltaRfq {
    fn get_order_hash(order: RfqOrder) -> b256;

    fn pack_order(order: RfqOrder) -> Bytes;

    #[storage(write, read), payable]
    fn fill(
        order: RfqOrder,
        order_signature: B512,
        taker_receiver: Identity,
    ) -> OrderFillReturn;

    #[storage(write, read), payable]
    fn deposit();

    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64);

    #[storage(write, read)]
    fn invalidate_nonce(maker_asset: b256, taker_asset: b256, new_nonce: u64);

    #[storage(read)]
    fn validate_order(order: RfqOrder, order_signature: B512) -> Error;

    fn recover_signer(signature: B512, msg_hash: b256) -> Address;

    fn get_signer_of_order(order: RfqOrder, order_signature: B512) -> b256;

    #[storage(read)]
    fn get_nonce(maker: b256, maker_asset: b256, taker_asset: b256) -> u64;

    #[storage(read)]
    fn get_balance(maker: b256, asset: b256) -> u64;
}
