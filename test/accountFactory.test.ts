import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput } from '../ts-scripts/utils';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { ZeroBytes32 } from 'fuels';

describe('Order fill via `msg_amount`', async () => {

  test('If attempt to fill more than taker_amount, do not error', async () => {
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

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit(maker_asset, addressInput(maker.address))
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()


    const taker_amount = OrderTestUtils.getRandomAmount()

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = taker_amount.add(1)

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))


    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    // validate taker change -> it settled for taker_amount
    expect(
      taker_maker_asset_balance_after.sub(taker_maker_asset_balance_before).toString()
    ).to.equal(
      maker_amount.toString()
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_amount.add(1).toString()
    )

  });
});
