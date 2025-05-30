contract;

use sway_libs::asset::base::{_set_decimals, _set_name, _set_symbol, _total_assets};
use std::{
    asset::mint_to,
    hash::Hash,
    primitive_conversions::{
        b256::*,
        u256::*,
    },
    storage::storage_string::*,
    string::String,
};


abi SRC20 {
    #[storage(read)]
    fn total_assets() -> u64;

    #[storage(read)]
    fn total_supply(asset: AssetId) -> Option<u64>;

    #[storage(read)]
    fn name(asset: AssetId) -> Option<String>;
    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String>;
    #[storage(read)]
    fn decimals(asset: AssetId) -> Option<u8>;
}

pub struct SetNameEvent {
    pub asset: AssetId,
    pub name: Option<String>,
    pub sender: Identity,
}

pub struct SetSymbolEvent {
    pub asset: AssetId,
    pub symbol: Option<String>,
    pub sender: Identity,
}

pub struct SetDecimalsEvent {
    pub asset: AssetId,
    pub decimals: u8,
    pub sender: Identity,
}

pub struct TotalSupplyEvent {
    pub asset: AssetId,
    pub supply: u64,
    pub sender: Identity,
}

impl PartialEq for SetNameEvent {
    fn eq(self, other: Self) -> bool {
        self.asset == other.asset && self.name == other.name && self.sender == other.sender
    }
}

impl Eq for SetNameEvent {}

impl SetNameEvent {
    pub fn new(asset: AssetId, name: Option<String>, sender: Identity) -> Self {
        Self {
            asset,
            name,
            sender,
        }
    }

    pub fn asset(self) -> AssetId {
        self.asset
    }

    pub fn name(self) -> Option<String> {
        self.name
    }

    pub fn sender(self) -> Identity {
        self.sender
    }

    pub fn log(self) {
        log(self);
    }
}

impl PartialEq for SetSymbolEvent {
    fn eq(self, other: Self) -> bool {
        self.asset == other.asset && self.symbol == other.symbol && self.sender == other.sender
    }
}

impl Eq for SetSymbolEvent {}

impl SetSymbolEvent {
    pub fn new(asset: AssetId, symbol: Option<String>, sender: Identity) -> Self {
        Self {
            asset,
            symbol,
            sender,
        }
    }

    pub fn asset(self) -> AssetId {
        self.asset
    }

    pub fn symbol(self) -> Option<String> {
        self.symbol
    }

    pub fn sender(self) -> Identity {
        self.sender
    }

    pub fn log(self) {
        log(self);
    }
}

impl PartialEq for SetDecimalsEvent {
    fn eq(self, other: Self) -> bool {
        self.asset == other.asset && self.decimals == other.decimals && self.sender == other.sender
    }
}

impl Eq for SetDecimalsEvent {}

impl SetDecimalsEvent {
    pub fn new(asset: AssetId, decimals: u8, sender: Identity) -> Self {
        Self {
            asset,
            decimals,
            sender,
        }
    }

    pub fn asset(self) -> AssetId {
        self.asset
    }

    pub fn decimals(self) -> u8 {
        self.decimals
    }

    pub fn sender(self) -> Identity {
        self.sender
    }

    pub fn log(self) {
        log(self);
    }
}

impl PartialEq for TotalSupplyEvent {
    fn eq(self, other: Self) -> bool {
        self.asset == other.asset && self.supply == other.supply && self.sender == other.sender
    }
}

impl Eq for TotalSupplyEvent {}

impl TotalSupplyEvent {
    pub fn new(asset: AssetId, supply: u64, sender: Identity) -> Self {
        Self {
            asset,
            supply,
            sender,
        }
    }

    pub fn asset(self) -> AssetId {
        self.asset
    }

    pub fn supply(self) -> u64 {
        self.supply
    }

    pub fn sender(self) -> Identity {
        self.sender
    }

    pub fn log(self) {
        log(self);
    }
}

storage {
    total_assets: u64 = 0,
    asset_name: StorageMap<AssetId, StorageString> = StorageMap {},
    asset_symbol: StorageMap<AssetId, StorageString> = StorageMap {},
    asset_decimals: StorageMap<AssetId, u8> = StorageMap {},
    asset_sub_id: StorageMap<AssetId, SubId> = StorageMap {},
}

impl SRC20 for Contract {
    #[storage(read)]
    fn total_assets() -> u64 {
        _total_assets(storage.total_assets)
    }

    #[storage(read)]
    fn total_supply(asset: AssetId) -> Option<u64> {
        Some(0)
    }

    #[storage(read)]
    fn name(asset: AssetId) -> Option<String> {
        storage.asset_name.get(asset).read_slice()
    }

    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String> {
        storage.asset_symbol.get(asset).read_slice()
    }

    #[storage(read)]
    fn decimals(asset: AssetId) -> Option<u8> {
        storage.asset_decimals.get(asset).try_read()
    }
}

abi MockToken {
    #[storage(read, write)]
    fn add_token(name: String, symbol: String, decimals: u8) -> AssetId;
    #[storage(read, write)]
    fn mint_tokens(asset_id: AssetId, amount: u64);
    #[storage(read)]
    fn get_sub_id(asset_id: AssetId) -> Option<SubId>;
}

impl MockToken for Contract {
    #[storage(read, write)]
    fn add_token(name: String, symbol: String, decimals: u8) -> AssetId {
        let total_assets = storage.total_assets.read();
        let total_assets_u256: u256 = total_assets.into();
        let sub_id: SubId = total_assets_u256.into();
        let asset_id = AssetId::new(ContractId::this(), sub_id);
        storage.total_assets.write(total_assets + 1);

        storage.asset_sub_id.insert(asset_id, sub_id);
        _set_name(storage.asset_name, asset_id, name);
        _set_symbol(storage.asset_symbol, asset_id, symbol);
        _set_decimals(storage.asset_decimals, asset_id, decimals);

        asset_id
    }

    #[storage(read, write)]
    fn mint_tokens(asset_id: AssetId, amount: u64) {
        let to = msg_sender().unwrap();
        let asset_sub_id = storage.asset_sub_id.get(asset_id).try_read().unwrap();

        mint_to(to, asset_sub_id, amount);
    }

    #[storage(read)]
    fn get_sub_id(asset_id: AssetId) -> Option<SubId> {
        storage.asset_sub_id.get(asset_id).try_read()
    }
}
