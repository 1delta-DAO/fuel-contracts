library;

// The interface for interacting with Rfq orders 
abi Beacon {
    #[storage(read, write)]
    fn set_beacon_target(new_target: ContractId);
    #[storage(read)]
    fn beacon_target() -> ContractId;
    #[storage(read)]
    fn beacon_owner() -> Identity;
    #[storage(read, write)]
    fn set_owner(new_owner: Identity);
    #[storage(read, write)]
    fn initialize(initial_owner: Identity);
}
