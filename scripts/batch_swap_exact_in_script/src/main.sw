script;

use interfaces::{data_structures::PoolId, mira_amm::MiraAMM};
use math::pool_math::get_amounts_out;
use math::pool_math::swap_mira_exact_in;
use utils::blockchain_utils::check_deadline;
use param_types::{ExactInSwapStep, get_mira_params};
use std::{asset::transfer, bytes::Bytes};

configurable {
    AMM_CONTRACT_ID: ContractId = ContractId::zero(),
}

fn main(
    amount_in: u64,
    asset_in: AssetId,
    amount_out_min: u64,
    pools: Vec<PoolId>,
    recipient: Identity,
    deadline: u32,
    path: Option<Vec<ExactInSwapStep>>,
) // -> u256
 -> (Vec<(u64, AssetId)>, u64) {
    check_deadline(deadline);

    let amounts_out = get_amounts_out(AMM_CONTRACT_ID, amount_in, asset_in, pools);
    let last_amount_out = amounts_out.get(amounts_out.len() - 1).unwrap();
    require(
        last_amount_out.0 >= amount_out_min,
        "Insufficient output amount",
    );

    transfer(Identity::ContractId(AMM_CONTRACT_ID), asset_in, amount_in);
    // let amm = abi(MiraAMM, AMM_CONTRACT_ID.into());

    let mut i = 0;
    i = 0;
    let mut amount = amount_in;
    let swap_path = match path {
        Option::Some(v) => v,
        Option::None => Vec::new(),
    };
    while i < swap_path.len() {
        let swap_step = swap_path.get(i).unwrap();
        let receiver: Identity = if i == swap_path.len() - 1 {
            recipient
        } else {
            Identity::ContractId(AMM_CONTRACT_ID)
        };
        let (fee, is_stable) = match swap_step.data {
            Option::Some(v) => get_mira_params(v),
            Option::None => (0, false),
        };
        amount = swap_mira_exact_in(
            AMM_CONTRACT_ID,
            swap_step
                .asset_in,
            swap_step
                .asset_out,
            receiver,
            is_stable,
            fee,
            u64::try_from(amount)
                .unwrap(),
        );
        i += 1;
    }

    // amount
    (amounts_out, amount)
}
