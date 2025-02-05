use crate::utils::setup;
use fuels::prelude::VariableOutputPolicy;
use fuels::types::Bits256;
use test_harness::interface::amm::pool_metadata;
use test_harness::interface::scripts::get_transaction_inputs_outputs;
use test_harness::interface::BatchSwapStep;
use test_harness::types::{encode_mira_params, encode_mira_params_with_dex_address};
use test_harness::utils::common::{asset_balance, pool_assets_balance};

#[tokio::test]
async fn exact_in_swap_between_two_volatile_tokens() {
    let (
        _,
        swap_exact_input_script,
        amm,
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
    let path = vec![(
        token_0_to_swap,
        0u64,
        true,
        vec![BatchSwapStep {
            dex_id: 0,
            asset_in: token_0_id,
            asset_out: token_1_id,
            receiver: wallet.address().into(),
            data: encode_mira_params(swap_fees.0, false),
        }],
    )];
    swap_exact_input_script
        .main(path, deadline)
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
async fn exact_in_swap_between_three_volatile_tokens() {
    let (
        _,
        swap_exact_input_script,
        amm,
        logger,
        (pool_id_0_1, pool_id_1_2, _, _, _),
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
            BatchSwapStep {
                dex_id: 0,
                asset_in: token_0_id,
                asset_out: token_1_id,
                receiver: amm.id.into(),
                data: encode_mira_params(swap_fees.0, false),
            },
            BatchSwapStep {
                dex_id: 0,
                asset_in: token_1_id,
                asset_out: token_2_id,
                receiver: wallet.address().into(),
                data: encode_mira_params(swap_fees.0, false),
            },
        ],
    )];

    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance, &logger])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(1))
        .call()
        .await
        .unwrap()
        .value;
    let pool_metadata_0_1_after = pool_metadata(&amm.instance, pool_id_0_1)
        .await
        .value
        .unwrap();
    let pool_metadata_1_2_after = pool_metadata(&amm.instance, pool_id_1_2)
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
        pool_metadata_0_1_after.reserve_0,
        pool_metadata_0_before.reserve_0 + token_0_to_swap
    );
    assert_eq!(
        pool_metadata_0_1_after.reserve_1,
        pool_metadata_0_before.reserve_1 - token_1_expected
    );
    assert_eq!(
        pool_metadata_1_2_after.reserve_0,
        pool_metadata_1_before.reserve_0 + token_1_expected
    );
    assert_eq!(
        pool_metadata_1_2_after.reserve_1,
        pool_metadata_1_before.reserve_1 - token_2_expected
    );
}

#[tokio::test]
async fn exact_in_swap_split_routes() {
    let (
        _,
        swap_exact_input_script,
        amm,
        logger,
        (pool_id_0_1, pool_id_1_2, _, _, _),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, _),
        swap_fees,
    ) = setup().await;

    let token_0_to_swap = 1_000;

    let token_0_to_swap_split_0 = token_0_to_swap / 4;
    let token_0_to_swap_split_1 = token_0_to_swap * 3 / 4;
    let token_2_expected: u64 = 992;

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_0_id, token_0_to_swap)]).await;

    let wallet_balances_0_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_1_before = pool_assets_balance(&wallet, &pool_id_1_2, amm.id).await;

    let path = vec![
        (
            token_0_to_swap_split_0, // 25%
            0u64,
            true,
            vec![
                BatchSwapStep {
                    dex_id: 0,
                    asset_in: token_0_id,
                    asset_out: token_1_id,
                    receiver: amm.id.into(),
                    data: encode_mira_params(swap_fees.0, false),
                },
                BatchSwapStep {
                    dex_id: 0,
                    asset_in: token_1_id,
                    asset_out: token_2_id,
                    receiver: wallet.address().into(),
                    data: encode_mira_params(swap_fees.0, false),
                },
            ],
        ),
        (
            token_0_to_swap_split_1, // 75%
            0u64,
            true,
            vec![BatchSwapStep {
                dex_id: 0,
                asset_in: token_0_id,
                asset_out: token_2_id,
                receiver: wallet.address().into(),
                data: encode_mira_params(swap_fees.0, false),
            }],
        ),
    ];

    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance, &logger])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

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
}

#[tokio::test]
async fn exact_in_swap_split_segment() {
    let (
        _,
        swap_exact_input_script,
        amm,
        logger,
        (pool_id_0_1, _, _, _, _),
        wallet,
        deadline,
        (token_0_id, token_1_id, token_2_id, token_3_id),
        swap_fees,
    ) = setup().await;

    let token_0_to_swap = 1_000;

    let token_0_to_swap_split_0 = token_0_to_swap / 4;
    let token_0_to_swap_split_1 = token_0_to_swap * 3 / 4;
    let token_3_expected: u64 = 986;

    let (inputs, outputs) =
        get_transaction_inputs_outputs(&wallet, &vec![(token_0_id, token_0_to_swap)]).await;

    let wallet_balances_0_before = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;
    let wallet_balances_3_before = asset_balance(&wallet, &token_3_id).await;

    // swap
    // 0->2
    // 0->1->2
    // then
    // 2->3
    let path = vec![
        (
            token_0_to_swap_split_0, // 25%
            0u64,
            true,
            vec![BatchSwapStep {
                dex_id: 0,
                asset_in: token_0_id,
                asset_out: token_2_id,
                receiver: amm.id.into(),
                data: encode_mira_params_with_dex_address(swap_fees.0, false, Bits256(*amm.id)),
            }],
        ),
        (
            token_0_to_swap_split_1, // 75%
            0u64,
            true,
            vec![
                BatchSwapStep {
                    dex_id: 0,
                    asset_in: token_0_id,
                    asset_out: token_1_id,
                    receiver: amm.id.into(),
                    data: encode_mira_params_with_dex_address(swap_fees.0, false, Bits256(*amm.id)),
                },
                BatchSwapStep {
                    dex_id: 0,
                    asset_in: token_1_id,
                    asset_out: token_2_id,
                    receiver: amm.id.into(),
                    data: encode_mira_params(swap_fees.0, false),
                },
            ],
        ),
        (
            0, // 100%
            0u64,
            false,
            vec![BatchSwapStep {
                dex_id: 0,
                asset_in: token_2_id,
                asset_out: token_3_id,
                receiver: wallet.address().into(),
                data: encode_mira_params_with_dex_address(swap_fees.0, false, Bits256(*amm.id)),
            }],
        ),
    ];

    swap_exact_input_script
        .main(path, deadline)
        .with_contracts(&[&amm.instance, &logger])
        .with_inputs(inputs)
        .with_outputs(outputs)
        .with_variable_output_policy(VariableOutputPolicy::Exactly(2))
        .call()
        .await
        .unwrap()
        .value;

    let wallet_balances_0_after = pool_assets_balance(&wallet, &pool_id_0_1, amm.id).await;

    assert_eq!(
        wallet_balances_0_after.asset_a,
        wallet_balances_0_before.asset_a - token_0_to_swap
    );
    assert_eq!(
        wallet_balances_0_after.asset_b,
        wallet_balances_0_before.asset_b
    );

    let wallet_balances_3_after = asset_balance(&wallet, &token_3_id).await;

    assert_eq!(
        wallet_balances_3_after,
        wallet_balances_3_before + token_3_expected
    );
}
