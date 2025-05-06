contract;

// mod utils;



// use utils::{_compute_bytecode_root, _swap_configurables};
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
    /// Maps the hash digest of configurables to the contract id.
    contract_configurables: StorageMap<b256, ContractId> = StorageMap {},
    /// The template contract's bytecode
    bytecode: StorageVec<u8> = StorageVec {},
    /// this is for the NFT register
    /// The total number of unique assets minted by this contract.
    ///
    /// # Additional Information
    ///
    /// This is the number of NFTs that have been minted.
    total_assets: u64 = 0,
    /// The total number of coins minted for a particular asset.
    ///
    /// # Additional Information
    ///
    /// This should always be 1 for any asset as this is an NFT contract.
    total_supply: StorageMap<AssetId, u64> = StorageMap {},
    /// The name associated with a particular asset.
    name: StorageMap<AssetId, StorageString> = StorageMap {},
    /// The symbol associated with a particular asset.
    symbol: StorageMap<AssetId, StorageString> = StorageMap {},
    /// The metadata associated with a particular asset.
    ///
    /// # Additional Information
    ///
    /// In this NFT contract, there is no metadata provided at compile time. All metadata
    /// is added by users and stored into storage.
    metadata: StorageMetadata = StorageMetadata {},
}

abi AccountRegistry {
    #[storage(read, write)]
    fn set_bytecode(bytecode: Vec<u8>);
}

abi MintAndCall {
    #[storage(read, write)]
    fn mint_and_call(recipient: Identity, sub_id: SubId, operations: u64);

    #[storage(read)]
    fn bytecode_root(child_contract: ContractId) -> BytecodeRoot;
}

impl AccountRegistry for Contract {
    /// Special helper function to store the template contract's bytecode
    ///
    /// # Additional Information
    ///
    /// Real world implementations should apply restrictions on this function such that it cannot
    /// be changed by anyone or can only be changed once.
    #[storage(read, write)]
    fn set_bytecode(bytecode: Vec<u8>) {
        storage.bytecode.store_vec(bytecode);
    }
}

impl MintAndCall for Contract {
    /// Special helper function to store the template contract's bytecode
    ///
    /// # Additional Information
    ///
    /// Real world implementations should apply restrictions on this function such that it cannot
    /// be changed by anyone or can only be changed once.
    #[storage(read, write)]
    fn mint_and_call(recipient: Identity, sub_id: SubId, operations: u64) {
        register_contract_internal(recipient, Some(sub_id), 0);
    }

    #[storage(read)]
    fn bytecode_root(child_contract: ContractId) -> BytecodeRoot {
        bytecode_root(child_contract)
    }
}

