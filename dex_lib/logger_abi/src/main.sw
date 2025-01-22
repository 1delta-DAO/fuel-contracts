library;

pub struct SwapEvent {
    pub asset: AssetId,
    pub amount: u64,
}

abi Logger {
    fn dead_call();
    fn log_swap_event(asset: AssetId, amount: u64);
}