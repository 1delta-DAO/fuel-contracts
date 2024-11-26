import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput } from '../ts-scripts/utils';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { ZeroBytes32 } from 'fuels';


describe('Order fill via `msg_amount`', async () => {


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
      maker_traits: OrderTestUtils.MAX_EXPIRY,
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


    const [,
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
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

    const [,
      maker_taker_asset_balance_after
    ] = await OrderTestUtils.getConventionalBalances(
      taker,
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
    expect(
      total_taker_asset_balance_after.sub(total_taker_asset_balance_before).toString()
    ).to.equal(
      taker_amount.toString()
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

    // cannot fill more than taker_amount
    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
        order,
        signatureRaw,
        1,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: 1 } })
        .call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.ORDER_ALREADY_FILLED)

  });
});
