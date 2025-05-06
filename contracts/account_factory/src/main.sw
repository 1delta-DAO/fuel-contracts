contract;

use standards::{src12::*, src20::SRC20, src3::SRC3, src5::{SRC5, State}, src7::{Metadata, SRC7}};
use std::{
    external::bytecode_root,
    hash::{
        Hash,
        sha256,
    },
    storage::storage_string::*,
    storage::storage_vec::*,
    string::String,
};
use sway_libs::{
    asset::{
        base::{
            _name,
            _set_name,
            _set_symbol,
            _symbol,
            _total_assets,
            _total_supply,
            SetAssetAttributes,
        },
        metadata::*,
        supply::{
            _burn,
            _mint,
        },
    },
    bytecode::{
        compute_bytecode_root,
        swap_configurables,
    },
    ownership::{
        _owner,
        initialize_ownership,
        only_owner,
    },
    pausable::{
        _is_paused,
        _pause,
        _unpause,
        Pausable,
        require_not_paused,
    },
};

pub enum MintError {
    CannotMintMoreThanOneNFTWithSubId: (),
    MaxNFTsMinted: (),
    NFTAlreadyMinted: (),
}

pub enum SetError {
    ValueAlreadySet: (),
}

configurable {
    TEMPLATE_BYTECODE_ROOT: b256 = b256::zero(),
    BEACON_ADDRESS: b256 = b256::zero(),
}

storage {
    /// Contracts that have registered with this contract.
    registered_contracts: StorageMap<ContractId, bool> = StorageMap {},
    /// map a registered contract to an owner
    contract_to_owner: StorageMap<ContractId, Identity> = StorageMap {},
}

abi MintAndCall {
    #[payable, storage(read, write)]
    fn register_and_call(_contract: ContractId, _for: Identity, operations: u64);

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

impl MintAndCall for Contract {
    /// Special helper function to store the template contract's bytecode
    ///
    /// # Additional Information
    ///
    /// Real world implementations should apply restrictions on this function such that it cannot
    /// be changed by anyone or can only be changed once.
    #[payable, storage(read, write)]
    fn register_and_call(_contract: ContractId, _for: Identity, operations: u64) {
        register_contract_internal(_contract, Option::None);

        if operations == 0 {} else {}
    }

    #[storage(read)]
    fn bytecode_root(child_contract: ContractId) -> BytecodeRoot {
        bytecode_root(child_contract)
    }
}

#[storage(read, write)]
fn register_contract_internal(
    child_contract: ContractId,
    configurables: Option<ContractConfigurables>,
) -> Result<BytecodeRoot, str> {
    if configurables.is_some() {
        return Result::Err(
            "This SRC-12 implementation only registers contracts without configurable values",
        );
    }

    let returned_root = bytecode_root(child_contract);
    if returned_root != TEMPLATE_BYTECODE_ROOT {
        return Result::Err(
            "The deployed contract's bytecode root and template contract bytecode root do not match",
        );
    }

    storage.registered_contracts.insert(child_contract, true);
    return Result::Ok(returned_root)
}
