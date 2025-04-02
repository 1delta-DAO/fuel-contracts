use fuels::accounts::wallet::WalletUnlocked;
use fuels::prelude::VariableOutputPolicy;
use fuels::types::{AssetId, ContractId, Identity};
use std::str::FromStr;
use test_harness::data_structures::{MiraAMMContract, WalletAssetConfiguration};
use test_harness::interface::amm::{create_pool, fees, initialize_ownership};
use test_harness::interface::mock::{
    add_token, deploy_logger_contract, deploy_mock_token_contract, get_sub_id, mint_tokens, deploy_mock_swaylend_contract,
};
use test_harness::interface::scripts::get_transaction_inputs_outputs;
use test_harness::interface::{
    AddLiquidityScript, AddLiquidityScriptConfigurables, BatchSwapExactInScript, 
    BatchSwapExactInScriptConfigurables, ComposerScript, ComposerScriptConfigurables
};
use test_harness::interface::{Logger, MiraAMM, MockSwaylend, MarketConfiguration};
use test_harness::paths::{
    ADD_LIQUIDITY_SCRIPT_BINARY_PATH, BATCH_SWAP_EXACT_IN_SCRIPT_BINARY_PATH, COMPOSER_SCRIPT_BINARY_PATH
};
use test_harness::setup::common::{deploy_amm, setup_wallet_and_provider};
use test_harness::types::PoolId;
use test_harness::utils::common::order_sub_ids;
use test_harness::utils::common::MINIMUM_LIQUIDITY;
////////////////////////////////////////////////////
// Create 5 tokens (indexed from 0 to 4) and pools:
// 0-1 [0]
// 1-2 [1]
// 0-2 [2]
// 1-3 [3]
// 2-3 [4]
// For paths:
// [0-1-2]                      solo
// [0-1-2]; [0-2]               multi-path
// [0-1] - [1-2-3]; [1-3]       multi-segment
// [0-1-2]; [0-2] - [2-3]       multi-segment
////////////////////////////////////////////////////
pub async fn setup() -> (
    AddLiquidityScript<WalletUnlocked>,
    ComposerScript<WalletUnlocked>,
    MiraAMMContract,
    MockSwaylend<WalletUnlocked>,
    Logger<WalletUnlocked>,
    (PoolId, PoolId, PoolId, PoolId, PoolId),
    WalletUnlocked,
    u32,
    (AssetId, AssetId, AssetId, AssetId),
    (u64, u64, u64, u64),
) {
    let (wallet, _asset_ids, provider) =
        setup_wallet_and_provider(&WalletAssetConfiguration::default()).await;

    ////////////////////////////////////////////////////
    // deploy mira v1
    ////////////////////////////////////////////////////

    let amm: MiraAMMContract = deploy_amm(&wallet).await;
    initialize_ownership(&amm.instance, Identity::Address(wallet.address().into())).await;

    ////////////////////////////////////////////////////
    // deploy tokens and mint
    ////////////////////////////////////////////////////

    let (token_contract_id, token_contract) = deploy_mock_token_contract(&wallet).await;
    let (logger_contract_id, logger_contract) = deploy_logger_contract(&wallet).await;

    let token_0_id = add_token(&token_contract, "TOKEN_A".to_string(), "TKA".to_string(), 9)
        .await
        .value;
    let token_1_id = add_token(&token_contract, "TOKEN_B".to_string(), "TKB".to_string(), 9)
        .await
        .value;
    let token_2_id = add_token(&token_contract, "TOKEN_C".to_string(), "TKC".to_string(), 9)
        .await
        .value;
    let token_3_id = add_token(&token_contract, "TOKEN_D".to_string(), "TKD".to_string(), 9)
        .await
        .value;

    let mut all_assets = vec![token_0_id, token_1_id, token_2_id, token_3_id];
    all_assets.sort();
    let [token_0_id, token_1_id, token_2_id, token_3_id] = all_assets[..] else {
        todo!()
    };

    let token_0_sub_id = get_sub_id(&token_contract, token_0_id).await.value.unwrap();
    let token_1_sub_id = get_sub_id(&token_contract, token_1_id).await.value.unwrap();
    let token_2_sub_id = get_sub_id(&token_contract, token_2_id).await.value.unwrap();
    let token_3_sub_id = get_sub_id(&token_contract, token_3_id).await.value.unwrap();

    mint_tokens(&token_contract, token_0_id, 1_000_000_000).await;
    mint_tokens(&token_contract, token_1_id, 1_000_000_000).await;
    mint_tokens(&token_contract, token_2_id, 1_000_000_000).await;
    mint_tokens(&token_contract, token_3_id, 1_000_000_000).await;


    ////////////////////////////////////////////////////
    // deploy lender and init

    let (swaylend_contract_id, swaylend_contract) = deploy_mock_swaylend_contract(&wallet).await;

    mint_tokens(&token_contract, token_0_id, 1_000_000_000).await;

    // let marketConfig = MarketConfiguration::default();
    
    // swaylend_contract.activate_contract(marketConfig, Identity::Address(wallet.address().into())).await;

    ////////////////////////////////////////////////////
    // create dex pools
    ////////////////////////////////////////////////////

    let (token_a_sub_id, token_b_sub_id) =
        order_sub_ids((token_0_id, token_1_id), (token_0_sub_id, token_1_sub_id));

    let pool_id_0_1 = create_pool(
        &amm.instance,
        &token_contract,
        token_contract_id,
        token_a_sub_id,
        token_contract_id,
        token_b_sub_id,
        false,
    )
    .await
    .value;

    let (token_c_sub_id, token_d_sub_id) =
        order_sub_ids((token_1_id, token_2_id), (token_1_sub_id, token_2_sub_id));

    let pool_id_1_2 = create_pool(
        &amm.instance,
        &token_contract,
        token_contract_id,
        token_c_sub_id,
        token_contract_id,
        token_d_sub_id,
        false,
    )
    .await
    .value;

    let (token_e_sub_id, token_f_sub_id) =
        order_sub_ids((token_1_id, token_3_id), (token_1_sub_id, token_3_sub_id));

    let pool_id_1_3 = create_pool(
        &amm.instance,
        &token_contract,
        token_contract_id,
        token_e_sub_id,
        token_contract_id,
        token_f_sub_id,
        false,
    )
    .await
    .value;

    let (token_g_sub_id, token_h_sub_id) =
        order_sub_ids((token_2_id, token_3_id), (token_2_sub_id, token_3_sub_id));

    let pool_id_2_3 = create_pool(
        &amm.instance,
        &token_contract,
        token_contract_id,
        token_g_sub_id,
        token_contract_id,
        token_h_sub_id,
        false,
    )
    .await
    .value;

    let (token_g_sub_id, token_h_sub_id) =
        order_sub_ids((token_0_id, token_2_id), (token_0_sub_id, token_2_sub_id));

    let pool_id_0_2 = create_pool(
        &amm.instance,
        &token_contract,
        token_contract_id,
        token_g_sub_id,
        token_contract_id,
        token_h_sub_id,
        false,
    )
    .await
    .value;

    let deadline = provider.latest_block_height().await.unwrap() + 30;

    let add_liquidity_script_configurables = AddLiquidityScriptConfigurables::default()
        .with_MIRA_AMM_CONTRACT_ID(ContractId::from_str(&amm.id.to_string()).unwrap())
        .unwrap();
    let mut add_liquidity_script_instance =
        AddLiquidityScript::new(wallet.clone(), ADD_LIQUIDITY_SCRIPT_BINARY_PATH)
            .with_configurables(add_liquidity_script_configurables);

    add_liquidity_script_instance
        .convert_into_loader()
        .await
        .unwrap();

    let composer_script_configurables = ComposerScriptConfigurables::default()
        .with_MIRA_AMM_CONTRACT_ID(ContractId::from_str(&amm.id.to_string()).unwrap())
        .unwrap()
        .with_LOGGER_CONTRACT_ID(ContractId::from_str(&logger_contract_id.to_string()).unwrap())
        .unwrap()
        .with_SWAYLEND_USDC_MARKET_CONTRACT_ID(ContractId::from_str(&swaylend_contract_id.to_string()).unwrap())
        .unwrap();
        
    let mut composer_script_instance =
        ComposerScript::new(wallet.clone(), COMPOSER_SCRIPT_BINARY_PATH)
            .with_configurables(composer_script_configurables);

    composer_script_instance
        .convert_into_loader()
        .await
        .unwrap();

    let swap_fees = fees(&amm.instance).await.value;
    println!("swap fee config {:?}", swap_fees);

    add_dex_liquidity(
        add_liquidity_script_instance.clone(),
        amm.instance.clone(),
        (
            pool_id_0_1,
            pool_id_1_2,
            pool_id_0_2,
            pool_id_1_3,
            pool_id_2_3,
        ),
        &wallet,
        (token_0_id, token_1_id, token_2_id, token_3_id),
        deadline,
    )
    .await;

    (
        add_liquidity_script_instance,
        composer_script_instance,
        amm,
        swaylend_contract,
        logger_contract,
        (
            pool_id_0_1,
            pool_id_1_2,
            pool_id_0_2,
            pool_id_1_3,
            pool_id_2_3,
        ),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, token_3_id),
        swap_fees,
    )
}

