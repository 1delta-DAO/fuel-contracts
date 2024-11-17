library;
pub mod structs;

use std::{b512::B512,};
use std::bytes::Bytes;
use std::hash::*;
use structs::{RfqOrder, Error,};
use std::{
    bytes_conversions::b256::*,
    bytes_conversions::u64::*,
    bytes_conversions::u32::*,
};

use std::{ecr::{ec_recover, ec_recover_address, EcRecoverError}};

// we allow flash callbacks for indirect filling
abi IRfqFlashCallback {
    #[storage(read, write)]
    fn flash(
        sender: Identity,
        maker_asset: b256,
        taker_asset: b256,
        maker_amount: u64,
        taker_amount: u64,
        data: Bytes,
    );
}

pub fn recover_signer(signature: B512, msg_hash: b256) -> Address {
    // A recovered Fuel address.
    let result_address: Result<Address, EcRecoverError> = ec_recover_address(signature, msg_hash);
    if let Ok(address) = result_address {
        return address;
    } else {
        revert(0);
    }
}

pub fn compute_rfq_order_hash(order: RfqOrder) -> b256 {
    // hash the order
    sha256(pack_rfq_order(order))
}

pub fn pack_rfq_order(order: RfqOrder) -> Bytes {
    // Progressively append the order data as bytes
    let mut encoded_order: Bytes = order.maker_asset.to_be_bytes();
    encoded_order.append(order.taker_asset.to_be_bytes());
    encoded_order.append(order.maker_amount.to_be_bytes());
    encoded_order.append(order.taker_amount.to_be_bytes());
    encoded_order.append(order.maker.to_be_bytes());
    encoded_order.append(order.nonce.to_be_bytes());
    encoded_order.append(order.expiry.to_be_bytes());

    encoded_order
}

// computes the maker amount relative to the rates given in the order and taker amount
pub fn compute_maker_fill_amount(taker_fill_amount:u64, maker_amount:u64, taker_amount:u64) -> u64 {
    taker_fill_amount * maker_amount / taker_amount
}

// computes the taker amount relative to the rates given in the order and taker amount
pub fn compute_taker_fill_amount(maker_fill_amount:u64, maker_amount:u64, taker_amount:u64) -> u64 {
    maker_fill_amount * taker_amount / maker_amount + 1
}

// The interface for interacting with Rfq orders 
abi OneDeltaRfq {

    #[storage(write, read), payable]
    fn fill(
        order: RfqOrder,
        order_signature: B512,
        taker_receiver: Identity,
    ) -> (u64, u64);

    #[storage(write, read)]
    fn fill_funded(
        order: RfqOrder,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) -> (u64, u64);

    #[storage(write, read), payable]
    fn deposit();

    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64);

    #[storage(write, read)]
    fn invalidate_nonce(maker_asset: b256, taker_asset: b256, new_nonce: u64);

    #[storage(read)]
    fn validate_order(order: RfqOrder, order_signature: B512) -> Error;

    #[storage(read)]
    fn get_nonce(maker: b256, maker_asset: b256, taker_asset: b256) -> u64;

    #[storage(read)]
    fn get_balance(asset: b256) -> u64;

    #[storage(read)]
    fn get_maker_balance(maker: b256, asset: b256) -> u64;

    fn get_signer_of_order(order: RfqOrder, order_signature: B512) -> b256;

    fn get_order_hash(order: RfqOrder) -> b256;

    fn pack_order(order: RfqOrder) -> Bytes;

}