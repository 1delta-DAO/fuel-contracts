use std::str::FromStr;

use crate::utils::setup;
use fuels::accounts::wallet::WalletUnlocked;
use fuels::accounts::ViewOnlyAccount;
use fuels::prelude::VariableOutputPolicy;
use fuels::programs::calls::Execution;
use fuels::types::{AssetId, Identity};
use test_harness::data_structures::MiraAMMContract;
use test_harness::interface::amm::pool_metadata;
use test_harness::interface::scripts::get_transaction_inputs_outputs;
use test_harness::interface::{
    Action, BatchSwapStep, ComposerScript, LenderAction, Logger, MockSwaylend, PriceDataUpdate,
    SwapPath, SwapPathList,
};
use test_harness::types::encode_mira_params;
use test_harness::utils::common::pool_assets_balance;

/** Simple swap test to ensure that it still works */
#[tokio::test]
async fn composer_exact_in_swap_between_two_volatile_tokens() {
    let (
        _,
        composer_script,
        amm,
        _,
        logger,
        (pool_id_0_1, _, _, _, _),
        wallet,
        deadline,
        (token_0_id, token_1_id, _, _),
        swap_fees,
    ) = setup().await;

    let token_0_to_swap = 1_000;
    let token_1_expected = 996;

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_0_id, token_0_to_swap)]).await;
    let wallet_balances_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let pool_metadata_before = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();

    // execute swap
    let paths = vec![SwapPath {
        amount_in: token_0_to_swap,
        min_amount_out: 0u64,
        transfer_in: true,
        steps: vec![BatchSwapStep {
            dex_id: 0,
            asset_in: token_0_id,
            asset_out: token_1_id,
            receiver: wallet.address().into(),
            data: encode_mira_params(swap_fees.0, false),
            // data: encode_mira_params_with_dex_address(swap_fees.0, false, Bits256(*amm.id)),
        }],
    }];

    let actions = vec![Action::Swap(SwapPathList { paths })];

    composer_script
        .main(actions, deadline)
        .with_contracts(&[&amm.instance, &logger])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
        .call()
        .await
        .unwrap();

    let wallet_balances_after = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let pool_metadata_after = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    assert_eq!(
        wallet_balances_after.asset_a,
        wallet_balances_before.asset_a - token_0_to_swap
    );
    assert_eq!(
        wallet_balances_after.asset_b,
        wallet_balances_before.asset_b + token_1_expected
    );
    assert_eq!(
        pool_metadata_after.reserve_0,
        pool_metadata_before.reserve_0 + token_0_to_swap
    );
    assert_eq!(
        pool_metadata_after.reserve_1,
        pool_metadata_before.reserve_1 - token_1_expected
    );
}

/** Open test */
#[tokio::test]
async fn composer_open() {
    setup_and_composer_open().await;
}

