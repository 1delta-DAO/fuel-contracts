contract;

use std::execution::run_external;
use beacon_utils::Beacon;

/// A rather minimalistic interface
abi AccountProxy {
    #[storage(read)]
    fn proxy_target() -> ContractId;
}

/// the beacon is a configurable
configurable {
    BEACON: b256 = b256::zero(),
}

/// Note that the beacon AccountProxy has no storage itself
/// as proxy ownership is managed by the beacon.
impl AccountProxy for Contract {
    #[storage(read)]
    fn proxy_target() -> ContractId {
        abi(Beacon, BEACON).beacon_target()
    }
}

#[fallback]
#[storage(read)]
fn fallback() {
    // pass through any other method call to the target
    run_external(abi(Beacon, BEACON).beacon_target())
}
