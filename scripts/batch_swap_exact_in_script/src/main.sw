script;

use interfaces::mira_amm::MiraAMM;
use utils::blockchain_utils::check_deadline;
use executor::{BatchSwapStep, execute_exact_in, get_dex_input_receiver};
use std::asset::transfer;

////////////////////////////////////////////////////
// Error codes
////////////////////////////////////////////////////
const EMPTY_PATH_ENTRY: u64 = 100;

////////////////////////////////////////////////////
// DEX references
////////////////////////////////////////////////////
configurable {
    MIRA_AMM_CONTRACT_ID: ContractId = ContractId::from(0x2e40f2b244b98ed6b8204b3de0156c6961f98525c8162f80162fcf53eebd90e7),
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId = ContractId::from(0xd6da28183b421e336504b96bd1f8571d692222542f89c860ed1407caeb637303),
}

// Swap split paths exact in
fn main(
    swap_path: Vec<(u64, u64, bool, Vec<BatchSwapStep>)>,
    deadline: u32,
) {
    check_deadline(deadline);

    // use cached amount for split swaps
    let mut amount_cached = 0u64;

    // start to swap through paths
    let mut i = 0;
    while i < swap_path.len() {
        // get current path, input amount, slippage_check, transfer_in flag and path
        let (current_amount_in, minimum_out, transfer_in, current_path) = match swap_path.get(i) {
            Option::Some(v) => v,
            Option::None => revert(EMPTY_PATH_ENTRY),
        };

        // get the amount to be used
        // if zero, we use the last cached amount to swap splits
        // after a single swap
        // if the cached amount is used, we reset it to zero
        let mut amount_in_used = if current_amount_in != 0 {
            current_amount_in
        } else {
            // TEMP: make sure that assignment is via values
            let am = amount_cached + 0;
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

        // transfer to first DEX if needed
        if transfer_in {
            transfer(
                get_dex_input_receiver(
                    swap_step
                        .dex_id,
                    MIRA_AMM_CONTRACT_ID,
                    ONE_DELTA_ORDERS_CONTRACT_ID,
                ),
                swap_step
                    .asset_in,
                amount_in_used,
            );
        }
        // start swapping the path
        while true {
            //=============================================
            //      DEX swap execution  
            //=============================================

            // execute swap
            amount_in_used = execute_exact_in(
                u64::try_from(amount_in_used)
                    .unwrap(),
                swap_step,
                MIRA_AMM_CONTRACT_ID,
                ONE_DELTA_ORDERS_CONTRACT_ID,
            );

            //=============================================
            //      DEX swap end  
            //=============================================

            // increment swap step index within path
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
                require(amount_in_used > minimum_out, "Insufficient output amount");
                // break and start next path
                break;
            }
        }
        // increment path index
        i += 1;
    }
}