/** Open loop test */
#[tokio::test]
async fn composer_open_loop() {
    let (
        _,
        composer_script,
        amm,
        swaylend,
        logger,
        (_, _, _, _, _),
        wallet,
        deadline,
        (base_token_id, token_1_id, _, _),
        swap_fees,
    ) = setup().await;

    let token_1_to_deposit = 1_000;
    let base_token_to_borrow = 1_000;

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (base_token_id, base_token_to_borrow),
            (token_1_id, token_1_to_deposit),
        ],
    )
    .await;

    let (base_deposits_before, debt_before) = get_swaylend_base_balances(&swaylend, &wallet).await;

    let collateral_before = get_swaylend_collateral(token_1_id, &swaylend, &wallet).await;

    let borrow = LenderAction {
        lender_id: 0,
        action_id: 1,
        asset: base_token_id,
        amount_in: base_token_to_borrow / 2,
        amount_type_id: 1,
        data: Some(PriceDataUpdate {
            update_fee: 0u64,
            publish_times: vec![],
            price_feed_ids: vec![],
            update_data: vec![],
        }),
        market: swaylend.contract_id().into(),
    };
    // execute swap
    let paths0 = vec![SwapPath {
        amount_in: base_token_to_borrow / 2,
        min_amount_out: 490u64,
        transfer_in: true,
        steps: vec![BatchSwapStep {
            dex_id: 0,
            asset_in: base_token_id,
            asset_out: token_1_id,
            receiver: wallet.address().into(),
            data: encode_mira_params(swap_fees.0, false),
        }],
    }];

    // execute swap
    let paths1 = vec![SwapPath {
        amount_in: base_token_to_borrow / 2,
        min_amount_out: 490u64,
        transfer_in: true,
        steps: vec![BatchSwapStep {
            dex_id: 0,
            asset_in: base_token_id,
            asset_out: token_1_id,
            receiver: wallet.address().into(),
            data: encode_mira_params(swap_fees.0, false),
        }],
    }];

    // execute lending operation
    let deposit = LenderAction {
        lender_id: 0,
        action_id: 0,
        asset: token_1_id,
        amount_in: 0,
        amount_type_id: 0,
        data: None,
        market: swaylend.contract_id().into(),
    };

    let actions = vec![
        Action::Lending(borrow.clone()),
        Action::Swap(SwapPathList { paths: paths0 }),
        Action::Lending(deposit.clone()),
        Action::Lending(borrow),
        Action::Swap(SwapPathList { paths: paths1 }),
        Action::Lending(deposit),
    ];

    composer_script
        .main(actions, deadline)
        .with_contracts(&[&amm.instance, &logger, &swaylend])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(4))
        .call()
        .await
        .unwrap();

    let (base_deposits_after, debt_after) = get_swaylend_base_balances(&swaylend, &wallet).await;
    let collateral_after = get_swaylend_collateral(token_1_id, &swaylend, &wallet).await;

    println!("deposits: {:} debt: {:}", collateral_after, debt_after);
    let amount_expected = 994u64;
    // assert_eq!(token_1_balance, token_1_balance_before - token_1_to_deposit);
    if debt_before == 0 {
        assert_eq!(
            base_deposits_before - base_deposits_after,
            base_token_to_borrow
        );
    } else {
        assert_eq!(debt_after - debt_before, base_token_to_borrow);
    }
    assert_eq!(collateral_after - collateral_before, amount_expected);
}

/** Close test */
#[tokio::test]
async fn composer_close() {
    let (
        composer_script,
        amm,
        swaylend,
        logger,
        _,
        wallet,
        deadline,
        (base_token_id, token_1_id),
        swap_fees,
    ) = setup_and_composer_open().await;

    let (a0, b0) = get_swaylend_base_balances(&swaylend, &wallet).await;

    println!("deposits: {:} debt: {:}", a0, b0);

    let withdraw_amount = 1_000;

    // execute lending operation
    let withdraw = LenderAction {
        lender_id: 0,
        action_id: 2,
        asset: token_1_id,
        amount_in: withdraw_amount,
        amount_type_id: 1,
        data: Some(PriceDataUpdate {
            update_fee: 0u64,
            publish_times: vec![],
            price_feed_ids: vec![],
            update_data: vec![],
        }),
        market: swaylend.contract_id().into(),
    };

    let repay = LenderAction {
        lender_id: 0,
        action_id: 3,
        asset: base_token_id,
        amount_in: 0,
        amount_type_id: 0,
        data: None,
        market: swaylend.contract_id().into(),
    };

    // execute swap
    let paths = vec![SwapPath {
        amount_in: withdraw_amount,
        min_amount_out: 1u64,
        transfer_in: true,
        steps: vec![BatchSwapStep {
            dex_id: 0,
            asset_in: token_1_id,
            asset_out: base_token_id,
            receiver: wallet.address().into(),
            data: encode_mira_params(swap_fees.0, false),
        }],
    }];

    let actions_close = vec![
        Action::Lending(withdraw),
        Action::Swap(SwapPathList { paths }),
        Action::Lending(repay),
    ];

    let (inputs_close, outputs_close) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_1_id, withdraw_amount),
            (base_token_id, 1),
            // (AssetId::BASE, 1)
        ],
    )
    .await;

    // println!("token1: {:}", token_1_id);
    // println!("base_token_id: {:}", base_token_id);
    // let mut _plain_address: Address = wallet.address().into();
    // println!("wallet: {:}", _plain_address);
    // println!("swaylend: {:}", swaylend.contract_id().hash());

    composer_script
        .main(actions_close, deadline)
        .with_contracts(&[&amm.instance, &logger, &swaylend])
        .with_inputs(inputs_close)
        .with_outputs(outputs_close)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap();

    let expected_diff = 996;

    let (a, b) = get_swaylend_base_balances(&swaylend, &wallet).await;

    println!("deposits: {:} debt: {:}", a, b);

    assert_eq!(expected_diff, a - a0);
}

