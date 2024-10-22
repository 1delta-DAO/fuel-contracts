library;
pub mod structs;

use std::{b512::B512,};
use std::bytes::Bytes;
use std::hash::*;
use structs::{LimitOrder, OrderFillReturn, OrderState};
use std::{
    bytes_conversions::b256::*,
    bytes_conversions::u256::*,
    bytes_conversions::u64::*,
    primitive_conversions::b256::*,
    primitive_conversions::u256::*,
    primitive_conversions::u64::*,
};

// The abi defines the blueprint for the contract.
abi FlashLogSettlement {
    #[storage(read)]
    fn get_order_hash(order: LimitOrder) -> b256;

    #[storage(read)]
    fn pack_order(order: LimitOrder) -> Bytes;

    #[storage(write)]
    fn register_filling(order_hashes: Vec<b256>, amounts: Vec<u64>);

    #[storage(write)]
    fn verify_settlement(order_hashes: Vec<b256>, amounts: Vec<u64>);

    #[storage(write, read), payable]
    fn fill_single(
        order_hash: b256,
        amount: u64,
        receiver: Address,
        callback_data: Bytes,
    ) -> OrderFillReturn;

    #[storage(write)]
    fn initialize(registry: Address);
}

// Flash callback to inject external liquidity
abi FlashCallback {
    #[storage(write, read), payable]
    fn flashCallback(
        taker_fill_amount: u64,
        maker_fill_amount: u64,
        maker_token: b256,
        taker_token: b256,
        callback_data: Bytes,
    );
}

pub fn compute_taker_fill_amount(order: LimitOrder, amount: u64) -> u64 {
    return order.maker_amount * amount / order.taker_amount;
}

pub fn compute_order_hash(order: LimitOrder) -> b256 {
    // hash the order
    keccak256((pack_order(order)))
}

pub fn pack_order(order: LimitOrder) -> Bytes {
    // Progressively append the order data as bytes
    let mut encoded_order: Bytes = order.maker_token.to_be_bytes();
    encoded_order.append(order.taker_token.to_be_bytes());
    encoded_order.append(order.maker_amount.to_be_bytes());
    encoded_order.append(order.taker_amount.to_be_bytes());
    encoded_order.append(order.maker.bits().to_be_bytes());
    encoded_order.append(order.taker.bits().to_be_bytes());
    encoded_order.append(order.nonce.to_be_bytes());
    encoded_order.append(order.expriy.to_be_bytes());

    encoded_order
}

pub const ZERO_B256: b256 = 0x0000000000000000000000000000000000000000000000000000000000000000;

pub const EMPTY_ORDER: LimitOrder = LimitOrder {
    maker_token: ZERO_B256,
    taker_token: ZERO_B256,
    maker_amount: 0,
    taker_amount: 0,
    maker: Address::from(ZERO_B256),
    taker: Address::from(ZERO_B256),
    nonce: 0,
    expriy: 0,
};

// The abi defines the blueprint for the contract.
abi FlashLogRegistry {
    #[storage(write), payable]
    fn create_order(
        expriy: u64,
        taker_amount: u64,
        taker_asset: b256,
        taker: Address,
    ) -> b256;

    #[storage(write), payable]
    fn cancel_order(hash: b256) -> b256;

    #[storage(write)]
    fn pull_maker_funds(
        maker: Address,
        maker_asset: b256,
        maker_amount: u64,
        receiver: Address,
    );

    #[storage(write)]
    fn initialize(settlement: Address);

    #[storage(read)]
    fn get_order(hash: b256) -> LimitOrder;
}
