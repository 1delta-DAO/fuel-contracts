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

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
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

  test('Cannot fill more than maker_amount', async () => {
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

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: maker_amount.add(1),
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = taker_amount

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
        order,
        signatureRaw,
        taker_fill_amount,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
        .call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.MAKER_BALANCE_TOO_LOW)
  });


  test('Facilitates full order fill', async () => {

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
      maker_receiver: ZeroBytes32
    })

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

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

  test('Facilitates Order partial Fill', async () => {

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
    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))


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

    const [
      total_maker_asset_balance_before,
      total_taker_asset_balance_before
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )

    const taker_fill_amount = OrderTestUtils.getRandomAmount(1, Number(taker_amount.toString()))

    const maker_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()


    await OrderTestUtils.testFillStatus(order, Orders, taker_fill_amount.toString(), false)

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
      maker_fill_amount.toString()
    )
    expect(
      maker_taker_asset_balance_after.sub(maker_taker_asset_balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )

    // validate total balances
    expect(
      total_maker_asset_balance_before.sub(total_maker_asset_balance_after).toString()
    ).to.equal(
      maker_fill_amount.toString()
    )
    expect(
      total_taker_asset_balance_after.sub(total_taker_asset_balance_before).toString()
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


  test('Facilitates Order multi-partial Fill', async () => {

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
    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))


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

    const [
      total_maker_asset_balance_before,
      total_taker_asset_balance_before
    ] = await OrderTestUtils.getTotalBalances(
      [maker_asset, taker_asset],
      Orders
    )

    let taker_fill_amount = OrderTestUtils.getRandomAmount(1, taker_amount.toNumber())

    let maker_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()


    await OrderTestUtils.testFillStatus(order, Orders, taker_fill_amount, false)


    taker_fill_amount = taker_amount.sub(taker_fill_amount)

    /** this is not necessarily the maker_amount as it can deviate at max by 2 due to rounding down two times */
    maker_fill_amount = maker_fill_amount.add(OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount))

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

    await OrderTestUtils.testFillStatus(order, Orders, taker_amount, false)

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
      maker_fill_amount.toString()
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
      maker_fill_amount.toString()
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
      maker_fill_amount.toString()
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_amount.toString()
    )
  });

  test('Facilitates Order partial fill, exact output', async () => {

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
    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))


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

    const maker_fill_amount = OrderTestUtils.getRandomAmount(1, Number(maker_amount.toString()))

    const taker_fill_amount = OrderTestUtils.computeTakerFillAmount(maker_fill_amount, order.maker_amount, order.taker_amount)

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signatureRaw,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

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

    const expected_roundingError = Math.ceil(maker_amount.toNumber() / taker_amount.toNumber())

    // validate maker change - note that the maker amount can deviate by 1 
    // due to rounding errors
    expect(
      maker_maker_asset_balance_before.sub(maker_maker_asset_balance_after).toNumber()
    ).to.approximately(
      maker_fill_amount.toNumber(),
      expected_roundingError
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
      expected_roundingError
    )
    expect(
      taker_taker_asset_balance_before.sub(taker_taker_asset_balance_after).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )
  });
});
