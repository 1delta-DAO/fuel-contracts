import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput, contractIdInput, prepareRequest } from '../ts-scripts/utils';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { BigNumberish, CoinQuantity } from 'fuels';
import { BatchSwapStepInput } from '../ts-scripts/typegen/BatchSwapExactInScript';
import { txParams } from '../ts-scripts/utils/constants';

describe('Order fill with custom maker_receiver', async () => {


  test('Facilitates full order fill to custom receiver', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker, taker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = OrderTestUtils.getRandomAmount()

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()


    const taker_amount = OrderTestUtils.getRandomAmount()

    let nonce = OrderTestUtils.getRandomAmount(1)

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce,
      maker_traits: OrderTestUtils.encodeTraits(),
      maker_receiver: maker.address.toB256()
    })

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    const [
      maker_maker_asset_balance_before,
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset],
      Orders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )


    const [
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      maker,
      [taker_asset]
    )


    const [
      total_maker_asset_balance_before,
      total_taker_asset_balance_before
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
      .call()


    await OrderTestUtils.testFillStatus(order, Orders, order.taker_amount, false)

    const [
      maker_maker_asset_balance_after,
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset],
      Orders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    const [
      maker_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      maker,
      [taker_asset]
    )

    const [
      total_maker_asset_balance_after,
      total_taker_asset_balance_after
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )

    // validate maker change
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toString()
    ).to.equal(
      maker_amount.toString()
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      taker_amount.toString()
    )

    // validate total balances
    expect(
      total_maker_asset_balance_before.sub(total_maker_asset_balance_after).toString()
    ).to.equal(
      maker_amount.toString()
    )
    // unchanged balance due to order.maker_recevier being defined
    expect(
      total_taker_asset_balance_after.sub(total_taker_asset_balance_before).toString()
    ).to.equal(
      "0"
    )

    // validate taker change
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toString()
    ).to.equal(
      maker_amount.toString()
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_amount.toString()
    )
  });

  test('Facilitates multihop partial order fill exact input', async () => {
    /**
     * We test a swap taker_asset -> intermediate_asset -> maker_asset
     */

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker0, deployer, taker, maker1]
    } = launched;

    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset, intermediate_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), OrderTestUtils.EXTENDED_NAMES)

    await OrderTestUtils.fundWallets(
      [maker1, taker, maker0],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset, intermediate_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = OrderTestUtils.getRandomAmount()
    const intermediate_amount = OrderTestUtils.getRandomAmount()
    const taker_amount = OrderTestUtils.getRandomAmount()


    await OrderTestUtils.createMakerDeposits(maker1, Orders, [maker_asset], [maker_amount.toNumber()])
    await OrderTestUtils.createMakerDeposits(maker0, Orders, [intermediate_asset], [intermediate_amount.toNumber()])

    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getMakerBalances(
      maker0.address.toB256(),
      [maker_asset, taker_asset],
      Orders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )


    const [
      maker0_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      maker0,
      [taker_asset]
    )

    const [
      maker1_intermediate_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      maker1,
      [intermediate_asset]
    )


    const [
      total_maker_asset_balance_before,
      total_taker_asset_balance_before
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )

    /** DEFINE PARAMETERS */

    const order0: OrderInput = OrderTestUtils.getOrder({
      maker_asset: intermediate_asset, // asset_mid
      taker_asset, // asset_in
      maker_amount: intermediate_amount,
      taker_amount,
      maker: maker0.address.toB256(),
      maker_traits: OrderTestUtils.encodeTraits(),
      maker_receiver: maker0.address.toB256()
    })

    const order1: OrderInput = OrderTestUtils.getOrder({
      maker_asset, // asset_out
      taker_asset: intermediate_asset, // asset_mid
      maker_amount,
      taker_amount: intermediate_amount,
      maker: maker1.address.toB256(),
      maker_traits: OrderTestUtils.encodeTraits(),
      maker_receiver: maker1.address.toB256(),
    })

    const taker_fill_amount = OrderTestUtils.getRandomAmount(1, taker_amount.toNumber()) // this is the actual amount_in

    const intermediate_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order0.maker_amount, order0.taker_amount)

    const maker_fill_amount = OrderTestUtils.computeMakerFillAmount(intermediate_fill_amount, order1.maker_amount, order1.taker_amount)

    const signatureRaw0 = await maker0.signMessage(OrderTestUtils.packOrder(order0, Orders))
    const signatureRaw1 = await maker1.signMessage(OrderTestUtils.packOrder(order1, Orders))

    const swap_step0 = OrderTestUtils.createRfqBatchSwapStep(order0, signatureRaw0, contractIdInput(Orders.id))
    const swap_step1 = OrderTestUtils.createRfqBatchSwapStep(order1, signatureRaw1, addressInput(taker.address))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
      [
        taker_fill_amount,
        1, // maker_fill_amount.sub(1),
        true,
        [
          swap_step0,
          swap_step1
        ]
      ]
    ]

    const deadline = OrderTestUtils.MAX_EXPIRY

    const request = await (await OrderTestUtils.callExactInScriptScope(path, deadline, taker, Orders.id.toB256()))
      .addContracts([Orders])
      .txParams(txParams)
      .getTransactionRequest()

    const inputAssets: CoinQuantity[] = [
      {
        assetId: taker_asset,
        amount: taker_fill_amount,
      }
    ];

    const finalRequest = await prepareRequest(taker, request, 3, inputAssets, [Orders.id.toB256()])

    /** EXECUTE TXN */

    const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
    await tx.waitForResult()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await OrderTestUtils.getMakerBalances(
      maker0.address.toB256(),
      [maker_asset, taker_asset],
      Orders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    const [
      total_maker_asset_balance_after,
      total_taker_asset_balance_after
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )


    const [
      maker0_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      maker0,
      [taker_asset]
    )

    const [
      maker1_intermediate_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      maker1,
      [intermediate_asset]
    )

    // validate maker change
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toString()
    ).to.equal(
      "0"
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      "0"
    )


    // validate maker change
    expect(
      maker0_taker_asset_balance_after.sub(maker0_taker_asset_balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )
    // validate maker change
    expect(
      maker1_intermediate_asset_balance_after.sub(maker1_intermediate_asset_balance_before).toString()
    ).to.equal(
      intermediate_fill_amount.toString()
    )


    // validate total balances
    expect(
      total_maker_asset_balance_before.sub(total_maker_asset_balance_after).toString()
    ).to.equal(
      maker_fill_amount.toString()
    )
    // taker funds are sent to maker, as such the change here is zero
    expect(
      total_taker_asset_balance_after.sub(total_taker_asset_balance_before).toString()
    ).to.equal(
      "0"
    )

    // validate taker change
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toString()
    ).to.equal(
      maker_fill_amount.toString()
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )
  });
});
