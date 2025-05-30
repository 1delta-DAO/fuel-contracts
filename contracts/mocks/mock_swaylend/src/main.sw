contract;

use market_abi::{Market, structs::*,};
use std::{
    auth::msg_sender,
    call_frames::msg_asset_id,
    context::{
        msg_amount,
        this_balance,
    },
    asset::transfer,
    hash::Hash,
    bytes::Bytes,
};
use sway_libs::signed_integers::i256::I256;



storage {
    user_collateral: StorageMap<(Identity, AssetId), u64> = StorageMap {},
    user_base: StorageMap<Identity, u64> = StorageMap {},
    user_base_borrow: StorageMap<Identity, u64> = StorageMap {},
    base_asset_id: Option<AssetId> = Option::None,
}

impl Market for Contract {
    fn get_version() -> u8 {
        0
    }

    #[storage(write)]
    fn activate_contract(market_configuration: MarketConfiguration, owner: Identity) {
        storage.base_asset_id.write(Some(market_configuration.base_token));
    }

   #[storage(write)]
    fn  mock_define_base(base: AssetId) {
        storage.base_asset_id.write(Some(base));
    }

    #[storage(write)]
    fn debug_increment_timestamp() {
    }

    #[storage(write)]
    fn add_collateral_asset(configuration: CollateralConfiguration) {
    }

    #[storage(write)]
    fn pause_collateral_asset(asset_id: AssetId) {
    }

    #[storage(write)]
    fn resume_collateral_asset(asset_id: AssetId) {
    }

    #[storage(write)]
    fn update_collateral_asset(asset_id: AssetId, configuration: CollateralConfiguration) {
    }

    #[storage(read)]
    fn get_collateral_configurations() -> Vec<CollateralConfiguration> {
        Vec::new()
    }

    #[payable, storage(write)]
    fn supply_collateral() {
        let asset_id = msg_asset_id();
        let amount = msg_amount();
        let sender = msg_sender().unwrap();
        let current_balance = storage.user_collateral.get((sender, asset_id)).try_read().unwrap_or(0);
        storage.user_collateral.insert((sender, asset_id), current_balance + amount);
    }

    #[payable, storage(write)]
    fn withdraw_collateral(asset_id: AssetId, amount: u64, price_data_update: PriceDataUpdate) {
        let sender = msg_sender().unwrap();
        
        let current_balance = storage.user_collateral.get((sender, asset_id)).try_read().unwrap_or(0);
        require(current_balance >= amount, "Insufficient collateral balance");
        
        storage.user_collateral.insert((sender, asset_id), current_balance - amount);
        
        transfer(sender, asset_id, amount);

        log((sender, asset_id));
    }

    #[storage(read)]
    fn get_user_collateral(account: Identity, asset_id: AssetId) -> u64 {
        storage.user_collateral.get((account, asset_id)).try_read().unwrap_or(0)
    }

    #[storage(read)]
    fn get_all_user_collateral(account: Identity) -> Vec<(AssetId, u64)> {
        Vec::new()
    }

    #[storage(read)]
    fn totals_collateral(asset_id: AssetId) -> u64 {
        0
    }

    #[storage(read)]
    fn get_all_totals_collateral() -> Vec<(AssetId, u64)> {
        Vec::new()
    }

    #[payable, storage(write)]
    fn supply_base() {
        let asset_id = msg_asset_id();
        let amount = msg_amount();
        let sender = msg_sender().unwrap();
        let base_asset = storage.base_asset_id.try_read().unwrap();

        require(base_asset.is_some(), "base_asset not initialized");

        require(asset_id == base_asset.unwrap(), "Invalid asset");

        let current_balance = storage.user_base.get(sender).try_read().unwrap_or(0);
        let current_borrow_balance = storage.user_base_borrow.get(sender).try_read().unwrap_or(0);
        
        // no debt - plain deposit
        if current_borrow_balance == 0 {
                storage.user_base.insert(sender, current_balance + amount);
        } else {
            // debt larger thatn amount - repay
            if current_borrow_balance > amount {
                storage.user_base_borrow.insert(sender, current_borrow_balance - amount);
            } else {
                // smaller than amount - repay all and deposit excess
                storage.user_base.insert(sender, amount - current_borrow_balance);
                storage.user_base_borrow.insert(sender, 0);
            }   
        }
    }

