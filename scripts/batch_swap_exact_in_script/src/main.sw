script;

use interfaces::{data_structures::PoolId, mira_amm::MiraAMM};
use mira_v1_swap::swap::swap_mira_exact_in;
use utils::blockchain_utils::check_deadline;
use executor::{ExactInSwapStep, get_mira_params};
use std::{asset::transfer, bytes::Bytes};

configurable {
    AMM_CONTRACT_ID: ContractId = ContractId::zero(),
}

fn main(
    recipient: Identity,
    deadline: u32,
    path: Option<Vec<(u64, u64, Vec<ExactInSwapStep>)>>,
) {
    check_deadline(deadline);

    let mut i = 0;
    let swap_path = match path {
        Option::Some(v) => v,
        Option::None => Vec::new(),
    };

    // 
    let mut amount_cached = 0;

    // start to swap through paths
    while i < swap_path.len() {
        // get current path, input amount and amount to slippage-check
        let (current_amount_in, minimum_out, current_path) = match swap_path.get(i) {
            Option::Some(v) => v,
            Option::None => (0u64, 0u64, Vec::new()),
        };

        // get the amount to be used
        // if zero, we use the last cached amount to swap splits
        // after a single swap
        // if the cached amount is used, we reset it to zero
        let mut amount_in_used = if current_amount_in != 0 {
            current_amount_in
        } else {
            let am = amount_cached;
            // reset amount cached after it was used
            amount_cached = 0;
            am
        };

        // initialize the swap path
        let mut j = 0;

        // get path length for iteration
        let path_length = current_path.len();

        // initialize first swap step
        let mut swap_step = current_path.get(0).unwrap();
        transfer(
            Identity::ContractId(AMM_CONTRACT_ID),
            swap_step
                .asset_in,
            amount_in_used,
        );
        // start swapping the path
        while true {
            // get intermediary receiver
            let receiver: Identity = if j == path_length - 1 {
                recipient
            } else {
                Identity::ContractId(AMM_CONTRACT_ID)
            };

            //=============================================
            //      DEX swap implemnentation  
            //=============================================

            // get parameters
            let (fee, is_stable) = match swap_step.data {
                Option::Some(v) => get_mira_params(v),
                Option::None => (0, false),
            };

            // execute swap
            amount_in_used = swap_mira_exact_in(
                AMM_CONTRACT_ID,
                swap_step
                    .asset_in,
                swap_step
                    .asset_out,
                receiver,
                is_stable,
                fee,
                u64::try_from(amount_in_used)
                    .unwrap(),
            );

            //=============================================
            //      DEX swap end  
            //=============================================

            // increment index
            j += 1;

            // check if we need to continue
            if j < path_length {
                // get next swap_step
                swap_step = current_path.get(j).unwrap();
            } else {
                // in this block, we completed a path
                // we record / increment the cached amount and check for slippage
                // increment cache
                amount_cached += amount_in_used;
                // check for slippage on path
                require(amount_cached >= minimum_out, "Insufficient output amount");
                // break and start next path
                break;
            }
        }
        // increment path index
        i += 1;
    }
}
