library;

use std::{bytes::Bytes, bytes_conversions::{b256::*, u16::*, u256::*, u32::*, u64::*},};
use std::revert::revert;
use core::raw_slice::*;
use core::codec::abi_decode_in_place;
use mira_v1_swap::swap::swap_mira_exact_in;

////////////////////////////////////////////////////
// structs
////////////////////////////////////////////////////
pub struct ExactInSwapStep {
    pub dex_id: u64,
    pub asset_in: AssetId,
    pub asset_out: AssetId,
    pub receiver: Option<Identity>,
    pub data: Option<Bytes>,
}

////////////////////////////////////////////////////
// DEX ids
////////////////////////////////////////////////////
const MIRA_V1_ID: u64 = 0;

////////////////////////////////////////////////////
// Revert error codes
////////////////////////////////////////////////////
const INVALID_DEX: u64 = 0;

////////////////////////////////////////////////////
// swap functions - general
////////////////////////////////////////////////////

pub fn execute_exact_in(
    amount_in: u64,
    swap_step: ExactInSwapStep,
    resolved_receiver: Identity,
    MIRA_AMM_CONTRACT_ID: ContractId,
) -> u64 {
    match swap_step.dex_id {
        MIRA_V1_ID => execute_mira_v1_exact_in(
            amount_in,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            resolved_receiver,
            swap_step
                .data,
            MIRA_AMM_CONTRACT_ID,
        ),
        _ => revert(INVALID_DEX),
    }
}


////////////////////////////////////////////////////
// swap functions - mira v1
////////////////////////////////////////////////////

pub fn execute_mira_v1_exact_in(
    amount_in: u64,
    asset_in: AssetId,
    asset_out: AssetId,
    receiver: Identity,
    data: Option<Bytes>,
    MIRA_AMM_CONTRACT_ID: ContractId,
) -> u64 {
    // get parameters
    let (fee, is_stable) = match data {
        Option::Some(v) => get_mira_params(v),
        Option::None => (0, false),
    };

    // execute swap
    swap_mira_exact_in(
        MIRA_AMM_CONTRACT_ID,
        asset_in,
        asset_out,
        receiver,
        is_stable,
        fee,
        u64::try_from(amount_in)
            .unwrap(),
    )
}

// expect the data of 9 bytes be laid out as follows
// 8 bytes  - for the fee as u64
// 1 byte   - for a flag as u8
pub fn get_mira_params(data: Bytes) -> (u64, bool) {
    // let fee_bytes = Bytes::with_capacity(8);
    // // write to fee_bytes
    // abi_decode_in_place::<u64>(data.ptr(), 8, fee_bytes.ptr());
    // read 9th byt9 - default to `false` if not provided
    let is_stable = match data.get(8) {
        Option::Some(v) => v != 0, // check if value is nonzero
        Option::None => false,
    };
    let fee = first_le_bytes_to_u64(data);
    // return parsed fees as u64 and flag
    (fee, is_stable)
}

pub fn encode_mira_params(fee: u64, is_stable: bool) -> Bytes {
    let mut bytes = Bytes::with_capacity(65);

    // add fee parameter
    bytes.append(fee.to_le_bytes());

    // add boolean parameter
    if is_stable {
        bytes.push(1u8)
    } else {
        bytes.push(0u8)
    }

    bytes
}
// custon bytes decoder - read first 8 bytes as u64
pub fn first_le_bytes_to_u64(bytes: Bytes) -> u64 {
    // we require at least 8 bytes
    assert(bytes.len() > 7);
    let ptr = bytes.ptr();
    let a = ptr.read_byte();
    let b = (ptr.add_uint_offset(1)).read_byte();
    let c = (ptr.add_uint_offset(2)).read_byte();
    let d = (ptr.add_uint_offset(3)).read_byte();
    let e = (ptr.add_uint_offset(4)).read_byte();
    let f = (ptr.add_uint_offset(5)).read_byte();
    let g = (ptr.add_uint_offset(6)).read_byte();
    let h = (ptr.add_uint_offset(7)).read_byte();

    asm(
        a: a, b: b, c: c, d: d, e: e, f: f, g: g, h: h, i: 0x8, j: 0x10, k: 0x18,
        l: 0x20, m: 0x28, n: 0x30, o: 0x38, r1, r2, r3,
    ) {
        sll r1 h o;
        sll r2 g n;
        or r3 r1 r2;
        sll r1 f m;
        or r2 r3 r1;
        sll r3 e l;
        or r1 r2 r3;
        sll r2 d k;
        or r3 r1 r2;
        sll r1 c j;
        or r2 r3 r1;
        sll r3 b i;
        or r1 r2 r3;
        or r2 r1 a;

        r2: u64
    }
}

#[test]
fn test_get_mira_params() {
    let fee0: u64 = 30;
    let is_stable0 = true;
    let data0 = encode_mira_params(fee0, is_stable0);
    let (fee0_decoded, is_stable0_decoded) = get_mira_params(data0);

    assert_eq(fee0_decoded, fee0);
    assert_eq(is_stable0, is_stable0_decoded);

    let fee1: u64 = 213432134;
    let is_stable1 = false;

    let data1 = encode_mira_params(fee1, is_stable1);
    let (fee1_decoded, is_stable1_decoded) = get_mira_params(data1);
    assert_eq(fee1_decoded, fee1);
    assert_eq(is_stable1, is_stable1_decoded);
}