    #[payable, storage(write)]
    fn withdraw_base(amount: u64, price_data_update: PriceDataUpdate) {
        let sender = msg_sender().unwrap();
        let base_asset = storage.base_asset_id.try_read().unwrap();
        
        require(base_asset.is_some(), "base_asset not initialized");

        let current_balance = storage.user_base.get(sender).try_read().unwrap_or(0);
        let current_borrow_balance = storage.user_base_borrow.get(sender).try_read().unwrap_or(0);
        
        // no balance - plain borrow
        if current_balance == 0 {
            // borrow
            if current_borrow_balance > amount {
                // increase borrow
                storage.user_base_borrow.insert(sender, current_borrow_balance + amount);
            } else {
                revert(0);
            }   

        } else {
            // withdraw
            if current_balance > amount {
                storage.user_base.insert(sender, current_balance - amount);
            } else {
                // withdraw all and borrow rest
                storage.user_base.insert(sender, 0);
                storage.user_base_borrow.insert(sender, amount - current_balance);
            }
        }
        
        transfer(sender, base_asset.unwrap(), amount);
    }

    #[storage(read)]
    fn get_user_supply_borrow(account: Identity) -> (u256, u256) {
        let current_balance = storage.user_base.get(account).try_read().unwrap_or(0);
        let current_borrow_balance = storage.user_base_borrow.get(account).try_read().unwrap_or(0);
        return (current_balance.into(), current_borrow_balance.into());
    }

    #[storage(read)]
    fn available_to_borrow(account: Identity) -> u256 {
        0
    }

    #[payable, storage(write)]
    fn absorb(accounts: Vec<Identity>, price_data_update: PriceDataUpdate) {
    }

    #[storage(read)]
    fn is_liquidatable(account: Identity) -> bool {
        false
    }

    #[payable, storage(read)]
    fn buy_collateral(asset_id: AssetId, min_amount: u64, recipient: Identity) {
    }

    #[storage(read)]
    fn collateral_value_to_sell(asset_id: AssetId, collateral_amount: u64) -> u64 {
        0
    }

    #[storage(read)]
    fn quote_collateral(asset_id: AssetId, base_amount: u64) -> u64 {
        0
    }

    #[storage(read)]
    fn get_reserves() -> I256 {
        I256::new()
    }

    #[storage(read)]
    fn withdraw_reserves(to: Identity, amount: u64) {
    }

    #[storage(read)]
    fn get_collateral_reserves(asset_id: AssetId) -> I256 {
        I256::new()
    }

    #[storage(write)]
    fn pause(config: PauseConfiguration) {
    }

    #[storage(read)]
    fn get_pause_configuration() -> PauseConfiguration {
        PauseConfiguration::default()
    }

    #[storage(read)]
    fn get_market_configuration() -> MarketConfiguration {
        MarketConfiguration::default()
    }

    #[storage(read)]
    fn get_market_basics() -> MarketBasics {
        MarketBasics::default()
    }

    #[storage(read)]
    fn get_market_basics_with_interest() -> MarketBasics {
        MarketBasics::default()
    }

    #[storage(read)]
    fn get_user_basic(account: Identity) -> UserBasic {
        UserBasic::default()
    }

    #[storage(read)]
    fn get_user_balance_with_interest(account: Identity) -> I256 {
        I256::new()
    }

    #[storage(read)]
    fn get_utilization() -> u256 {
        0
    }

    fn balance_of(asset_id: AssetId) -> u64 {
        0
    }

    #[storage(read)]
    fn get_supply_rate(utilization: u256) -> u256 {
        0
    }

    #[storage(read)]
    fn get_borrow_rate(utilization: u256) -> u256 {
        0
    }

    #[storage(write)]
    fn set_pyth_contract_id(contract_id: ContractId) {
    }

    #[storage(read)]
    fn get_pyth_contract_id() -> ContractId {
        ContractId::from(0x0000000000000000000000000000000000000000000000000000000000000000)
    }

    #[storage(read)]
    fn get_price(price_feed_id: PriceFeedId) -> Price {
        Price {
            confidence: 0,
            exponent: 0,
            price: 0,
            publish_time: 0,
        }
    }

    #[storage(read)]
    fn update_fee(update_data: Vec<Bytes>) -> u64 {
        0
    }

    #[payable, storage(read)]
    fn update_price_feeds_if_necessary(price_data_update: PriceDataUpdate) {
    }

    #[storage(write)]
    fn update_market_configuration(configuration: MarketConfiguration) {
    }

    #[storage(write)]
    fn transfer_ownership(new_owner: Identity) {
    }

    #[storage(write)]
    fn renounce_ownership() {
    }
}
