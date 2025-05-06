library;
pub mod structs;
use structs::Action;

/// the account is stateless
/// ownership
abi Account {
    #[payable, storage(write)]
    fn compose(actions: Vec<Action>);
}
