library;
use std::{b512::B512,};
use std::{bytes::Bytes, bytes_conversions::{b256::*, u16::*, u256::*, u32::*, u64::*},};
use std::revert::revert;
use std::asset::transfer;
use core::raw_slice::*;
use core::codec::abi_decode_in_place;
use mira_v1_swap::swap::{get_mira_amount_in, swap_mira_exact_in, swap_mira_exact_out,};
use order_utils::structs::{RfqOrder,};
use order_utils::{OneDeltaRfq,};
use interfaces::{data_structures::PoolId,};

////////////////////////////////////////////////////
// structs
////////////////////////////////////////////////////
pub struct BatchSwapStep {
    pub dex_id: u64,
    pub asset_in: AssetId,
    pub asset_out: AssetId,
    pub receiver: Identity,
    pub data: Bytes,
}

pub struct ComputedAmount {
    pub zero_for_one: bool,
    pub amount_out: u64,
    pub pool_id: PoolId,
}

////////////////////////////////////////////////////
// DEX ids
////////////////////////////////////////////////////
const MIRA_V1_ID: u64 = 0;
const ONE_DELTA_RFQ_ID: u64 = 100;

////////////////////////////////////////////////////
// Revert error codes
////////////////////////////////////////////////////
const INVALID_DEX: u64 = 1;

////////////////////////////////////////////////////
// swap functions - general
////////////////////////////////////////////////////

pub fn execute_exact_in(
    amount_in: u64,
    swap_step: BatchSwapStep,
    MIRA_AMM_CONTRACT_ID: ContractId,
    ONE_DELTA_RFQ_CONTRACT_ID: ContractId,
) -> u64 {
    match swap_step.dex_id {
        MIRA_V1_ID => execute_mira_v1_exact_in(
            amount_in,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            swap_step
                .receiver,
            swap_step
                .data,
            MIRA_AMM_CONTRACT_ID,
        ),
        ONE_DELTA_RFQ_ID => execute_one_delta_rfq_exact_in(
            amount_in,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            swap_step
                .receiver,
            swap_step
                .data,
            ONE_DELTA_RFQ_CONTRACT_ID,
        ),
        _ => revert(INVALID_DEX),
    }
}

// temporary function to calculate swap input amounts
pub fn calculate_amounts_exact_out_and_fund(
    amount_out: u64,
    maximum_in: u64,
    current_path: Vec<BatchSwapStep>,
    MIRA_AMM_CONTRACT_ID: ContractId,
) -> Vec<ComputedAmount> {
    // this is list of the amounts used to parametrize 
    // the swap - this has to be the output amount list 
    // for Mira 
    let mut amounts: Vec<ComputedAmount> = Vec::new();
    let mut current_amount_out = amount_out;

    // record maximum index
    let max_index = current_path.len() - 1;

    // start at zero which is the LAST pool to swap
    let mut i = 0;
    let mut swap_step = current_path.get(i).unwrap();

    // require(false, current_amount_out);
    // do all steps but the last one
    while true {
        let (fee, is_stable) = get_mira_params(swap_step.data);
        // calculate input amount
        let (pool_id, amount_in, zero_for_one) = get_mira_amount_in(
            MIRA_AMM_CONTRACT_ID,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            is_stable,
            fee,
            current_amount_out,
        );
        // insert the LAST amount out that is used for the swap 
        amounts.push(ComputedAmount {
            zero_for_one: zero_for_one,
            amount_out: current_amount_out,
            pool_id: pool_id,
        });
        current_amount_out = amount_in + 0;

        if i == max_index {
            break;
        } else {
            i += 1;
            swap_step = current_path.get(i).unwrap();
        };
    };

    // check slippage
    require(current_amount_out <= maximum_in, "Exceeding input amount");
    // transfer first funds
    transfer(
        Identity::ContractId(MIRA_AMM_CONTRACT_ID),
        swap_step
            .asset_in,
        current_amount_out,
    );
    amounts
}

// temporary to forward-swap exact out
pub fn forward_swap_exact_out(
    current_path: Vec<BatchSwapStep>,
    computed_amounts: Vec<ComputedAmount>,
    MIRA_AMM_CONTRACT_ID: ContractId,
) {
    let path_length = current_path.len();
    let mut i = path_length - 1;
    while true {
        let swap_step = current_path.get(i).unwrap();
        let current_amount = computed_amounts.get(i).unwrap();

        let (amount0, amount1) = if current_amount.zero_for_one {
            (0u64, current_amount.amount_out)
        } else {
            (current_amount.amount_out, 0u64)
        };
        // execute_exact_out
        swap_mira_exact_out(
            current_amount
                .pool_id,
            swap_step
                .receiver,
            amount0,
            amount1,
            MIRA_AMM_CONTRACT_ID,
        );

        if i != 0 { i -= 1; } else { break; }
    };
}

