import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { ZeroBytes32 } from 'fuels';
import { addressInput, contractIdInput } from '../ts-scripts/utils';

describe('Order Rotuer', async () => {


  test('Can match exactly', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker0, deployer, taker, maker1]
    } = launched;

    const { Orders, tokens, Router } = await OrderTestUtils.fixtureWithRouter(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker0, taker, maker1],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )


    const maker_amount = OrderTestUtils.getRandomAmount()
    const taker_amount = OrderTestUtils.getRandomAmount()

    await OrderTestUtils.getOrders(maker0, OrderTestUtils.contractIdBits(Orders))
      .functions.deposit(maker_asset, addressInput(maker0.address))
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()

    await OrderTestUtils.getOrders(maker1, OrderTestUtils.contractIdBits(Orders))
      .functions.deposit(taker_asset, addressInput(maker1.address))
      .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
      .call()


    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker0.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const orderMatch: OrderInput = OrderTestUtils.getOrder({
      maker_asset: taker_asset,
      taker_asset: maker_asset,
      maker_amount: taker_amount,
      taker_amount: maker_amount,
      maker: maker1.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = taker_amount

    const signatureRaw = await maker0.signMessage(OrderTestUtils.packOrder(order, Orders))


    const signatureMatch = await maker1.signMessage(OrderTestUtils.packOrder(orderMatch, Orders))

    await OrderTestUtils.getRouter(taker, OrderTestUtils.contractIdBits(Router)).functions.fill_order(
      order,
      signatureRaw,
      taker_fill_amount,
      contractIdInput(Orders.id),
      OrderTestUtils.routerParams(orderMatch, signatureMatch)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .addContracts([Orders])
      .call()

  });


  test('Can match vs larger order with worse price', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker0, deployer, taker, maker1]
    } = launched;

    const { Orders, tokens, Router } = await OrderTestUtils.fixtureWithRouter(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker0, taker, maker1],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )


    const maker_amount = OrderTestUtils.getRandomAmount()
    const taker_amount = OrderTestUtils.getRandomAmount()

    const taker_increment = OrderTestUtils.getRandomAmount(1, 1000)


    // compute a larger order that has a worse prive by adding an adjusted increment
    const maker_increment = OrderTestUtils.getRandomAmount(
      1,
      maker_amount.mul(taker_increment).div(taker_amount).toNumber()
    )

    const maker_amount_match = taker_amount.add(taker_increment)
    const taker_amount_match = maker_amount.add(maker_increment)

    await OrderTestUtils.getOrders(maker0, OrderTestUtils.contractIdBits(Orders))
      .functions.deposit(maker_asset, addressInput(maker0.address))
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()

    await OrderTestUtils.getOrders(maker1, OrderTestUtils.contractIdBits(Orders))
      .functions.deposit(taker_asset, addressInput(maker1.address))
      .callParams({ forward: { assetId: taker_asset, amount: maker_amount_match } })
      .call()


    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker0.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })


    const orderMatch: OrderInput = OrderTestUtils.getOrder({
      maker_asset: taker_asset,
      taker_asset: maker_asset,
      maker_amount: maker_amount_match,
      taker_amount: taker_amount_match,
      maker: maker1.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = taker_amount

    const signatureRaw = await maker0.signMessage(OrderTestUtils.packOrder(order, Orders))


    const signatureMatch = await maker1.signMessage(OrderTestUtils.packOrder(orderMatch, Orders))


    const [
      touter_balance_before,
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [taker_asset]
    )

    const maker_fill_amount = OrderTestUtils.computeMakerFillAmount(
      taker_fill_amount,
      order.maker_amount,
      order.taker_amount,
    )

    const backwards_taker_filled = OrderTestUtils.computeMakerFillAmount(
      maker_fill_amount,
      orderMatch.maker_amount,
      orderMatch.taker_amount
    )

    const expected_profit = backwards_taker_filled.sub(taker_fill_amount).toNumber()

    await OrderTestUtils.getRouter(taker, OrderTestUtils.contractIdBits(Router)).functions.fill_order(
      order,
      signatureRaw,
      taker_fill_amount,
      contractIdInput(Orders.id),
      OrderTestUtils.routerParams(orderMatch, signatureMatch)
    )
      .addContracts([Orders])
      .call()

    const [
      touter_balance_after,
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [taker_asset]
    )

    const profit = touter_balance_after.sub(touter_balance_before).toNumber()
    expect(profit).to.equal(expected_profit)
  });
});