async fn get_swaylend_base_balances(
    swaylend: &MockSwaylend<WalletUnlocked>,
    wallet: &WalletUnlocked,
) -> (u64, u64) {
    let (a, b) = swaylend
        .methods()
        .get_user_supply_borrow(Identity::Address(wallet.address().into()))
        .simulate(Execution::StateReadOnly)
        .await
        .unwrap()
        .value;

    return (
        u64::from_str(&a.to_string()).unwrap(),
        u64::from_str(&b.to_string()).unwrap(),
    );
}

async fn get_swaylend_collateral(
    asset_id: AssetId,
    swaylend: &MockSwaylend<WalletUnlocked>,
    wallet: &WalletUnlocked,
) -> u64 {
    return swaylend
        .methods()
        .get_user_collateral(Identity::Address(wallet.address().into()), asset_id)
        .simulate(Execution::StateReadOnly)
        .await
        .unwrap()
        .value;
}
/**
 * Sets up the fixture and opens a basic position (compatible with the pool provided)
 */
async fn setup_and_composer_open() -> (
    ComposerScript<WalletUnlocked>,
    MiraAMMContract,
    MockSwaylend<WalletUnlocked>,
    Logger<WalletUnlocked>,
    (AssetId, AssetId, bool),
    WalletUnlocked,
    u32,
    (AssetId, AssetId),
    (u64, u64, u64, u64),
) {
    let (
        _,
        composer_script,
        amm,
        swaylend,
        logger,
        (pool_id_0_1, _, _, _, _),
        wallet,
        deadline,
        (base_token_id, token_1_id, _, _),
        swap_fees,
    ) = setup().await;

    let token_1_to_deposit = 2_000;
    let base_token_to_borrow = 1_000;

    let (inputs, outputs) = get_transaction_inputs_outputs(
        &wallet,
        &vec![
            (token_1_id, token_1_to_deposit),
            (base_token_id, base_token_to_borrow),
        ],
    )
    .await;
    let token_1_balance_before = wallet.get_asset_balance(&token_1_id).await.unwrap();
    let base_balance_before = wallet.get_asset_balance(&base_token_id).await.unwrap();

    // execute lending operation
    let deposit = LenderAction {
        lender_id: 0,
        action_id: 0,
        asset: token_1_id,
        amount_in: token_1_to_deposit,
        amount_type_id: 1,
        data: None,
        market: swaylend.contract_id().into(),
    };

    let borrow = LenderAction {
        lender_id: 0,
        action_id: 1,
        asset: base_token_id,
        amount_in: base_token_to_borrow,
        amount_type_id: 1,
        data: Some(PriceDataUpdate {
            update_fee: 0u64,
            publish_times: vec![],
            price_feed_ids: vec![],
            update_data: vec![],
        }),
        market: swaylend.contract_id().into(),
    };

    let actions = vec![Action::Lending(deposit), Action::Lending(borrow)];

    composer_script
        .main(actions, deadline)
        .with_contracts(&[&amm.instance, &logger, &swaylend])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
        .call()
        .await
        .unwrap();

    let token_1_balance = wallet.get_asset_balance(&token_1_id).await.unwrap();
    let base_balance = wallet.get_asset_balance(&base_token_id).await.unwrap();

    assert_eq!(token_1_balance, token_1_balance_before - token_1_to_deposit);
    assert_eq!(base_token_to_borrow, base_balance - base_balance_before);

    return (
        composer_script,
        amm,
        swaylend,
        logger,
        pool_id_0_1,
        wallet,
        deadline,
        (base_token_id, token_1_id),
        swap_fees,
    );
}
