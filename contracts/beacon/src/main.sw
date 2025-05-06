contract;

use std::execution::run_external;
use beacon_utils::Beacon;

/// Follows somewhat the pattern for SRC14,
/// Note that we have no storage collision issues here
/// as the Beacon itself is not a proxy.
storage {
    /// The [ContractId] of the beacon target contract.
    target: ContractId = ContractId::zero(),
    /// The [Identity] of the proxy owner.
    owner: Identity = Identity::Address(Address::zero()),
    /// The initialization flag as a [bool].
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
        // does noit need to check if initialized as the initial
        // owner is zero
        only_owner();
        storage.owner.write(new_owner);
    }

    #[storage(read, write)]
    fn initialize(initial_owner: Identity) {
        // does not check for owner but for initialization
        not_initialized();
        storage.owner.write(initial_owner);
        storage.initialized.write(true);
    }
}

#[storage(read)]
fn only_owner() {
    require(storage.owner.read() == msg_sender().unwrap(), "Not owner");
}

#[storage(read)]
fn not_initialized() {
    require(!storage.initialized.read(), "Already initialized");
}
