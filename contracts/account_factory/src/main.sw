contract;

use standards::src12::BytecodeRoot;
use std::{
    auth::msg_sender,
    call_frames::msg_asset_id,
    context::{
        msg_amount,
        this_balance,
    },
    external::bytecode_root,
};
use account_utils::{Account, structs::Action};

configurable {
    /// this needs to be the root of account proxy configured with the correct BEACON
    TEMPLATE_BYTECODE_ROOT: b256 = b256::zero(),
}

storage {
    /// map a registered contract to an owner
    contract_to_owner: StorageMap<ContractId, Identity> = StorageMap {},
}

abi RegisterAndCall {
    /// register a contract for an entity
    /// optionally actions can be performed and
    /// forwarded to the account
    #[storage(write, read), payable]
    fn register_and_call(
        _contract: ContractId,
        _for: Identity,
        actions: Option<Vec<Action>>,
    );

    #[storage(read)]
    fn bytecode_root(child_contract: ContractId) -> BytecodeRoot;
}

abi ExecutionValidation {
    /// called by the implementation
    /// ensures that only the owner can call a function
    #[storage(read)]
    fn can_call(_contract: ContractId, _caller: Identity) -> bool;
}

impl ExecutionValidation for Contract {
    #[storage(read)]
    fn can_call(_contract: ContractId, _caller: Identity) -> bool {
        storage.contract_to_owner.get(_contract).try_read().unwrap_or(Identity::Address(Address::from(b256::zero()))) == _caller || (_caller == Identity::ContractId(ContractId::this()))
    }
}

impl RegisterAndCall for Contract {
    #[storage(write, read), payable]
    fn register_and_call(
        _contract: ContractId,
        _for: Identity,
        actions: Option<Vec<Action>>,
    ) {
        register_contract_internal(_contract, _for);

        // execute actions if provided
        // data asset amount is forwarded 
        if let Some(d) = actions {
            abi(Account, _contract
                .bits())
                .compose {
                    asset_id: msg_asset_id().into(),
                    coins: msg_amount(),
                }(d);
        }
    }

    #[storage(read)]
    fn bytecode_root(child_contract: ContractId) -> BytecodeRoot {
        bytecode_root(child_contract)
    }
}

/// registers a contract
/// validates for a bytecode root match
/// while the expected bytecode has a configurable,
/// we only accept the ones that have the correct beacon address
/// this is respected in TEMPLATE_BYTECODE_ROOT
#[storage(read, write)]
fn register_contract_internal(child_contract: ContractId, _for: Identity) {
    let returned_root = bytecode_root(child_contract);
    require(
        returned_root == TEMPLATE_BYTECODE_ROOT,
        "The deployed contract's bytecode root and template contract bytecode root do not match",
    );

    storage.contract_to_owner.insert(child_contract, _for);
}
