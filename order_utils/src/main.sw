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
    encoded_order.append(order.maker_traits.to_be_bytes());
    encoded_order.append(order.maker_receiver.to_be_bytes());

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

const HIGH_BIT_0: u64 = 1u64 << 63u64;
const HIGH_BIT_1: u64 = 1u64 << 62u64;
const EXPIRY_MASK: u64 = 0x00000000ffffffff;

// extract the expiry from the maker_traits field
pub fn get_expiry(maker_traits: u64) -> u32 {
    let masked = maker_traits & EXPIRY_MASK;
    // this is safe due to masking
    asm(r1: masked) {
        r1: u32
    }
}
// check if the receiver is a contract
pub fn is_contract_receiver(maker_traits: u64) -> bool {
    maker_traits & HIGH_BIT_0 != 0u64
}

// check if no partial fills are allowed
pub fn no_partial_fill(maker_traits: u64) -> bool {
    maker_traits & HIGH_BIT_1 != 0u64
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
    fn deposit(receiver: Identity);

    #[storage(write, read)]
    fn withdraw(asset: b256, amount: u64, receiver: Identity);

    #[storage(write, read)]
    fn invalidate_nonce(maker_asset: b256, taker_asset: b256, new_nonce: u64);

    #[storage(write, read)]
    fn cancel_order(order: Order);

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

#[test]
fn test_maker_traits() {
    // populating everything
    let expiry: u32 = 12345u32;
    let mut maker_traits: u64 = HIGH_BIT_0;
    maker_traits = maker_traits | HIGH_BIT_1;
    maker_traits = maker_traits | u64::from(expiry);
    assert_eq(is_contract_receiver(maker_traits), true);
    assert_eq(get_expiry(maker_traits), expiry);
    assert_eq(no_partial_fill(maker_traits), true);

    // populating only the expiry
    let expiry0: u32 = 9999999u32;
    let maker_traits0: u64 = u64::from(expiry0);
    assert_eq(is_contract_receiver(maker_traits0), false);
    assert_eq(no_partial_fill(maker_traits0), false);
    assert_eq(get_expiry(maker_traits0), expiry0);
}
