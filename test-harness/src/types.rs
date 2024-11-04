use fuels::types::{AssetId, Bytes};
pub type PoolId = (AssetId, AssetId, bool);

pub fn encode_mira_params(fee: u64, is_stable: bool) -> Bytes {
    let feeb: [u8; 2] = (fee as u16).to_be_bytes();

    let x: [u8; 3] = if is_stable {
        [
            feeb[0], feeb[1], 1,
        ]
    } else {
        [
            feeb[0], feeb[1], 0,
        ]
    };

    Bytes(x.to_vec())
}
