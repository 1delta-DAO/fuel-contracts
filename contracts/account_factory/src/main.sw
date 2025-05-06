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
use account_utils::{AccountLogic, structs::Action};

const ZERO_ID = Identity::Address(Address::from(b256::zero()));

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
    /// aside of the owner, only the facotry can call
    /// this is to ensure that a user can register and execute operations at once
    #[storage(read)]
    fn can_call(_contract: ContractId, _caller: Identity) -> bool;
}

impl ExecutionValidation for Contract {
    #[storage(read)]
    fn can_call(_contract: ContractId, _caller: Identity) -> bool {
        get_contract_owner(_contract) == _caller || (_caller == Identity::ContractId(ContractId::this()))
    }
}

impl RegisterAndCall for Contract {
    #[storage(write, read), payable]
    fn register_and_call(
        _contract: ContractId,
        _for: Identity,
        actions: Option<Vec<Action>>,
    ) {
        // check that the contract is not already owned
        require(
            get_contract_owner(_contract) == ZERO_ID,
            "Already registered",
        );

        // register the contract for the target
        register_contract_internal(_contract, _for);

        // execute actions if provided
        // data asset amount is forwarded 
        if let Some(d) = actions {
            abi(AccountLogic, _contract
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

/// get the contract owner from the storage
#[storage(read)]
fn get_contract_owner(_contract: ContractId) -> Identity {
    storage.contract_to_owner.get(_contract).try_read().unwrap_or(ZERO_ID)
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
