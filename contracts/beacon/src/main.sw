contract;

use std::execution::run_external;
use standards::src5::{AccessError, State};
use standards::src14::{SRC14, SRC14_TARGET_STORAGE, SRC14Extension};
use beacon_utils::Beacon;

/// The owner of this contract at deployment.
#[allow(dead_code)]
const INITIAL_OWNER: Identity = Identity::Address(Address::zero());

/// Follows somewhat the patter for
storage {
    /// The [ContractId] of the target contract.
    target: ContractId = ContractId::zero(),
    /// The [State] of the proxy owner.
    owner: Identity = INITIAL_OWNER,
    /// The [State] of the proxy owner.
    initialized: bool = false,
}

impl Beacon for Contract {
    #[storage(read, write)]
    fn set_beacon_target(new_target: ContractId) {
        only_owner();
        storage.target.write(new_target);
    }

    #[storage(read)]
    fn beacon_target() -> ContractId {
        storage.target.read()
    }

    #[storage(read)]
    fn beacon_owner() -> Identity {
        storage.owner.read()
    }

    #[storage(read, write)]
    fn set_owner(new_owner: Identity) {
        only_owner();
        storage.owner.write(new_owner);
    }

    #[storage(read, write)]
    fn initialize(initial_owner: Identity) {
        not_initialized();
        storage.owner.write(initial_owner);
        storage.initialized.write(true);
    }
}

#[storage(read)]
fn only_owner() {
    require(
        storage
            .owner
            .read() == msg_sender()
            .unwrap(),
        AccessError::NotOwner,
    );
}

#[storage(read)]
fn not_initialized() {
    require(!storage.initialized.read(), "Already initialized");
}