impl SRC12 for Contract {
    /// Verifies that a newly deployed contract is the child of a contract factory and registers it.
    ///
    /// # Additional Information
    ///
    /// This example does not check whether a contract has already been registered and will overwrite any values.
    ///
    /// # Arguments
    ///
    /// * `child_contract`: [ContractId] - The deployed factory child contract of which to verify the bytecode root.
    /// * `configurables`: [Option<ContractConfigurables>] - The configurables value set for the `child_contract`.
    ///
    /// # Returns
    ///
    /// * [Result<BytecodeRoot, str>] - Either the bytecode root of the newly registered contract or a `str` error message.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Writes: `2`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src12::SRC12;
    ///
    /// fn foo(my_src_12_contract: ContractId, my_deployed_contract: ContractId, my_configurables: Option<ContractConfigurables>) {
    ///     let src_12_contract_abi = abi(SRC12, my_src_12_contract.bits());
    ///     src_12_contract_abi.register_contract(my_deployed_contract, my_configurables);
    ///     assert(src_12_contract_abi.is_valid(my_deployed_contract));
    /// }
    /// ```
    #[storage(read, write)]
    fn register_contract(
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
    /// Returns a boolean representing the state of whether a contract is a valid child of the contract factory.
    ///
    /// # Arguments
    ///
    /// * `child_contract`: [ContractId] - The deployed factory child contract of which to check the registry status.
    ///
    /// # Returns
    ///
    /// * [bool] - `true` if the contract has registered and is valid, otherwise `false`.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src12::SRC12;
    ///
    /// fn foo(my_src_12_contract: ContractId, my_deployed_contract: ContractId, my_configurables: Option<ContractConfigurables>) {
    ///     let src_12_contract_abi = abi(SRC12, my_src_12_contract.bits());
    ///     src_12_contract_abi.register_contract(my_deployed_contract, my_configurables);
    ///     assert(src_12_contract_abi.is_valid(my_deployed_contract));
    /// }
    /// ```
    #[storage(read)]
    fn is_valid(child_contract: ContractId) -> bool {
        storage.registered_contracts.get(child_contract).try_read().unwrap_or(false)
    }

    /// Returns the bytecode root of the default template contract.
    ///
    /// # Returns
    ///
    /// * [Option<BytecodeRoot>] - The bytecode root of the default template contract.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src12::SRC12;
    ///
    /// fn foo(my_src_12_contract: ContractId) {
    ///     let src_12_contract_abi = abi(SRC12, my_src_12_contract.bits());
    ///     let root = src_12_contract_abi.factory_bytecode_root();
    ///     assert(root.unwrap() != b256::zero());
    /// }
    /// ```
    #[storage(read)]
    fn factory_bytecode_root() -> Option<BytecodeRoot> {
        Some(TEMPLATE_BYTECODE_ROOT)
    }
}

impl SRC12_Extension for Contract {
    /// Return a registered contract factory child contract with specific implementation details specified by it's configurables.
    ///
    /// # Arguments
    ///
    /// * `configurables`: [Option<ContractConfigurables>] - The configurables value set for the `child_contract`.
    ///
    /// # Returns
    ///
    /// * [Option<ContractId>] - The id of the contract which has registered with the specified configurables.
    ///
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src12::SRC12_Extension;
    ///
    /// fn foo(my_src_12_contract: ContractId, my_deployed_contract: ContractId, my_configurables: Option<ContractConfigurables>) {
    ///     let src_12_contract_abi = abi(SRC12_Extension, my_src_12_contract.bits());
    ///     src_12_contract_abi.register_contract(my_deployed_contract, my_configurables);
    ///     let result_contract_id = src_12_contract_abi.get_contract_id(my_configurables);
    ///     assert(result_contract_id.unwrap() == my_deployed_contract);
    /// }
    /// ```
    #[storage(read)]
    fn get_contract_id(configurables: Option<ContractConfigurables>) -> Option<ContractId> {
        storage.contract_configurables.get(sha256(configurables.unwrap_or(Vec::new()))).try_read()
    }
}

/// SRC20 implemnentations
impl SRC20 for Contract {
    /// Returns the total number of individual NFTs for this contract.
    ///
    /// # Returns
    ///
    /// * [u64] - The number of assets that this contract has minted.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(contract_id: ContractId) {
    ///     let contract_abi = abi(SRC20, contract_id);
    ///     let total_assets = contract_abi.total_assets();
    ///     assert(total_assets != 0);
    /// }
    /// ```
    #[storage(read)]
    fn total_assets() -> u64 {
        _total_assets(storage.total_assets)
    }

    /// Returns the total supply of coins for an asset.
    ///
    /// # Additional Information
    ///
    /// This must always be at most 1 for NFTs.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the total supply.
    ///
    /// # Returns
    ///
    /// * [Option<u64>] - The total supply of coins for `asset`.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(contract_id: ContractId, asset: AssetId) {
    ///     let contract_abi = abi(SRC20, contract_id);
    ///     let total_supply = contract_abi.total_supply(asset).unwrap();
    ///     assert(total_supply == 1);
    /// }
    /// ```
    #[storage(read)]
    fn total_supply(asset: AssetId) -> Option<u64> {
        _total_supply(storage.total_supply, asset)
    }

