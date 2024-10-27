use crate::utils::setup;
use fuels::prelude::VariableOutputPolicy;
use test_harness::interface::amm::pool_metadata;
use test_harness::interface::scripts::get_transaction_inputs_outputs;
use test_harness::interface::ExactInSwapStep;
use test_harness::types::encode_mira_params;
use test_harness::utils::common::{pool_assets_balance};

#[tokio::test]
async fn swap_between_two_volatile_tokens() {
    let (
        _,
        swap_exact_input_script,
        amm,
        (pool_id_0_1, pool_id_1_2, pool_id_0_2, pool_id_1_3, pool_id_2_3),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, token_3_id),
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
    let path = vec![(
        token_0_to_swap,
        0u64,
        true,
        vec![ExactInSwapStep {
            dex_id: 0,
            asset_in: token_0_id,
            asset_out: token_1_id,
            receiver: wallet.address().into(),
            data: Some(encode_mira_params(swap_fees.0, false)),
        }],
    )];
    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance])
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
async fn swap_between_three_volatile_tokens() {
    let (
        _,
        swap_exact_input_script,
        amm,
        (pool_id_0_1, pool_id_1_2, pool_id_0_2, pool_id_1_3, pool_id_2_3),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, token_3_id),
        swap_fees,
    ) = setup().await;

    let token_0_to_swap = 1_000;
    let token_1_expected = 996;
    let token_2_expected: u64 = 992;

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_0_id, token_0_to_swap)]).await;

    let wallet_balances_0_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_1_before = pool_assets_balance(&wallet, &pool_id_1_2, amm.id).await;
    let pool_metadata_0_before = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    let pool_metadata_1_before = pool_metadata(&amm.instance, pool_id_1_2)
        .await
        .value
        .unwrap();

    let path = vec![(
        token_0_to_swap,
        0u64,
        true,
        vec![
            ExactInSwapStep {
                dex_id: 0,
                asset_in: token_0_id,
                asset_out: token_1_id,
                receiver: amm.id.into(),
                data: Some(encode_mira_params(swap_fees.0, false)),
            },
            ExactInSwapStep {
                dex_id: 0,
                asset_in: token_1_id,
                asset_out: token_2_id,
                receiver: wallet.address().into(),
                data: Some(encode_mira_params(swap_fees.0, false)),
            },
        ],
    )];

    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
        .call()
        .await
        .unwrap()
        .value;
    let pool_metadata_0_after = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    let pool_metadata_1_after = pool_metadata(&amm.instance, pool_id_1_2)
        .await
        .value
        .unwrap();
    let wallet_balances_0_after = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_1_after = pool_assets_balance(&wallet, &pool_id_1_2, amm.id).await;

    assert_eq!(
        wallet_balances_0_after.asset_a,
        wallet_balances_0_before.asset_a - token_0_to_swap
    );
    assert_eq!(
        wallet_balances_0_after.asset_b,
        wallet_balances_0_before.asset_b
    );
    assert_eq!(
        wallet_balances_1_after.asset_b,
        wallet_balances_1_before.asset_b + token_2_expected
    );

    assert_eq!(
        pool_metadata_0_after.reserve_0,
        pool_metadata_0_before.reserve_0 + token_0_to_swap
    );
    assert_eq!(
        pool_metadata_0_after.reserve_1,
        pool_metadata_0_before.reserve_1 - token_1_expected
    );
    assert_eq!(
        pool_metadata_1_after.reserve_0,
        pool_metadata_1_before.reserve_0 + token_1_expected
    );
    assert_eq!(
        pool_metadata_1_after.reserve_1,
        pool_metadata_1_before.reserve_1 - token_2_expected
    );
}

#[tokio::test]
async fn swap_split_routes() {
    let (
        _,
        swap_exact_input_script,
        amm,
        (pool_id_0_1, pool_id_1_2, pool_id_0_2, _, _),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, _),
        swap_fees,
    ) = setup().await;

    let token_0_to_swap = 1_000;
    let token_1_expected = 996;
    let token_2_expected: u64 = 992;

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_0_id, token_0_to_swap)]).await;

    let wallet_balances_0_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_1_before = pool_assets_balance(&wallet, &pool_id_1_2, amm.id).await;
    let pool_metadata_0_before = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    let pool_metadata_1_before = pool_metadata(&amm.instance, pool_id_1_2)
        .await
        .value
        .unwrap();

    let path = vec![(
        token_0_to_swap,
        0u64,
        true,
        vec![
            ExactInSwapStep {
                dex_id: 0,
                asset_in: token_0_id,
                asset_out: token_1_id,
                receiver: amm.id.into(),
                data: Some(encode_mira_params(swap_fees.0, false)),
            },
            ExactInSwapStep {
                dex_id: 0,
                asset_in: token_1_id,
                asset_out: token_2_id,
                receiver: wallet.address().into(),
                data: Some(encode_mira_params(swap_fees.0, false)),
            },
        ],
    )];

    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
        .call()
        .await
        .unwrap()
        .value;
    let pool_metadata_0_after = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    let pool_metadata_1_after = pool_metadata(&amm.instance, pool_id_1_2)
        .await
        .value
        .unwrap();
    let wallet_balances_0_after = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_1_after = pool_assets_balance(&wallet, &pool_id_1_2, amm.id).await;

    assert_eq!(
        wallet_balances_0_after.asset_a,
        wallet_balances_0_before.asset_a - token_0_to_swap
    );
    assert_eq!(
        wallet_balances_0_after.asset_b,
        wallet_balances_0_before.asset_b
    );
    assert_eq!(
        wallet_balances_1_after.asset_b,
        wallet_balances_1_before.asset_b + token_2_expected
    );

    assert_eq!(
        pool_metadata_0_after.reserve_0,
        pool_metadata_0_before.reserve_0 + token_0_to_swap
    );
    assert_eq!(
        pool_metadata_0_after.reserve_1,
        pool_metadata_0_before.reserve_1 - token_1_expected
    );
    assert_eq!(
        pool_metadata_1_after.reserve_0,
        pool_metadata_1_before.reserve_0 + token_1_expected
    );
    assert_eq!(
        pool_metadata_1_after.reserve_1,
        pool_metadata_1_before.reserve_1 - token_2_expected
    );
}
