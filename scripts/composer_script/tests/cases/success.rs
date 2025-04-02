use crate::utils::setup;
use fuels::prelude::VariableOutputPolicy;
use fuels::types::Bits256;
use test_harness::interface::amm::pool_metadata;
use test_harness::interface::scripts::get_transaction_inputs_outputs;
use test_harness::interface::{Action, SwapPathList, LenderAction, SwapPath, BatchSwapStep};
use test_harness::types::{encode_mira_params, encode_mira_params_with_dex_address};
use test_harness::utils::common::{asset_balance, pool_assets_balance};

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

#[tokio::test]
async fn composer_deposit() {
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

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_1_id, token_1_to_deposit), (base_token_id, token_1_to_deposit)]).await;
    let wallet_balances_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;

    // execute lending operation
    let deposit = LenderAction {
        lender_id: 0,
        action_id: 0,
        asset: token_1_id,
        amount_in: token_1_to_deposit,
        amount_type_id: 1,
        receiver: wallet.address().into(),
        data: None,
    };

    // let borrow = LenderAction {
    //     lender_id: 0,
    //     action_id: 1,
    //     asset: base_token_id,
    //     amount_in: base_token_to_borrow,
    //     amount_type_id: 1,
    //     receiver: wallet.address().into(),
    //     data: None,
    // };

    let actions = vec![Action::Lending(deposit)];

    composer_script
        .main(actions, deadline)
        .with_contracts(&[&amm.instance, &logger, &swaylend])
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
        wallet_balances_after.asset_b,
        wallet_balances_before.asset_b - token_1_to_deposit
    );
    // assert_eq!(
    //     wallet_balances_after.asset_a,
    //     wallet_balances_before.asset_a - base_token_to_borrow
    // );
}