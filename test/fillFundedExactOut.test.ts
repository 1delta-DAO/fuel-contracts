import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { BigNumberish, CoinQuantity, } from 'fuels';
import { addressInput, contractIdInput, prepareRequest } from '../ts-scripts/utils';

import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { BatchSwapStepInput } from '../ts-scripts/typegen/BatchSwapExactInScript';
import { txParams } from '../ts-scripts/utils/constants';
import { OrderTestUtils } from './utils';

describe('Order fill via `fill_funded` through BatchSwapExactOutScript', async () => {

  test('Facilitates partial order fill exact output', async () => {
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
    const taker_amount = OrderTestUtils.getRandomAmount()


    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()


    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
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

    /** DEFINE PARAMETERS */

    const order: OrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const maker_fill_amount = OrderTestUtils.getRandomAmount(1, maker_amount.toNumber())

    const taker_fill_amount = OrderTestUtils.computeTakerFillAmount(maker_fill_amount, order.maker_amount, order.taker_amount)

    const re_computed_maker_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)

    // make sure that we at least receive the desired amount (assuming forward swaps)
    expect(re_computed_maker_fill_amount.toNumber()).to.be.greaterThanOrEqual(maker_fill_amount.toNumber())


    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    const swap_step = OrderTestUtils.createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
      [
        maker_fill_amount, taker_fill_amount.add(1), true, [swap_step]
      ]
    ]

    const deadline = OrderTestUtils.MAX_EXPIRY

    const request = await (await OrderTestUtils.callExactOutScriptScope(path, deadline, taker, Orders.id.toB256()))
      .addContracts([Orders])
      .txParams(txParams)
      .getTransactionRequest()

    const inputAssets: CoinQuantity[] = [
      {
        assetId: taker_asset,
        amount: taker_fill_amount.add(1),
      }
    ];

    const finalRequest = await prepareRequest(taker, request, 2, inputAssets, [Orders.id.toB256()])

    /** EXECUTE TXN */

    const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
    await tx.waitForResult()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
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

    // validate maker change 
    // (allow rounding error of one unit - adjusted for the exchange rate)
    const makerRoundingError = Math.ceil(maker_amount.toNumber() / taker_amount.toNumber())
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      makerRoundingError
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )

    // validate taker change
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      makerRoundingError
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )

    // these checks make sure that swap routes always execute (we always receive enough)

    // expect to pay at least the maker amount
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.be.greaterThanOrEqual(
      maker_fill_amount.toNumber()
    )

    // expect to receive at least the taker amount 
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toNumber()
    ).to.be.greaterThanOrEqual(
      taker_fill_amount.toNumber()
    )

    // validate taker change

    // expect to receive at least the maker amount
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toNumber()
    ).to.be.greaterThanOrEqual(
      maker_fill_amount.toNumber()
    )
    // expect to pay at least the taker amount
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toNumber()
    ).to.greaterThanOrEqual(
      taker_fill_amount.toNumber()
    )
  });


  test('Facilitates multihop partial order fill exact output', async () => {
    /**
     * We test a swap taker_asset -> intermediate_asset -> maker_asset
     */

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset, intermediate_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), OrderTestUtils.EXTENDED_NAMES)

    await OrderTestUtils.fundWallets(
      [maker, taker, maker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset, intermediate_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = OrderTestUtils.getRandomAmount()
    const intermediate_amount = OrderTestUtils.getRandomAmount()
    const taker_amount = OrderTestUtils.getRandomAmount()

    await OrderTestUtils.createMakerDeposits(maker, Orders, [maker_asset, intermediate_asset], [maker_amount.toNumber(), intermediate_amount.toNumber()])

    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
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

    /** DEFINE PARAMETERS */

    const order0: OrderInput = {
      maker_asset: intermediate_asset, // asset_mid
      taker_asset, // asset_in
      maker_amount: intermediate_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const order1: OrderInput = {
      maker_asset, // asset_out
      taker_asset: intermediate_asset, // asset_mid
      maker_amount,
      taker_amount: intermediate_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }


    const maker_fill_amount = OrderTestUtils.getRandomAmount(1, maker_amount.toNumber()) // this is the actual amount_in

    const intermediate_fill_amount = OrderTestUtils.computeTakerFillAmount(maker_fill_amount, order1.maker_amount, order1.taker_amount)

    const taker_fill_amount = OrderTestUtils.computeTakerFillAmount(intermediate_fill_amount, order0.maker_amount, order0.taker_amount)


    const re_computed_intermediate_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order0.maker_amount, order0.taker_amount)

    const re_computed_maker_fill_amount = OrderTestUtils.computeMakerFillAmount(re_computed_intermediate_fill_amount, order1.maker_amount, order1.taker_amount)


    expect(re_computed_maker_fill_amount.toNumber()).to.be.greaterThanOrEqual(maker_fill_amount.toNumber())

    const signatureRaw0 = await maker.signMessage(OrderTestUtils.packOrder(order0, Orders))
    const signatureRaw1 = await maker.signMessage(OrderTestUtils.packOrder(order1, Orders))

    const swap_step0 = OrderTestUtils.createRfqBatchSwapStep(order0, signatureRaw0, contractIdInput(Orders.id))
    const swap_step1 = OrderTestUtils.createRfqBatchSwapStep(order1, signatureRaw1, addressInput(taker.address))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
      [
        maker_fill_amount,
        taker_fill_amount.add(1),
        true,
        [
          swap_step1,
          swap_step0
        ]
      ]
    ]

    const deadline = OrderTestUtils.MAX_EXPIRY

    const request = await (await OrderTestUtils.callExactOutScriptScope(path, deadline, taker, Orders.id.toB256()))
      .addContracts([Orders])
      .txParams(txParams)
      .getTransactionRequest()

    const inputAssets: CoinQuantity[] = [
      {
        assetId: taker_asset,
        amount: taker_fill_amount,
      }
    ];

    const finalRequest = await prepareRequest(taker, request, 2, inputAssets, [Orders.id.toB256()])

    /** EXECUTE TXN */

    const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
    await tx.waitForResult()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
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

    // weh have to adjust the rounding error as it propagates to the intermediate swap
    const makerRoundingError = Math.ceil((maker_amount.toNumber() / intermediate_amount.toNumber())) * Math.ceil(intermediate_amount.toNumber() / taker_amount.toNumber())

    // validate maker change
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      makerRoundingError
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )

    // validate taker change
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      makerRoundingError
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )

    // these checks make sure that swap routes always execute (we always receive enough)

    // expect to pay at least the maker amount
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.be.greaterThanOrEqual(
      maker_fill_amount.toNumber()
    )

    // expect to receive at least the taker amount 
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toNumber()
    ).to.be.greaterThanOrEqual(
      taker_fill_amount.toNumber()
    )

    // validate taker change

    // expect to receive at least the maker amount
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toNumber()
    ).to.be.greaterThanOrEqual(
      maker_fill_amount.toNumber()
    )
    // expect to pay at least the taker amount
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toNumber()
    ).to.greaterThanOrEqual(
      taker_fill_amount.toNumber()
    )
  });
});