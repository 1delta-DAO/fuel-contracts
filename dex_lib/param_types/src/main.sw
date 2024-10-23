library;

use std::{bytes::Bytes, bytes_conversions::{b256::*, u16::*, u256::*, u32::*, u64::*,}};


// order object
pub struct ExactInSwapStep {
    pub amount: Option<u64>,
    pub assetIn: AssetId,
    pub assetOut: AssetId,
    pub receiver: Option<Identity>,
    pub data: Option<Bytes>,
}

pub fn get_mira_params(data: Bytes) -> u64 {
    let fee = u64::from_le_bytes(data);
    fee
}