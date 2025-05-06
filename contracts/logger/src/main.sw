contract;

use logger_abi::{Logger, SwapEvent};

impl Logger for Contract {
    fn dead_call() {
        // do nothing
    }

    fn log_swap_event(asset: AssetId, amount: u64) {
        log(SwapEvent { asset, amount });
    }
}