// cannot work with this forc version as recursive functions are not supported
pub fn execute_exact_out_recursive(
    receiver: Identity,
    ref mut current_amount_out: u64,
    maximum_in: u64,
    ref mut current_path: Vec<BatchSwapStep>,
    MIRA_AMM_CONTRACT_ID: ContractId,
) {
    // start to swap through paths

    // initialize first swap step
    let swap_step = current_path.remove(0);

    // start swapping the path
    match swap_step.dex_id {
        MIRA_V1_ID => {
            // get parameters
            let (fee, is_stable) = get_mira_params(swap_step.data);

            let (pool_id, amount_in, zero_for_one) = get_mira_amount_in(
                MIRA_AMM_CONTRACT_ID,
                swap_step
                    .asset_in,
                swap_step
                    .asset_out,
                is_stable,
                fee,
                current_amount_out,
            );

            // if we still have a swap step left, we remove the current one and continue
            if current_path.len() > 1 {
                //  UNSUPPORTED - Recursive
                // execute_exact_out_recursive(
                //     Identity::ContractId(MIRA_AMM_CONTRACT_ID),
                //     amount_in,
                //     maximum_in,
                //     current_path,
                //     MIRA_AMM_CONTRACT_ID,
                // );
            } else {
            // check slippage
            require(amount_in <= maximum_in, "Exceeding input amount");
            // otherwise, we fund the swap
            transfer(
                Identity::ContractId(MIRA_AMM_CONTRACT_ID),
                swap_step
                    .asset_in,
                amount_in,
            );
        }
            let (amount0, amount1) = if zero_for_one {
                (0u64, current_amount_out)
            } else {
                (current_amount_out, 0u64)
            };
            // execute_exact_out
            swap_mira_exact_out(pool_id, receiver, amount0, amount1, MIRA_AMM_CONTRACT_ID);
        },
        _ => revert(INVALID_DEX),
    };
}

