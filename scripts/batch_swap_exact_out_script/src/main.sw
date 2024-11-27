script;

use executor::{BatchSwapStep, calculate_amounts_exact_out_and_fund, forward_swap_exact_out};
use utils::blockchain_utils::check_deadline;
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
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId = ContractId::from(0xf6caa75386fe9ba4da15b82723ecffb0d56b28ae7ece396b15c5650b605359ac),
}

fn main(
    swap_path: Vec<(u64, u64, bool, Vec<BatchSwapStep>)>,
    deadline: u32,
) {
    check_deadline(deadline);

    let mut i = 0;
    while i < swap_path.len() {
        let (current_amount_out, minimum_out, _, current_path) = match swap_path.get(i) {
            Option::Some(v) => v,
            Option::None => revert(EMPTY_PATH_ENTRY),
        };
        // compute path input amounts
        let amounts_in = calculate_amounts_exact_out_and_fund(
            current_amount_out,
            minimum_out,
            current_path,
            MIRA_AMM_CONTRACT_ID,
            ONE_DELTA_ORDERS_CONTRACT_ID,
        );
        // swap amounts forward
        forward_swap_exact_out(
            current_path,
            amounts_in,
            MIRA_AMM_CONTRACT_ID,
            ONE_DELTA_ORDERS_CONTRACT_ID,
        );
        i += 1;
    }
}