pub async fn add_dex_liquidity(
    add_liquidity_script_instance: AddLiquidityScript<WalletUnlocked>,
    amm: MiraAMM<WalletUnlocked>,
    (pool_id_0_1, pool_id_1_2, pool_id_0_2, pool_id_1_3, pool_id_2_3): (
        PoolId,
        PoolId,
        PoolId,
        PoolId,
        PoolId,
    ),
    wallet: &WalletUnlocked,
    (token_0_id, token_1_id, token_2_id, token_3_id): (AssetId, AssetId, AssetId, AssetId),
    deadline: u32,
) {
    println!("add dex liquidity {:?}", amm.contract_id());
    ////////////////////////////////////////////////////
    // add dex liquidity
    ////////////////////////////////////////////////////

    let amount_0_desired: u64 = 1_000_000;
    let amount_1_desired: u64 = 1_000_000;
    let expected_liquidity: u64 = 1_000_000 - MINIMUM_LIQUIDITY;

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_0_id, amount_0_desired),
            (token_1_id, amount_1_desired),
        ],
    )
    .await;

    // adds initial liquidity
    let added_liquidity = add_liquidity_script_instance
        .main(
            pool_id_0_1,
            amount_0_desired,
            amount_1_desired,
            0,
            0,
            wallet.address().into(),
            deadline,
        )
        .with_contracts(&[&amm])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    assert_eq!(added_liquidity.amount, expected_liquidity);

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_1_id, amount_0_desired),
            (token_2_id, amount_1_desired),
        ],
    )
    .await;

    // adds initial liquidity
    let added_liquidity = add_liquidity_script_instance
        .main(
            pool_id_1_2,
            amount_0_desired,
            amount_1_desired,
            0,
            0,
            wallet.address().into(),
            deadline,
        )
        .with_contracts(&[&amm])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    assert_eq!(added_liquidity.amount, expected_liquidity);

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_0_id, amount_0_desired),
            (token_2_id, amount_1_desired),
        ],
    )
    .await;

    // adds initial liquidity
    let added_liquidity = add_liquidity_script_instance
        .main(
            pool_id_0_2,
            amount_0_desired,
            amount_1_desired,
            0,
            0,
            wallet.address().into(),
            deadline,
        )
        .with_contracts(&[&amm])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    assert_eq!(added_liquidity.amount, expected_liquidity);

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_2_id, amount_0_desired),
            (token_3_id, amount_1_desired),
        ],
    )
    .await;

    // adds initial liquidity
    let added_liquidity = add_liquidity_script_instance
        .main(
            pool_id_2_3,
            amount_0_desired,
            amount_1_desired,
            0,
            0,
            wallet.address().into(),
            deadline,
        )
        .with_contracts(&[&amm])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    assert_eq!(added_liquidity.amount, expected_liquidity);

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_1_id, amount_0_desired),
            (token_3_id, amount_1_desired),
        ],
    )
    .await;

    // adds initial liquidity
    let added_liquidity = add_liquidity_script_instance
        .main(
            pool_id_1_3,
            amount_0_desired,
            amount_1_desired,
            0,
            0,
            wallet.address().into(),
            deadline,
        )
        .with_contracts(&[&amm])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    assert_eq!(added_liquidity.amount, expected_liquidity);
}
