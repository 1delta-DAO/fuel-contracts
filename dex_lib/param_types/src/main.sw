library;

use std::bytes::Bytes;

// order object
pub struct ExactInSwapStep {
    pub amount: Option<u64>,
    pub assetIn: AssetId,
    pub assetOut: AssetId,
    pub data: Option<Bytes>,
}
