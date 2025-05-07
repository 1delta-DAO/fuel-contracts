contract;

use standards::src12::BytecodeRoot;
use std::external::bytecode_root;

abi BytecodeRootGetter {
    fn get_bytecode_root(child_contract: ContractId) -> BytecodeRoot;
}

impl BytecodeRootGetter for Contract {
    fn get_bytecode_root(child_contract: ContractId) -> BytecodeRoot {
        bytecode_root(child_contract)
    }
}