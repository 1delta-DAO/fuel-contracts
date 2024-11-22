library;
pub mod structs;

use structs::Order;
use std::{
    b512::B512,
    bytes::Bytes,
    bytes_conversions::b256::*,
    bytes_conversions::u32::*,
    bytes_conversions::u64::*,
    ecr::{
        ec_recover,
        ec_recover_address,
        EcRecoverError,
    },
    hash::*,
};

// we allow flash callbacks for indirect filling
abi IFlashCallback {
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

// the order hash is the sha256 hash of the packed
// verifying contract address, followed by the order values
pub fn compute_order_hash(order: Order, verifying_contract: b256) -> b256 {
    // hash the order
    sha256(pack_order(order, verifying_contract))
}

pub fn pack_order(order: Order, verifying_contract: b256) -> Bytes {
    // Progressively append the order data as bytes
    let mut encoded_order: Bytes = verifying_contract.to_be_bytes();
    encoded_order.append(order.maker_asset.to_be_bytes());
    encoded_order.append(order.taker_asset.to_be_bytes());
    encoded_order.append(order.maker_amount.to_be_bytes());
    encoded_order.append(order.taker_amount.to_be_bytes());
    encoded_order.append(order.maker.to_be_bytes());
    encoded_order.append(order.nonce.to_be_bytes());
    encoded_order.append(order.expiry.to_be_bytes());

    encoded_order
}

// computes the maker amount relative to the rates given in the order and taker amount
pub fn compute_maker_fill_amount(
    taker_fill_amount: u64,
    maker_amount: u64,
    taker_amount: u64,
) -> u64 {
    // make sure we prevent u64 overflows in calculations
    let taker_fill_amount_u256: u256 = taker_fill_amount.into();
    let maker_amount_u256: u256 = maker_amount.into();
    let taker_amount_u256: u256 = taker_amount.into();
    u64::try_from(taker_fill_amount_u256 * maker_amount_u256 / taker_amount_u256).unwrap()
}

// computes the taker amount relative to the rates given in the order and taker amount
pub fn compute_taker_fill_amount(
    maker_fill_amount: u64,
    maker_amount: u64,
    taker_amount: u64,
) -> u64 {
    // make sure we prevent u64 overflows in calculations
    let maker_fill_amount_u256: u256 = maker_fill_amount.into();
    let maker_amount_u256: u256 = maker_amount.into();
    let taker_amount_u256: u256 = taker_amount.into();
    u64::try_from(maker_fill_amount_u256 * taker_amount_u256 / maker_amount_u256).unwrap() + 1u64
}

pub fn min64(a: u64, b: u64) -> u64 {
    if a < b { a } else { b }
}

// The interface for interacting with Rfq orders 
abi OneDeltaOrders {
    #[storage(write, read), payable]
    fn fill(
        order: Order,
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

    #[storage(write, read)]
    fn cancel_order(order: Order, order_signature: B512);

    #[storage(write)]
    fn register_order_signer_delegate(signer_delegate: b256, allowed: bool);

    #[storage(read)]
    fn validate_order(order: Order, order_signature: B512) -> (b256, u64, u64);

    #[storage(read)]
    fn get_order_fill_status(order_hash: b256) -> (bool, u64);

    #[storage(read)]
    fn get_nonce(maker: b256, maker_asset: b256, taker_asset: b256) -> u64;

    #[storage(read)]
    fn get_balance(asset: b256) -> u64;

    #[storage(read)]
    fn get_maker_balance(maker: b256, asset: b256) -> u64;

    #[storage(read)]
    fn is_order_signer_delegate(signer: b256, signer_delegate: b256) -> bool;
}
