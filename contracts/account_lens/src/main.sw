contract;

use std::execution::run_external;
use market_abi::{Market, structs::UserBasic};

abi AccountLens {
    /// returns array of (account_address, collaterals, (supplies, borrow), user_basic)
    #[storage(read)]
    fn get_account_data(
        account: Identity,
        factory: b256,
        market: b256,
        start: u64,
        end: u64,
    ) -> Vec<(b256, Vec<(AssetId, u64)>, (u256, u256), UserBasic)>;
}

abi ContractFactory {
    /// Get the contracts as a vector for a user
    #[storage(read)]
    fn get_user_contracts(_owner: Identity, _start_index: u64, _count: u64) -> Vec<ContractId>;
}

/// Get swaylend market data as an array for a user
impl AccountLens for Contract {
    #[storage(read)]
    fn get_account_data(
        account: Identity,
        factory: b256,
        market: b256,
        start: u64,
        end: u64,
    ) -> Vec<(b256, Vec<(AssetId, u64)>, (u256, u256), UserBasic)> {
        let contract_accounts = abi(ContractFactory, factory).get_user_contracts(account, start, end);

        let mut datas: Vec<(b256, Vec<(AssetId, u64)>, (u256, u256), UserBasic)> = Vec::new();
        let market_caller = abi(Market, market);

        for contract_account in contract_accounts.iter() {
            let user_basic = market_caller.get_user_basic(Identity::ContractId(contract_account));

            let collaterals = market_caller.get_all_user_collateral(Identity::ContractId(contract_account)); // -> Vec<(AssetId, u64)>;

            let supply_borrow = market_caller.get_user_supply_borrow(Identity::ContractId(contract_account)); // -> (u256, u256); 
            datas.push((contract_account.bits(), collaterals, supply_borrow, user_basic));
        }

        datas
    }
}
