library;
pub mod structs;

use std::{b512::B512,};
use std::bytes::Bytes;
use std::hash::*;
use structs::{ OrderFillReturn, RfqOrder};
use std::{
    bytes_conversions::b256::*,
    bytes_conversions::u64::*,
    bytes_conversions::u32::*,
};

use std::{ecr::{ec_recover, ec_recover_address, EcRecoverError}};


pub fn compute_taker_fill_amount(order: RfqOrder, amount: u64) -> u64 {
    return order.maker_amount * amount / order.taker_amount;
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