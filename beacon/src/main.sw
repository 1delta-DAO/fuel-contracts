contract;
 
use std::execution::run_external;
use standards::src5::{AccessError, State};
use standards::src14::{SRC14, SRC14_TARGET_STORAGE, SRC14Extension};
use beacon_utils::Beacon;

/// The owner of this contract at deployment.
#[allow(dead_code)]
const INITIAL_OWNER: Identity = Identity::Address(Address::zero());
 
storage {
    /// The [ContractId] of the target contract.
    ///
    /// # Additional Information
    ///
    /// `target` is stored at sha256("storage_SRC14_0")
    target in 0x7bb458adc1d118713319a5baa00a2d049dd64d2916477d2688d76970c898cd55: ContractId = ContractId::zero(),
    /// The [State] of the proxy owner.
    owner: State = State::Initialized(INITIAL_OWNER),
}
 
impl Beacon for Contract {
    #[storage(read, write)]
    fn set_proxy_target(new_target: ContractId) {
        only_owner();
        storage.target.write(new_target);
    }
 
    #[storage(read)]
    fn proxy_target() -> Option<ContractId> {
        storage.target.try_read()
    }

    #[storage(read)]
    fn proxy_owner() -> State {
        storage.owner.read()
    }
}

#[storage(read)]
fn only_owner() {
    require(
        storage
            .owner
            .read() == State::Initialized(msg_sender().unwrap()),
        AccessError::NotOwner,
    );
}