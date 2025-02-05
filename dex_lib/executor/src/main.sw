library;

use std::{
    asset::transfer,
    b512::B512,
    bytes::Bytes,
    bytes_conversions::{
        b256::*,
        u16::*,
        u256::*,
        u32::*,
        u64::*,
    },
    revert::revert,
};
use mira_v1_swap::swap::{get_mira_amount_in, swap_mira_exact_in, swap_mira_exact_out,};
use order_utils::structs::{Order,};
use order_utils::{compute_taker_fill_amount, OneDeltaOrders,};
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

////////////////////////////////////////////////////
// DEX ids
////////////////////////////////////////////////////
const MIRA_V1_ID: u64 = 0;
const ONE_DELTA_ORDERS_ID: u64 = 100;

////////////////////////////////////////////////////
// Revert error codes
////////////////////////////////////////////////////
const INVALID_DEX = 1u64;
const ORDER_OUTPUT_TOO_HIGH = 2u64;
const ORDER_INCOMPLETE_FILL = 3u64;

////////////////////////////////////////////////////
// swap functions - general
////////////////////////////////////////////////////

pub fn execute_exact_in(
    amount_in: u64,
    swap_step: BatchSwapStep,
    MIRA_AMM_CONTRACT_ID: ContractId,
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId,
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
        ONE_DELTA_ORDERS_ID => execute_one_delta_orders_exact_in(
            amount_in,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            swap_step
                .receiver,
            swap_step
                .data,
            ONE_DELTA_ORDERS_CONTRACT_ID,
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
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId,
) -> Vec<u64> {
    // this is list of the amounts used to parametrize 
    // the swap 
    // this has to be the output amount for Mira
    // andn the input amount for orders
    let mut amounts: Vec<u64> = Vec::new();
    let mut current_amount_out = amount_out;

    // record maximum index
    let max_index = current_path.len() - 1;

    // start at zero which is the LAST pool to swap
    let mut i = 0;
    let mut swap_step = current_path.get(i).unwrap();

    // require(false, current_amount_out);
    // do all steps but the last one
    while true {
        match swap_step.dex_id {
            MIRA_V1_ID => {
                let (fee, is_stable, amm_contract_id) = get_mira_like_params(swap_step.data, MIRA_AMM_CONTRACT_ID);
                // calculate input amount
                let amount_in = get_mira_amount_in(
                    amm_contract_id,
                    swap_step
                        .asset_in,
                    swap_step
                        .asset_out,
                    is_stable,
                    fee,
                    current_amount_out,
                );
                // insert the LAST amount out that is used for the swap 
                amounts.push(current_amount_out);
                current_amount_out = amount_in;
            },
            ONE_DELTA_ORDERS_ID => {
                let amount_in = quote_order_exact_out(swap_step.data, current_amount_out);
                // for orders, we need the amount_in here
                amounts.push(amount_in);
                current_amount_out = amount_in;
            },
            _ => revert(INVALID_DEX),
        }
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
        get_dex_input_receiver(
            swap_step
                .dex_id,
            swap_step
                .data,
            MIRA_AMM_CONTRACT_ID,
            ONE_DELTA_ORDERS_CONTRACT_ID,
        ),
        swap_step
            .asset_in,
        current_amount_out,
    );
    amounts
}

// temporary to forward-swap exact out
pub fn forward_swap_exact_out(
    current_path: Vec<BatchSwapStep>,
    computed_amounts: Vec<u64>,
    MIRA_AMM_CONTRACT_ID: ContractId,
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId,
) {
    let path_length = current_path.len();
    let mut i = path_length - 1;
    while true {
        let swap_step = current_path.get(i).unwrap();
        let current_amount = computed_amounts.get(i).unwrap();
        match swap_step.dex_id {
            MIRA_V1_ID => {
                let (is_stable, amm_contract) = get_mira_is_stable_and_pool(swap_step.data, MIRA_AMM_CONTRACT_ID);
                let (amount0, amount1, pool_id) = if swap_step.asset_in.bits() < swap_step.asset_out.bits() {
                    (0u64, current_amount, (swap_step.asset_in, swap_step.asset_out, is_stable))
                } else {
                    (current_amount, 0u64, (swap_step.asset_out, swap_step.asset_in, is_stable))
                };
                // execute_exact_out
                swap_mira_exact_out(
                    pool_id,
                    swap_step
                        .receiver,
                    amount0,
                    amount1,
                    amm_contract,
                );
            },
            ONE_DELTA_ORDERS_ID => {
                execute_one_delta_orders_exact_in(
                    current_amount,
                    swap_step
                        .asset_in,
                    swap_step
                        .asset_out,
                    swap_step
                        .receiver,
                    swap_step
                        .data,
                    ONE_DELTA_ORDERS_CONTRACT_ID,
                );
            },
            _ => revert(INVALID_DEX),
        }
        if i != 0 { i -= 1; } else { break; }
    };
}

// // cannot work with this forc version as recursive functions are not supported
// pub fn execute_exact_out_recursive(
//     receiver: Identity,
//     ref mut current_amount_out: u64,
//     maximum_in: u64,
//     ref mut current_path: Vec<BatchSwapStep>,
//     MIRA_AMM_CONTRACT_ID: ContractId,
// ) {
//     // start to swap through paths

//     // initialize first swap step
//     let swap_step = current_path.remove(0);

//     // start swapping the path
//     match swap_step.dex_id {
//         MIRA_V1_ID => {
//             // get parameters
//             let (fee, is_stable) = get_mira_params(swap_step.data);

//             let (pool_id, amount_in, zero_for_one) = get_mira_amount_in(
//                 MIRA_AMM_CONTRACT_ID,
//                 swap_step
//                     .asset_in,
//                 swap_step
//                     .asset_out,
//                 is_stable,
//                 fee,
//                 current_amount_out,
//             );

//             // if we still have a swap step left, we remove the current one and continue
//             if current_path.len() > 1 {
//                 //  UNSUPPORTED - Recursive
//                 execute_exact_out_recursive(
//                     Identity::ContractId(MIRA_AMM_CONTRACT_ID),
//                     amount_in,
//                     maximum_in,
//                     current_path,
//                     MIRA_AMM_CONTRACT_ID,
//                 );
//             } else {
//             // check slippage
//             require(amount_in <= maximum_in, "Exceeding input amount");
//             // otherwise, we fund the swap
//             transfer(
//                 Identity::ContractId(MIRA_AMM_CONTRACT_ID),
//                 swap_step
//                     .asset_in,
//                 amount_in,
//             );
//         }
//             let (amount0, amount1) = if zero_for_one {
//                 (0u64, current_amount_out)
//             } else {
//                 (current_amount_out, 0u64)
//             };
//             // execute_exact_out
//             swap_mira_exact_out(pool_id, receiver, amount0, amount1, MIRA_AMM_CONTRACT_ID);
//         },
//         _ => revert(INVALID_DEX),
//     };
// }

////////////////////////////////////////////////////
// get dex address
////////////////////////////////////////////////////
pub fn get_dex_input_receiver(
    dex_id: u64,
    params: Bytes,
    MIRA_AMM_CONTRACT_ID: ContractId,
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId,
) -> Identity {
    match dex_id {
        MIRA_V1_ID => Identity::ContractId(get_mira_like_pool(params, MIRA_AMM_CONTRACT_ID)),
        ONE_DELTA_ORDERS_ID => Identity::ContractId(ONE_DELTA_ORDERS_CONTRACT_ID),
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
    let (fee, is_stable, amm_contract) = get_mira_like_params(data, MIRA_AMM_CONTRACT_ID);

    // execute swap
    swap_mira_exact_in(
        amm_contract,
        asset_in,
        asset_out,
        receiver,
        is_stable,
        fee,
        u64::try_from(amount_in)
            .unwrap(),
    )
}

pub fn execute_one_delta_orders_exact_in(
    amount_in: u64,
    asset_in: AssetId,
    asset_out: AssetId,
    receiver: Identity,
    data: Bytes,
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId,
) -> u64 {
    // decode order and signature
    let (order, signature) = to_order(data, asset_in, asset_out);

    // execute order fill
    let (taker_fill_amount, maker_fill_amount) = abi(OneDeltaOrders, ONE_DELTA_ORDERS_CONTRACT_ID.into()).fill(order, signature, amount_in, receiver, Option::None);

    // reject incomplete fills
    if taker_fill_amount < amount_in {
        revert(ORDER_INCOMPLETE_FILL);
    }

    // maker_fill_amount is the amount received, ergo the output amount  
    maker_fill_amount
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_like_params(
    data: Bytes,
    MIRA_AMM_CONTRACT_ID: ContractId,
) -> (u64, bool, ContractId) {
    match data.len() {
        3 => {
            let (fee, is_stable) = get_mira_params(data);
            (fee, is_stable, MIRA_AMM_CONTRACT_ID)
        },
        35 => {
            let (fee, is_stable, forked_pool) = get_mira_and_fork_params(data);
            (fee, is_stable, ContractId::from(forked_pool))
        },
        _ => revert(INVALID_DEX),
    }
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_like_pool(data: Bytes, MIRA_AMM_CONTRACT_ID: ContractId) -> ContractId {
    match data.len() {
        3 => {
            MIRA_AMM_CONTRACT_ID
        },
        35 => {
            let (_, pool_id) = data.split_at(3);
            // return parsed fees as u64 and flag
           ContractId::from(b256::from_be_bytes(pool_id))
        },
        _ => revert(INVALID_DEX),
    }
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_params(data: Bytes) -> (u64, bool) {
    // let fee_bytes = Bytes::with_capacity(8);
    // // write to fee_bytes
    // abi_decode_in_place::<u64>(data.ptr(), 8, fee_bytes.ptr());
    // read 3rd byte - default to `false` if not provided
    let is_stable = get_mira_is_stable(data);
    let fee = u64::from(first_be_bytes_to_u16(data));
    // return parsed fees as u64 and flag
    (fee, is_stable)
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_and_fork_params(data: Bytes) -> (u64, bool, b256) {
    // let fee_bytes = Bytes::with_capacity(8);
    // // write to fee_bytes
    // abi_decode_in_place::<u64>(data.ptr(), 8, fee_bytes.ptr());
    // read 3rd byte - default to `false` if not provided
    let (fee_data, pool_id) = data.split_at(3);
    let is_stable = get_mira_is_stable(fee_data);
    let fee = u64::from(first_be_bytes_to_u16(fee_data));
    // return parsed fees as u64 and flag
    (fee, is_stable, b256::from_be_bytes(pool_id))
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_is_stable(data: Bytes) -> bool {
    // read 3rd byte - default to `false` if not provided
    match data.get(2) {
        Option::Some(v) => v != 0, // check if value is nonzero
        Option::None => false,
    }
}

// expect the data of 3 bytes be laid out as follows
// 2 bytes  - for the fee as u16
// 1 byte   - for a flag as u8
pub fn get_mira_is_stable_and_pool(data: Bytes, MIRA_AMM_CONTRACT_ID: ContractId) -> (bool, ContractId) {
    // read 3rd byte - default to `false` if not provided
   let is_stable = match data.get(2) {
        Option::Some(v) => v != 0, // check if value is nonzero
        Option::None => false,
    };
        match data.len() {
        3 => {
            (is_stable, MIRA_AMM_CONTRACT_ID)
        },
        35 => {
            let (_, pool_id) = data.split_at(3);
            // return parsed fees as u64 and flag
           (is_stable, ContractId::from(b256::from_be_bytes(pool_id)))
        },
        _ => revert(INVALID_DEX),
    }
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

pub fn encode_mira_and_fork_params(fee: u16, is_stable: bool, forked_pool: b256) -> Bytes {
    let mut bytes = Bytes::with_capacity(49);

    // add fee parameter
    bytes.append(fee.to_be_bytes());

    // add boolean parameter
    if is_stable {
        bytes.push(1u8)
    } else {
        bytes.push(0u8)
    }

    bytes.append(forked_pool.to_be_bytes());

    bytes
}

////////////////////////////////////////////////////
// decoding functions
////////////////////////////////////////////////////

// custon bytes decoder - read first 2 bytes as u16
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

// The struct looks as follows
// struct Order {
//     pub maker_asset: b256,
//     pub taker_asset: b256,
//     pub maker_amount: u64,
//     pub taker_amount: u64,
//     pub maker: b256,
//     pub nonce: u64,
//     pub expiry: u32,
// }

// converts encoded order and signature to parameters
// order will actually map
//      asset_in  -> taker_asset
//      asset_out -> maker_asset
// we iteratively apply bytes splits
pub fn to_order(bytes: Bytes, asset_in: AssetId, asset_out: AssetId) -> (Order, B512) {
    let (maker_amount_bytes, rest) = bytes.split_at(8);
    let (taker_amount_bytes, rest) = rest.split_at(8);
    let (maker_bytes, rest) = rest.split_at(32);
    let (nonce_bytes, rest) = rest.split_at(8);
    let (maker_traits_bytes, rest) = rest.split_at(8);
    let (maker_receiver_bytes, rest) = rest.split_at(32);

    // signature_a together with rest will form the B512 signature
    let (signature_a_bytes, rest) = rest.split_at(32); // the rest is now the signature
    let signature = B512::from((b256::from_be_bytes(signature_a_bytes), b256::from_be_bytes(rest)));
    (
        Order {
            maker_asset: asset_out.bits(),
            taker_asset: asset_in.bits(),
            maker_amount: u64::from_be_bytes(maker_amount_bytes),
            taker_amount: u64::from_be_bytes(taker_amount_bytes),
            maker: b256::from_be_bytes(maker_bytes),
            nonce: u64::from_be_bytes(nonce_bytes),
            maker_traits: u64::from_be_bytes(maker_traits_bytes),
            maker_receiver: b256::from_be_bytes(maker_receiver_bytes),
        },
        signature,
    )
}

// quote an order exact out
pub fn quote_order_exact_out(bytes: Bytes, amount_out: u64) -> u64 {
    // we only read the two first fields in the order
    let (maker_amount_bytes, rest) = bytes.split_at(8);
    let (taker_amount_bytes, _) = rest.split_at(8);
    let maker_amount = u64::from_be_bytes(maker_amount_bytes);
    let taker_amount = u64::from_be_bytes(taker_amount_bytes);

    // revert if the requested amount is higher than the 
    // maker_amount
    if amount_out > maker_amount {
        revert(ORDER_OUTPUT_TOO_HIGH);
    };
    // compute the taker_amount (assuming partial fills)
    let taker_amount_computed = compute_taker_fill_amount(amount_out, maker_amount, taker_amount);
    // if the computed taker amount is too large (typically because of rounding),
    // we just fall back to taker_amount
    if taker_amount_computed > taker_amount {
        taker_amount
    } else {
        taker_amount_computed
    }
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
fn test_get_mira_fork_params() {
    let fee0: u16 = 30;
    let is_stable0 = true;
    let pool0: b256 = 0x7c293b054938bedca41354203be4c08aec2c3466412cac803f4ad62abf22e476;
    let data0 = encode_mira_and_fork_params(fee0, is_stable0, pool0);
    let (fee0_decoded, is_stable0_decoded, pool0_decodod) = get_mira_and_fork_params(data0);
    assert_eq(fee0_decoded, u64::from(fee0));
    assert_eq(is_stable0, is_stable0_decoded);
    assert_eq(pool0_decodod, pool0);

    let fee1: u16 = 65533;
    let is_stable1 = false;

    let data1 = encode_mira_and_fork_params(fee1, is_stable1, pool0);
    let (fee1_decoded, is_stable1_decoded, pool1_decodod) = get_mira_and_fork_params(data1);
    assert_eq(fee1_decoded, u64::from(fee1));
    assert_eq(is_stable1, is_stable1_decoded);
    assert_eq(pool1_decodod, pool0);

    // fee as zero
    let fee2: u16 = 0;
    let is_stable2 = true;

    let data2 = encode_mira_and_fork_params(fee2, is_stable2, pool0);
    let (fee2_decoded, is_stable2_decoded, pool2_decodod) = get_mira_and_fork_params(data2);
    assert_eq(fee2_decoded, u64::from(fee2));
    assert_eq(is_stable2, is_stable2_decoded);
    assert_eq(pool2_decodod, pool0);
}

#[test]
fn test_get_order_params() {
    let asset_in: b256 = 0x4d3a44b2e2e53a5a452f3acac85bdd4f0e38a170a5cfbe4dfce2c79bf21a0f07;
    let asset_out: b256 = 0xa1e88e8fba0e93b94bee471d7447dcc86967389e0a8bf875a0f638c631627127;
    let maker: b256 = 0x0f46587a870bbffb7f00e5fbfbc967476388521e1378ab9c0693667a1a5adb94;
    let maker_receiver: b256 = 0xeed3d84616553b7cfaa8330d72107e536fe17db136d9caab6304fbd1336f63f8;
    let maker_amount = 7843213424u64;
    let taker_amount = 32758324u64;
    let nonce = 89u64;
    let maker_traits = 9999u64;

    let signature_a: b256 = 0x2da47aa4d7bacc8a8456ea19a0588af9dbb24bd352d44918690741a9b42dfbf0;
    let signature_b: b256 = 0x3d2e76594460054f00b86bfc43a944b8c7b739d2b604137aa427372819a2ee42;

    let signature_expected = B512::from((signature_a, signature_b));

    let mut encoded_order: Bytes = maker_amount.to_be_bytes();
    encoded_order.append(taker_amount.to_be_bytes());
    encoded_order.append(maker.to_be_bytes());
    encoded_order.append(nonce.to_be_bytes());
    encoded_order.append(maker_traits.to_be_bytes());
    encoded_order.append(maker_receiver.to_be_bytes());
    // signature
    encoded_order.append(signature_a.to_be_bytes());
    encoded_order.append(signature_b.to_be_bytes());

    let (order, signature) = to_order(
        encoded_order,
        AssetId::from(asset_in),
        AssetId::from(asset_out),
    );

    assert_eq(order.taker_asset, asset_in);
    assert_eq(order.maker_asset, asset_out);
    assert_eq(order.maker, maker);
    assert_eq(order.nonce, nonce);
    assert_eq(order.maker_traits, maker_traits);
    assert_eq(order.taker_amount, taker_amount);
    assert_eq(order.maker_amount, maker_amount);
    assert_eq(signature, signature_expected);
}
