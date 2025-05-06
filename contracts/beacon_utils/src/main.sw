
library;

use standards::src5::{AccessError, State};

// The interface for interacting with Rfq orders 
abi Beacon {
    #[storage(read, write)]
    fn set_proxy_target(new_target: ContractId);
 
    #[storage(read)]
    fn proxy_target() -> Option<ContractId>;
    
        #[storage(read)]
    fn proxy_owner() -> State;
}