////////////////////////////////////////////////////
// get dex address
////////////////////////////////////////////////////
pub fn get_dex_input_receiver(
    dex_id: u64,
    MIRA_AMM_CONTRACT_ID: ContractId,
    ONE_DELTA_RFQ_CONTRACT_ID: ContractId,
) -> Identity {
    match dex_id {
        MIRA_V1_ID => Identity::ContractId(MIRA_AMM_CONTRACT_ID),
        ONE_DELTA_RFQ_ID => Identity::ContractId(ONE_DELTA_RFQ_CONTRACT_ID),
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
    data: Bytes,
    MIRA_AMM_CONTRACT_ID: ContractId,
) -> u64 {
    // get parameters
    let (fee, is_stable) = get_mira_params(data);

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

pub fn execute_one_delta_rfq_exact_in(
    amount_in: u64,
    asset_in: AssetId,
    asset_out: AssetId,
    receiver: Identity,
    data: Bytes,
    ONE_DELTA_RFQ_CONTRACT_ID: ContractId,
) -> u64 {
    // decode order and signature
    let (order, signature) = to_rfq_order(data, asset_in, asset_out);

    // execute order fill
    let (maker_amount, _) = abi(OneDeltaRfq, ONE_DELTA_RFQ_CONTRACT_ID.into()).fill_funded(order, signature, amount_in, receiver, Option::None);

    // maker_amount is the amount received, ergo the output amount  
    maker_amount
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_params(data: Bytes) -> (u64, bool) {
    // let fee_bytes = Bytes::with_capacity(8);
    // // write to fee_bytes
    // abi_decode_in_place::<u64>(data.ptr(), 8, fee_bytes.ptr());
    // read 3rd byte - default to `false` if not provided
    let is_stable = match data.get(2) {
        Option::Some(v) => v != 0, // check if value is nonzero
        Option::None => false,
    };
    let fee = u64::from(first_be_bytes_to_u16(data));
    // return parsed fees as u64 and flag
    (fee, is_stable)
}

////////////////////////////////////////////////////
// encoding functions (mainly for tests)
////////////////////////////////////////////////////


pub fn encode_mira_params(fee: u16, is_stable: bool) -> Bytes {
    let mut bytes = Bytes::with_capacity(17);

    // add fee parameter
    bytes.append(fee.to_be_bytes());

    // add boolean parameter
    if is_stable {
        bytes.push(1u8)
    } else {
        bytes.push(0u8)
    }

    bytes
}

////////////////////////////////////////////////////
// decoding functions
////////////////////////////////////////////////////

// custon bytes decoder - read first 2 bytes as u16
pub fn first_le_bytes_to_u16(bytes: Bytes) -> u16 {
    assert(bytes.len() > 1);
    let ptr = bytes.ptr();
    let a = ptr.read_byte();
    let b = (ptr.add_uint_offset(1)).read_byte();
    let i = 0x8;
    asm(a: a, b: b, i: i, r1) {
        sll r1 b i;
        or r1 a r1;
        r1: u16
    }
}

pub fn first_be_bytes_to_u16(bytes: Bytes) -> u16 {
    assert(bytes.len() > 1);
    let ptr = bytes.ptr();
    let a = ptr.read_byte();
    let b = (ptr.add_uint_offset(1)).read_byte();

    asm(a: a, b: b, i: 0x8, r1) {
        sll r1 a i;
        or r1 r1 b;
        r1: u16
    }
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

// The struct looks as follows
// struct RfqOrder {
//     pub maker_asset: b256,
//     pub taker_asset: b256,
//     pub maker_amount: u64,
//     pub taker_amount: u64,
//     pub maker: b256,
//     pub nonce: u64,
//     pub expiry: u32,
// }

// converts encoded rfq order and signature to parameters
// rfq order will actually map
//      asset_in  -> taker_asset
//      asset_out -> maker_asset
// we iteratively apply bytes splits
pub fn to_rfq_order(bytes: Bytes, asset_in: AssetId, asset_out: AssetId) -> (RfqOrder, B512) {
    let (maker_amount_bytes, rest) = bytes.split_at(8);
    let (taker_amount_bytes, rest) = rest.split_at(8);
    let (maker_bytes, rest) = rest.split_at(32);
    let (nonce_bytes, rest) = rest.split_at(8);
    let (expiry_bytes, rest) = rest.split_at(4);

    // signature_a together with rest will form the B512 signature
    let (signature_a_bytes, rest) = rest.split_at(32); // the rest is now the signature

    // convert remaining order fields
    let maker_amount = u64::from_be_bytes(maker_amount_bytes);
    let taker_amount = u64::from_be_bytes(taker_amount_bytes);
    let maker = b256::from_be_bytes(maker_bytes);
    let nonce = u64::from_be_bytes(nonce_bytes);
    let expiry = u32::from_be_bytes(expiry_bytes);

    let signature = B512::from((b256::from_be_bytes(signature_a_bytes), b256::from_be_bytes(rest)));
    (
        RfqOrder {
            maker_asset: asset_out.bits(),
            taker_asset: asset_in.bits(),
            maker_amount,
            taker_amount,
            maker,
            nonce,
            expiry,
        },
        signature,
    )
}

#[test]
fn test_get_mira_params() {
    let fee0: u16 = 30;
    let is_stable0 = true;
    let data0 = encode_mira_params(fee0, is_stable0);
    let (fee0_decoded, is_stable0_decoded) = get_mira_params(data0);
    assert_eq(fee0_decoded, u64::from(fee0));
    assert_eq(is_stable0, is_stable0_decoded);

    let fee1: u16 = 65533;
    let is_stable1 = false;

    let data1 = encode_mira_params(fee1, is_stable1);
    let (fee1_decoded, is_stable1_decoded) = get_mira_params(data1);
    assert_eq(fee1_decoded, u64::from(fee1));
    assert_eq(is_stable1, is_stable1_decoded);

    // fee as zero
    let fee2: u16 = 0;
    let is_stable2 = true;

    let data2 = encode_mira_params(fee2, is_stable2);
    let (fee2_decoded, is_stable2_decoded) = get_mira_params(data2);
    assert_eq(fee2_decoded, u64::from(fee2));
    assert_eq(is_stable2, is_stable2_decoded);
}

#[test]
fn test_get_rfq_params() {
    let asset_in: b256 = 0x4d3a44b2e2e53a5a452f3acac85bdd4f0e38a170a5cfbe4dfce2c79bf21a0f07;
    let asset_out: b256 = 0xa1e88e8fba0e93b94bee471d7447dcc86967389e0a8bf875a0f638c631627127;
    let maker: b256 = 0x0f46587a870bbffb7f00e5fbfbc967476388521e1378ab9c0693667a1a5adb94;
    let maker_amount = 7843213424u64;
    let taker_amount = 32758324u64;
    let nonce = 89u64;
    let expiry = 9999u32;

    let signature_a: b256 = 0x2da47aa4d7bacc8a8456ea19a0588af9dbb24bd352d44918690741a9b42dfbf0;
    let signature_b: b256 = 0x3d2e76594460054f00b86bfc43a944b8c7b739d2b604137aa427372819a2ee42;

    let signature_expected = B512::from((signature_a, signature_b));

    let mut encoded_order: Bytes = maker_amount.to_be_bytes();
    encoded_order.append(taker_amount.to_be_bytes());
    encoded_order.append(maker.to_be_bytes());
    encoded_order.append(nonce.to_be_bytes());
    encoded_order.append(expiry.to_be_bytes());
    // signature
    encoded_order.append(signature_a.to_be_bytes());
    encoded_order.append(signature_b.to_be_bytes());

    let (order, signature) = to_rfq_order(
        encoded_order,
        AssetId::from(asset_in),
        AssetId::from(asset_out),
    );

    assert_eq(order.taker_asset, asset_in);
    assert_eq(order.maker_asset, asset_out);
    assert_eq(order.maker, maker);
    assert_eq(order.nonce, nonce);
    assert_eq(order.expiry, expiry);
    assert_eq(order.taker_amount, taker_amount);
    assert_eq(order.maker_amount, maker_amount);
    assert_eq(signature, signature_expected);
}
