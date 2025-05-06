library;

pub mod structs;
use structs::Action;

/// the account is stateless
/// ownership
abi AccountLogic {
    #[payable, storage(write)]
    fn compose(actions: Vec<Action>);
}

abi ExecutionValidation {
    /// called by the implementation
    /// ensures that only the owner can call a function
    #[storage(read)]
    fn can_call(_contract: ContractId, _caller: Identity) -> bool;
}
