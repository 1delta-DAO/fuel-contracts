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
    storage::storage_vec::*,
    storage::storage_vec::*,
};
use account_utils::{AccountLogic, structs::Action};

const ZERO_ID = Identity::Address(Address::from(b256::zero()));
const ZERO_CONTRACT_ID = ContractId::from(b256::zero());

configurable {
    /// this needs to be the root of account proxy configured with the correct BEACON
    ACCOUNT_BYTECODE_ROOT: b256 = b256::zero(),
}

/// The storage is set up so that it is efficient to query whether a user owns
/// a contract via `contract_to_owner`. This also contains an ID as a second value that indicates
/// the index of the element in the StorageVec `owner_to_contracts`
/// This is to track which contracts are owned by a user
/// We cannot use the `remove()` on the StorageVec as we would then change the indexes of the
/// following contracts.
/// As a workaround, we leave the lengths consistent and just change and index to
/// a zero contractId
storage {
    /// map a registered contract to an owner and the index in the owner's list
    contract_to_owner: StorageMap<ContractId, (Identity, u64)> = StorageMap {},
    /// maps owner to an indexed map u64->ContractId
    /// these indexes can have zeroes as values if a user transfers a contract
    owner_to_contracts: StorageMap<Identity, StorageVec<ContractId>> = StorageMap {},
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

abi ContractTransfer {
    /// Allow an owner to transfer the account
    /// to another Identity.
    #[storage(read, write)]
    fn transfer_ownership(_contract: ContractId, _to: Identity);

    /// Get the contracts as a vector for a user
    #[storage(read)]
    fn get_user_contracts(_owner: Identity, _start_index: u64, _count: u64) -> Vec<ContractId>;
}

impl ContractTransfer for Contract {
    /// transfers ownership of a contract
    /// reads 2
    /// writes: 3
    #[storage(read, write)]
    fn transfer_ownership(_contract: ContractId, _to: Identity) {
        // get the owner of the input contract
        let (owner, from_contract_id) = get_contract_owner_and_id(_contract);

        // make sure that the contract is registered
        // i.e. an owner is defined
        require(owner != ZERO_ID, "Not registered");

        let _sender_id = msg_sender().unwrap();

        // check that the caller owns the contract
        require(owner == _sender_id, "Not owner");

        // check that there is no self-transfer 
        // and the receiver is not zero
        require(_to != _sender_id && _to != ZERO_ID, "Invalid receiver");

        // remove it from owner list by setting this one to zero
        storage
            .owner_to_contracts
            .get(_sender_id)
            .set(from_contract_id, ZERO_CONTRACT_ID);

        // get the latest contract index of _to
        let next_index_of_to = storage.owner_to_contracts.get(_to).len();

        // add it to the _to address
        storage.owner_to_contracts.get(_to).push(_contract);

        // update owner in registry, this overrides the _sender_id data
        storage
            .contract_to_owner
            .insert(_contract, (_to, next_index_of_to));
    }

    #[storage(read)]
    fn get_user_contracts(_owner: Identity, _start_index: u64, _count: u64) -> Vec<ContractId> {
        let mut v: Vec<ContractId> = Vec::new();

        // get element count minus start index
        let len = storage.owner_to_contracts.get(_owner).len() - _start_index;

        let mut i = _start_index;
        while i < _min(len, _count) {
            let _contract = storage.owner_to_contracts.get(_owner).get(i).unwrap().read();

            if _contract != ZERO_CONTRACT_ID {
                v.push(_contract);
            }
            i += 1;
        }
        v
    }
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
}

/// get the contract owner from the storage
#[storage(read)]
fn get_contract_owner(_contract: ContractId) -> Identity {
    let (owner, _) = storage.contract_to_owner.get(_contract).try_read().unwrap_or((ZERO_ID, 0));
    owner
}

/// get the contract owner from the storage
#[storage(read)]
fn get_contract_owner_and_id(_contract: ContractId) -> (Identity, u64) {
    storage.contract_to_owner.get(_contract).try_read().unwrap_or((ZERO_ID, 0))
}

/// registers a contract
/// validates for a bytecode root match
/// while the expected bytecode has a configurable,
/// we only accept the ones that have the correct beacon address
/// this is respected in ACCOUNT_BYTECODE_ROOT
#[storage(read, write)]
fn register_contract_internal(child_contract: ContractId, _for: Identity) {
    let returned_root = bytecode_root(child_contract);
    require(
        returned_root == ACCOUNT_BYTECODE_ROOT,
        "The deployed contract's bytecode root and template contract bytecode root do not match",
    );

    // the next index is the array length
    let index = storage.owner_to_contracts.get(_for).len();

    // add _for as owner to contract
    storage
        .contract_to_owner
        .insert(child_contract, (_for, index));

    // add it to the user contract list
    storage.owner_to_contracts.get(_for).push(child_contract);
}

// minimum wrapper
fn _min(a: u64, b: u64) -> u64 {
    u64::min(a, b)
}
