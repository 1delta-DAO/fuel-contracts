use fuels::{
    prelude::*,
    programs::responses::CallResponse,
    types::{input::Input, output::Output, Bits256},
};

use crate::paths::{
    LOGGER_CONTRACT_BINARY_PATH, MOCK_SWAYLEND_CONTRACT_BINARY_PATH,
    MOCK_TOKEN_CONTRACT_BINARY_PATH,
};

use crate::types::PoolId;

abigen!(
    Contract(
        name = "MockToken",
        abi = "./contracts/mocks/mock_token/out/debug/mock_token-abi.json"
    ),
    Contract(
        name = "MockSwaylend",
        abi = "./contracts/mocks/mock_swaylend/out/debug/mock_swaylend-abi.json"
    ),
    Contract(
        name = "Logger",
        abi = "./contracts/logger/out/debug/logger-abi.json"
    ),
    Contract(
        name = "SwaylendMarket",
        abi = "./fixtures/swaylend/market-abi.json"
    ),
    Contract(
        name = "MiraAMM",
        abi = "./fixtures/mira-amm/mira_amm_contract-abi.json"
    ),
    Script(
        name = "AddLiquidityScript",
        abi = "./scripts/add_liquidity_script/out/debug/add_liquidity_script-abi.json"
    ),
    // 1delta script
    Script(
        name = "BatchSwapExactInScript",
        abi = "./scripts/batch_swap_exact_in_script/out/debug/batch_swap_exact_in_script-abi.json"
    ),
    Script(
        name = "BatchSwapExactOutScript",
        abi =
            "./scripts/batch_swap_exact_out_script/out/debug/batch_swap_exact_out_script-abi.json"
    ),
    Script(
        name = "ComposerScript",
        abi = "./scripts/composer_script/out/debug/composer_script-abi.json"
    ),
);

pub mod amm {
    use super::*;
    use fuels::types::Identity;

    pub async fn initialize_ownership(
        contract: &MiraAMM<WalletUnlocked>,
        owner: Identity,
    ) -> CallResponse<()> {
        contract
            .methods()
            .transfer_ownership(owner)
            .call()
            .await
            .unwrap()
    }

    pub async fn create_pool(
        contract: &MiraAMM<WalletUnlocked>,
        token_contract: &MockToken<WalletUnlocked>,
        token_0_contract_id: ContractId,
        token_0_sub_id: Bits256,
        token_1_contract_id: ContractId,
        token_1_sub_id: Bits256,
        is_stable: bool,
    ) -> CallResponse<PoolId> {
        contract
            .methods()
            .create_pool(
                token_0_contract_id,
                token_0_sub_id,
                token_1_contract_id,
                token_1_sub_id,
                is_stable,
            )
            .with_contracts(&[token_contract])
            .call()
            .await
            .unwrap()
    }

    pub async fn pool_metadata(
        contract: &MiraAMM<WalletUnlocked>,
        pool_id: PoolId,
    ) -> CallResponse<Option<PoolMetadata>> {
        contract
            .methods()
            .pool_metadata(pool_id)
            .call()
            .await
            .unwrap()
    }

    pub async fn fees(contract: &MiraAMM<WalletUnlocked>) -> CallResponse<(u64, u64, u64, u64)> {
        contract.methods().fees().call().await.unwrap()
    }
}

pub mod mock {
    use super::*;

    pub async fn deploy_mock_token_contract(
        wallet: &WalletUnlocked,
    ) -> (ContractId, MockToken<WalletUnlocked>) {
        let contract_id = Contract::load_from(
            MOCK_TOKEN_CONTRACT_BINARY_PATH,
            LoadConfiguration::default(),
        )
        .unwrap()
        .deploy(wallet, TxPolicies::default())
        .await
        .unwrap();

        let id = ContractId::from(contract_id.clone());
        let instance = MockToken::new(contract_id, wallet.clone());

        (id, instance)
    }

    pub async fn deploy_mock_swaylend_contract(
        wallet: &WalletUnlocked,
    ) -> (ContractId, MockSwaylend<WalletUnlocked>) {
        let contract_id: Bech32ContractId = Contract::load_from(
            MOCK_SWAYLEND_CONTRACT_BINARY_PATH,
            LoadConfiguration::default(),
        )
        .unwrap()
        .deploy(wallet, TxPolicies::default())
        .await
        .unwrap();
        let id = ContractId::from(contract_id.clone());
        let instance = MockSwaylend::new(contract_id, wallet.clone());

        (id, instance)
    }

    pub async fn deploy_logger_contract(
        wallet: &WalletUnlocked,
    ) -> (ContractId, Logger<WalletUnlocked>) {
        let contract_id =
            Contract::load_from(LOGGER_CONTRACT_BINARY_PATH, LoadConfiguration::default())
                .unwrap()
                .deploy(wallet, TxPolicies::default())
                .await
                .unwrap();

        let id = ContractId::from(contract_id.clone());
        let instance = Logger::new(contract_id, wallet.clone());

        (id, instance)
    }

    pub async fn add_token(
        contract: &MockToken<WalletUnlocked>,
        name: String,
        symbol: String,
        decimals: u8,
    ) -> CallResponse<AssetId> {
        contract
            .methods()
            .add_token(name, symbol, decimals)
            .call()
            .await
            .unwrap()
    }

    pub async fn mint_tokens(
        contract: &MockToken<WalletUnlocked>,
        asset_id: AssetId,
        amount: u64,
    ) -> CallResponse<()> {
        contract
            .methods()
            .mint_tokens(asset_id, amount)
            .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
            .call()
            .await
            .unwrap()
    }

    pub async fn get_sub_id(
        contract: &MockToken<WalletUnlocked>,
        asset_id: AssetId,
    ) -> CallResponse<Option<Bits256>> {
        contract
            .methods()
            .get_sub_id(asset_id)
            .call()
            .await
            .unwrap()
    }
}

pub mod scripts {
    use super::*;

    pub const MAXIMUM_INPUT_AMOUNT: u64 = 100_000;

    pub async fn get_transaction_inputs_outputs(
        wallet: &WalletUnlocked,
        assets: &Vec<(AssetId, u64)>,
    ) -> (Vec<Input>, Vec<Output>) {
        let mut inputs: Vec<Input> = vec![]; // capacity depends on wallet resources
        let mut outputs: Vec<Output> = Vec::with_capacity(assets.len());

        for (asset, amount) in assets {
            let asset_inputs: Vec<Input> = wallet
                .get_asset_inputs_for_amount(*asset, *amount, None)
                .await
                .unwrap();
            inputs.extend(asset_inputs);
            outputs.push(Output::Change {
                asset_id: *asset,
                amount: 0,
                to: wallet.address().into(),
            });
        }
        (inputs, outputs)
    }
}