    /// Returns the name of the asset, such as “Ether”.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the name.
    ///
    /// # Returns
    ///
    /// * [Option<String>] - The name of `asset`.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    /// use std::string::String;
    ///
    /// fn foo(contract_ic: ContractId, asset: AssetId) {
    ///     let contract_abi = abi(SRC20, contract_id);
    ///     let name = contract_abi.name(asset).unwrap();
    ///     assert(name.len() != 0);
    /// }
    /// ```
    #[storage(read)]
    fn name(asset: AssetId) -> Option<String> {
        _name(storage.name, asset)
    }
    /// Returns the symbol of the asset, such as “ETH”.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the symbol.
    ///
    /// # Returns
    ///
    /// * [Option<String>] - The symbol of `asset`.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    /// use std::string::String;
    ///
    /// fn foo(contract_id: ContractId, asset: AssetId) {
    ///     let contract_abi = abi(SRC20, contract_id);
    ///     let symbol = contract_abi.symbol(asset).unwrap();
    ///     assert(symbol.len() != 0);
    /// }
    /// ```
    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String> {
        _symbol(storage.symbol, asset)
    }
    /// Returns the number of decimals the asset uses.
    ///
    /// # Additional Information
    ///
    /// The standardized decimals for NFTs is 0u8.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the decimals.
    ///
    /// # Returns
    ///
    /// * [Option<u8>] - The decimal precision used by `asset`.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(contract_id: ContractId, asset: AssedId) {
    ///     let contract_abi = abi(SRC20, contract_id);
    ///     let decimals = contract_abi.decimals(asset).unwrap();
    ///     assert(decimals == 0u8);
    /// }
    /// ```
    #[storage(read)]
    fn decimals(_asset: AssetId) -> Option<u8> {
        Some(0u8)
    }
}

impl SRC3 for Contract {
    /// Mints new assets using the `sub_id` sub-identifier.
    ///
    /// # Additional Information
    ///
    /// This conforms to the SRC-20 NFT portion of the standard for a maximum
    /// mint amount of 1 coin per asset.
    ///
    /// # Arguments
    ///
    /// * `recipient`: [Identity] - The user to which the newly minted assets are transferred to.
    /// * `sub_id`: [SubId] - The sub-identifier of the newly minted asset.
    /// * `amount`: [u64] - The quantity of coins to mint.
    ///
    /// # Reverts
    ///
    /// * When the contract is paused.
    /// * When amount is greater than one.
    /// * When the asset has already been minted.
    /// * When more than the MAX_SUPPLY NFTs have been minted.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `3`
    /// * Writes: `2`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src3::SRC3;
    ///
    /// fn foo(contract_id: ContractId) {
    ///     let contract_abi = abi(SR3, contract_id);
    ///     contract_abi.mint(Identity::ContractId(ContractId::this()), ZERO_B256, 1);
    /// }
    /// ```
    #[storage(read, write)]
    fn mint(recipient: Identity, sub_id: Option<SubId>, amount: u64) {
        require_not_paused();

        let resolved_sub_id = match sub_id {
            Option::Some(sub_id) => sub_id,
            Option::None => revert(0),
        };

        // Checks to ensure this is a valid mint.
        let asset = AssetId::new(ContractId::this(), resolved_sub_id);
        require(amount == 1, MintError::CannotMintMoreThanOneNFTWithSubId);
        require(
            storage
                .total_supply
                .get(asset)
                .try_read()
                .is_none(),
            MintError::NFTAlreadyMinted,
        );

        // Mint the NFT
        let _ = _mint(
            storage
                .total_assets,
            storage
                .total_supply,
            recipient,
            resolved_sub_id,
            amount,
        );
    }

    /// Burns assets sent with the given `sub_id`.
    ///
    /// # Additional Information
    ///
    /// NOTE: The sha-256 hash of `(ContractId, SubId)` must match the `AssetId` where `ContractId` is the id of
    /// the implementing contract and `SubId` is the given `sub_id` argument.
    ///
    /// # Arguments
    ///
    /// * `sub_id`: [SubId] - The sub-identifier of the asset to burn.
    /// * `amount`: [u64] - The quantity of coins to burn.
    ///
    /// # Reverts
    ///
    /// * When the contract is paused.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    /// * Writes: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src3::SRC3;
    ///
    /// fn foo(contract_id: ContractId, asset_id: AssetId) {
    ///     let contract_abi = abi(SR3, contract_id);
    ///     contract_abi.burn {
    ///         gas: 10000,
    ///         coins: 1,
    ///         asset_id: AssetId,
    ///     } (ZERO_B256, 1);
    /// }
    /// ```
    #[payable]
    #[storage(read, write)]
    fn burn(sub_id: SubId, amount: u64) {
        require_not_paused();
        _burn(storage.total_supply, sub_id, amount);
    }
}

impl SRC7 for Contract {
    /// Returns metadata for the corresponding `asset` and `key`.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the metadata.
    /// * `key`: [String] - The key to the specific metadata.
    ///
    /// # Returns
    ///
    /// * [Option<Metadata>] - `Some` metadata that corresponds to the `key` or `None`.
    ///
    /// # Number of Storage Accesses
    ///
    /// * Reads: `1`
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src_7::{SRC7, Metadata};
    /// use std::string::String;
    ///
    /// fn foo(contract_id: ContractId, asset: AssetId) {
    ///     let contract_abi = abi(SRC7, contract_id);
    ///     let key = String::from_ascii_str("image");
    ///     let data = contract_abi.metadata(asset, key);
    ///     assert(data.is_some());
    /// }
    /// ```
    #[storage(read)]
    fn metadata(asset: AssetId, key: String) -> Option<Metadata> {
        storage.metadata.get(asset, key)
    }
}

#[storage(read, write)]
fn register_contract_internal(recipient: Identity, sub_id: Option<SubId>, amount: u64) {
    require_not_paused();

    let resolved_sub_id = match sub_id {
        Option::Some(sub_id) => sub_id,
        Option::None => revert(0),
    };

    // Checks to ensure this is a valid mint.
    let asset = AssetId::new(ContractId::this(), resolved_sub_id);
    require(amount == 1, MintError::CannotMintMoreThanOneNFTWithSubId);
    require(
        storage
            .total_supply
            .get(asset)
            .try_read()
            .is_none(),
        MintError::NFTAlreadyMinted,
    );

    // Mint the NFT
    let _ = _mint(
        storage
            .total_assets,
        storage
            .total_supply,
        recipient,
        resolved_sub_id,
        amount,
    );
}
