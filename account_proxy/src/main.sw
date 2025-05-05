contract;
 
use std::execution::run_external;
use standards::src5::{AccessError, State};
use standards::src14::{SRC14, SRC14_TARGET_STORAGE, SRC14Extension};
use beacon_utils::Beacon;

abi AccountProxy {
    #[storage(read)]
    fn proxy_target() -> Option<ContractId>;
}

storage {
        /// The [ContractId] of the beacon contract.
        /// Provides the target implementation contract via the `proxy_target` selector
        ///
        /// # Additional Information
        ///
        /// `target` is stored at sha256("storage_SRC14_0")
        target in 0x7bb458adc1d118713319a5baa00a2d049dd64d2916477d2688d76970c898cd55: ContractId = ContractId::zero(),
}
 
impl AccountProxy for Contract {
    #[storage(read)]
    fn proxy_target() -> Option<ContractId> {
        Some(abi(Beacon, storage.target.read().into()).proxy_target().unwrap())
    }
}

#[fallback]
#[storage(read)]
fn fallback() {
    // pass through any other method call to the target
    run_external(abi(Beacon, storage.target.read().into()).proxy_target().unwrap())
}