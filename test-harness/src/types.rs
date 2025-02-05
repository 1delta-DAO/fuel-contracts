use fuels::types::{AssetId, Bits256, Bytes};
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


pub fn encode_mira_params_with_dex_address(fee: u64, is_stable: bool, address: Bits256) -> Bytes {
    let feeb: [u8; 2] = (fee as u16).to_be_bytes();

    let mut x = Vec::with_capacity(35);
    x.extend_from_slice(&feeb);
    x.push(if is_stable { 1 } else { 0 });
    x.extend_from_slice(&address.0); // Convert Bits256 to a byte slice

    Bytes(x)
}
