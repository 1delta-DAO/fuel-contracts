import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput } from '../ts-scripts/utils';
import { RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { RfqTestUtils } from './utils';


describe('Rfq fill via `fill`', async () => {
  test('Facilitates full order fill', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

    await RfqTestUtils.fundWallets(
      [maker, taker],
      RfqTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = RfqTestUtils.getRandomAmount()

    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()


    const taker_amount = RfqTestUtils.getRandomAmount()

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
      order,
      signatureRaw,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
      .call()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
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

  test('Facilitates Order partial Fill', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

    await RfqTestUtils.fundWallets(
      [maker, taker],
      RfqTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = RfqTestUtils.getRandomAmount()
    const taker_amount = RfqTestUtils.getRandomAmount()


    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }
    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))


    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    const taker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(taker_amount.toString()))

    const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)

    await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
      order,
      signatureRaw,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    // validate maker change
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toString()
    ).to.equal(
      maker_fill_amount.toString()
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
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

  test('Facilitates Order partial fill, specifying maker_amount', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

    await RfqTestUtils.fundWallets(
      [maker, taker],
      RfqTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = RfqTestUtils.getRandomAmount()
    const taker_amount = RfqTestUtils.getRandomAmount()


    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }
    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))


    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    const maker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(maker_amount.toString()))

    const taker_fill_amount = RfqTestUtils.computeTakerFillAmount(maker_fill_amount, order.maker_amount, order.taker_amount)

    await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
      order,
      signatureRaw,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await RfqTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await RfqTestUtils.getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    // validate maker change - note that the maker amount can deviate by 1 
    // due to rounding errors
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      1
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
      1
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )
  });
});
