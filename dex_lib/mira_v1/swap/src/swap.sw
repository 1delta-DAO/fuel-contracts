library;

use std::{math::*, primitive_conversions::u64::*};
use utils::blockchain_utils::is_stable;
use interfaces::{data_structures::{Asset, PoolId, PoolMetadata}, mira_amm::MiraAMM};
use math::pool_math::{get_amount_out, pow_decimals, subtract_fee};

/// mira output amout calculator
pub fn swap_mira_exact_in(
    amm_contract: ContractId,
    asset_in: AssetId,
    asset_out: AssetId,
    receiver: Identity,
    is_stable_pool: bool,
    swap_fee: u64,
    amount_in: u64,
) -> u64 {
    let amm = abi(MiraAMM, amm_contract.into());
    let amount_out = if asset_in.bits() < asset_out.bits() {
        let pool_id: PoolId = (asset_in, asset_out, is_stable_pool);
        let pool_opt = amm.pool_metadata(pool_id);
        require(pool_opt.is_some(), "Pool not present");
        let pool = pool_opt.unwrap();
        // get output amount
        let am_out = get_amount_out(
            is_stable_pool,
            pool.reserve_0
                .as_u256(),
            pool.reserve_1
                .as_u256(),
            pow_decimals(pool.decimals_0),
            pow_decimals(pool.decimals_1),
            subtract_fee(amount_in, swap_fee)
                .as_u256(),
        );
        // exec swap
        amm.swap(
            pool_id,
            0,
            u64::try_from(am_out)
                .unwrap(),
            receiver,
            Option::None,
        );
        am_out
    } else {
        let pool_id: PoolId = (asset_in, asset_out, is_stable_pool);
        let pool_opt = amm.pool_metadata(pool_id);
        require(pool_opt.is_some(), "Pool not present");
        let pool = pool_opt.unwrap();
        // get output amount
        let am_out = get_amount_out(
            is_stable_pool,
            pool.reserve_1
                .as_u256(),
            pool.reserve_0
                .as_u256(),
            pow_decimals(pool.decimals_1),
            pow_decimals(pool.decimals_0),
            subtract_fee(amount_in, swap_fee)
                .as_u256(),
        );
        // exec swap
        amm.swap(
            pool_id,
            u64::try_from(am_out)
                .unwrap(),
            0,
            receiver,
            Option::None,
        );
        am_out
    };
    u64::try_from(amount_out).unwrap()
}
