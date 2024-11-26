import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { OrderTestUtils } from './utils';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { addressInput } from '../ts-scripts/utils';
import { Provider, ZeroBytes32 } from 'fuels';

describe('Maker Actions', async () => {
  test('Maker can deposit', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), ["test"])

    await OrderTestUtils.fundWallets([maker], OrderTestUtils.contractIdBits(tokens), [maker_asset], [OrderTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = OrderTestUtils.getRandomAmount(1, 10000)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const [balanceReceived] = await OrderTestUtils.getMakerBalances(maker, [maker_asset], Orders)

    expect(balanceReceived.toString()).to.equal(deposit_amount.toString())
  });

  test('Maker can withdraw', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), ["test"])

    await OrderTestUtils.fundWallets([maker], OrderTestUtils.contractIdBits(tokens), [maker_asset], [OrderTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = OrderTestUtils.getRandomAmount(1, 10000)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const withdraw_amount = OrderTestUtils.getRandomAmount(1, deposit_amount.toNumber())
    const [balance_before_withdraw] = await OrderTestUtils.getMakerBalances(maker, [maker_asset], Orders)
    const [maker_balance_before_withdraw] = await OrderTestUtils.getConventionalBalances(maker, [maker_asset])

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.withdraw(maker_asset, withdraw_amount)
      .call()

    const [balance_after_withdraw] = await OrderTestUtils.getMakerBalances(maker, [maker_asset], Orders)
    const [maker_balance_after_withdraw] = await OrderTestUtils.getConventionalBalances(maker, [maker_asset])

    expect(
      balance_before_withdraw.sub(balance_after_withdraw).toString()
    ).to.equal(withdraw_amount.toString())

    expect(
      maker_balance_after_withdraw.sub(maker_balance_before_withdraw).toString()
    ).to.equal(withdraw_amount.toString())
  });

  test('Maker can withdraw all', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), ["test"])

    await OrderTestUtils.fundWallets([maker], OrderTestUtils.contractIdBits(tokens), [maker_asset], [OrderTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = OrderTestUtils.getRandomAmount(1, 10000)

    const [maker_balance_before_withdraw] = await OrderTestUtils.getConventionalBalances(maker, [maker_asset])

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const withdraw_amount = deposit_amount

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.withdraw(maker_asset, withdraw_amount)
      .call()

    const [balance_after_withdraw] = await OrderTestUtils.getMakerBalances(maker, [maker_asset], Orders)

    const [maker_balance_after_withdraw] = await OrderTestUtils.getConventionalBalances(maker, [maker_asset])

    expect(
      balance_after_withdraw.toString()
    ).to.equal("0")

    expect(
      maker_balance_after_withdraw.toString()
    ).to.equal(maker_balance_before_withdraw.toString())
  });


  test('Maker cannot withdraw more than they own', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), ["test"])

    await OrderTestUtils.fundWallets([maker], OrderTestUtils.contractIdBits(tokens), [maker_asset], [OrderTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = OrderTestUtils.getRandomAmount(1, 10000)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const withdraw_amount = OrderTestUtils.getRandomAmount(deposit_amount.toNumber(), deposit_amount.toNumber() + 10000)

    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.withdraw(maker_asset, withdraw_amount)
        .call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.WITHDRAW_TOO_MUCH)
  });

  test('Maker can delegate signature', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker, deployer, delegate, taker]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker, taker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const deposit_amount = OrderTestUtils.getRandomAmount(1)

    const taker_amount = OrderTestUtils.getRandomAmount(1)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    // set delegate
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.register_order_signer_delegate(
      delegate.address.toB256(),
      true
    )
      .call()


    let isDelegate = await Orders.functions.is_order_signer_delegate(
      maker.address.toB256(),
      delegate.address.toB256(),
    )
      .simulate()

    // now is delegate
    expect(isDelegate.value).to.be.true

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: deposit_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = OrderTestUtils.getRandomAmount(1, taker_amount.toNumber())

    const delegateSig = await delegate.signMessage(OrderTestUtils.packOrder(order, Orders))

    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await OrderTestUtils.getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      Orders
    )

    // will fill order delegate's signature
    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      delegateSig,
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

    const maker_fill_amount = OrderTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)

    // validate maker change (is not accounted for delegate)
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

    // unset delegate
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.register_order_signer_delegate(
      delegate.address.toB256(),
      false
    )
      .call()


    isDelegate = await Orders.functions.is_order_signer_delegate(
      maker.address.toB256(),
      delegate.address.toB256(),
    )
      .simulate()

    // not delegate anymore
    expect(isDelegate.value).to.be.false

    // try fill with delegate's signature
    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
        order,
        delegateSig,
        1,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: 1 } })
        .call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    // will reject delegate's signature
    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.INVALID_ORDER_SIGNATURE)
  });


  test('Maker can delegate signature for cancellation', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker, deployer, delegate, taker]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker, taker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const deposit_amount = OrderTestUtils.getRandomAmount(1)

    const taker_amount = OrderTestUtils.getRandomAmount(1)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    // set delegate
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.register_order_signer_delegate(
      delegate.address.toB256(),
      true
    )
      .call()


    let isDelegate = await Orders.functions.is_order_signer_delegate(
      maker.address.toB256(),
      delegate.address.toB256(),
    )
      .simulate()

    // now is delegate
    expect(isDelegate.value).to.be.true

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: deposit_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })

    const delegateSig = await delegate.signMessage(OrderTestUtils.packOrder(order, Orders))

    // will fill order delegate's signature
    await OrderTestUtils.getOrders(delegate, OrderTestUtils.contractIdBits(Orders)).functions.cancel_order(
      order,
    )
      .call()

    const data = await Orders.functions.validate_order(order, delegateSig).simulate()

    expect(data.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.CANCELLED)
  });


  test('Delegate cannot cancel after removed', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker, deployer, delegate, taker]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker, taker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const deposit_amount = OrderTestUtils.getRandomAmount(1)

    const taker_amount = OrderTestUtils.getRandomAmount(1)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    // set delegate
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.register_order_signer_delegate(
      delegate.address.toB256(),
      true
    )
      .call()


    // unset delegate
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.register_order_signer_delegate(
      delegate.address.toB256(),
      false
    )
      .call()


    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: deposit_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
      maker_receiver: ZeroBytes32
    })
    let reason: string | undefined = undefined
    try {
      // will fill order delegate's signature
      await OrderTestUtils.getOrders(delegate, OrderTestUtils.contractIdBits(Orders)).functions.cancel_order(
        order,
      )
        .call()
    }
    catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.INVALID_CANCEL)
  });

  test('Maker can prevent partial fills', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

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

    const deposit_amount = OrderTestUtils.getRandomAmount(1)

    const taker_amount = OrderTestUtils.getRandomAmount(1)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: deposit_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.encodeTraits(false, true),
      maker_receiver: ZeroBytes32
    })

    const taker_fill_amount = OrderTestUtils.getRandomAmount(1, taker_amount.toNumber())

    const signature = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
        order,
        signature,
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
    ).to.include(OrderTestUtils.ErrorCodes.NO_PARTIAL_FILL)

  });


  test('Maker can send tokens to contract', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [maker, deployer, taker],
      provider
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset, taker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens))

    await OrderTestUtils.fundWallets(
      [maker, taker],
      OrderTestUtils.contractIdBits(tokens),
      [maker_asset, taker_asset],
      [OrderTestUtils.DEFAULT_MINT_AMOUNT, OrderTestUtils.DEFAULT_MINT_AMOUNT]
    )

    const deposit_amount = OrderTestUtils.getRandomAmount(1)

    const taker_amount = OrderTestUtils.getRandomAmount(1)

    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset,
      taker_asset,
      maker_amount: deposit_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.encodeTraits(true, false),
      maker_receiver: tokens.id.toB256()
    })

    const taker_fill_amount = OrderTestUtils.getRandomAmount(1, taker_amount.toNumber())

    const signature = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    const balance_before = await provider.getContractBalance(tokens.id.toB256(), taker_asset)

    await OrderTestUtils.getOrders(taker, OrderTestUtils.contractIdBits(Orders)).functions.fill(
      order,
      signature,
      taker_fill_amount,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
      .call()

    const balance_after = await provider.getContractBalance(tokens.id.toB256(), taker_asset)
    expect(
      balance_after.sub(balance_before).toString()
    ).to.equal(
      taker_fill_amount.toString()
    )
  });
});
