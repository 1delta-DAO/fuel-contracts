use fuels::types::{AssetId, Bytes};
pub type PoolId = (AssetId, AssetId, bool);

pub fn encode_mira_params(fee: u64, is_stable: bool) -> Bytes {
    let feeb: [u8; 8] = fee.to_le_bytes();

    let x: [u8; 9] = if is_stable {
        [
            feeb[0], feeb[1], feeb[2], feeb[3], feeb[4], feeb[5], feeb[6], feeb[7], 1,
        ]
    } else {
        [
            feeb[0], feeb[1], feeb[2], feeb[3], feeb[4], feeb[5], feeb[6], feeb[7], 0,
        ]
    };

    Bytes(x.to_vec())
}
