import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { ZeroBytes32 } from 'fuels';
import { addressInput, contractIdInput } from '../ts-scripts/utils';

describe('Order Rotuer', async () => {


  test('Cannot reenter', async () => {
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

    try {
      await OrderTestUtils.getRouter(taker, OrderTestUtils.contractIdBits(Router)).functions.fill_order(
        order,
        signatureRaw,
        taker_fill_amount,
        contractIdInput(Router.id),
        OrderTestUtils.routerParams(orderMatch, signatureMatch)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
        .addContracts([Orders])
        .call()
        expect(true).to.equal(false, "was able to reenter")
    } catch(e) {
      
    }
  });
});

