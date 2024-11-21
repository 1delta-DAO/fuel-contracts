import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { hashMessage } from 'fuels';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';

describe('Order Validation', async () => {
  test('Order Hash', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;

    const { Orders } = await OrderTestUtils.fixture(deployer)

    const order: OrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const result = await Orders.functions.get_order_hash(order).simulate();

    const data = OrderTestUtils.packOrder(order, Orders)

    expect(hashMessage(data as any)).toBe(result.value);
  });

  test('Recover and validate order on signer', async () => {

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

    const order: OrderInput = {
      maker_asset: maker_asset,
      taker_asset: maker.address.toB256(),
      maker_amount: deposit_amount,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.NO_ERROR)
  });

  test('Disallow manipulated order', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;

    const { Orders } = await OrderTestUtils.fixture(deployer)

    let order: OrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    order.maker_amount = OrderTestUtils.getRandomAmount()

    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.INVALID_ORDER_SIGNATURE)

  });

  test('Respects expiry', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { Orders, tokens } = await OrderTestUtils.fixture(deployer)

    const [maker_asset] = await OrderTestUtils.createTokens(deployer, OrderTestUtils.contractIdBits(tokens), ["test"])

    await OrderTestUtils.fundWallets([maker], OrderTestUtils.contractIdBits(tokens), [maker_asset], [OrderTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = OrderTestUtils.getRandomAmount(1, 10000)
    await OrderTestUtils.getOrders(maker, OrderTestUtils.contractIdBits(Orders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const order: OrderInput = {
      maker_asset: maker_asset,
      taker_asset: maker_asset,
      maker_amount: deposit_amount,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      expiry: 0,
    }


    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.EXPIRED)

  });

  test('Respects invalidation of order by nonce', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { Orders } = await OrderTestUtils.fixture(deployer)


    const nonce = OrderTestUtils.getRandomAmount(1)

    const order: OrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    await OrderTestUtils.getOrders(maker, Orders.id.toB256()).functions.invalidate_nonce(
      order.maker_asset,
      order.taker_asset,
      nonce
    ).call()

    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.INVALID_NONCE)
  });

  test('Respects invalidation of order by hash', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { Orders } = await OrderTestUtils.fixture(deployer)

    const nonce = OrderTestUtils.getRandomAmount(1)

    const order: OrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))

    await OrderTestUtils.getOrders(maker, Orders.id.toB256()).functions.cancel_order(
      OrderTestUtils.getHash(order, Orders),
      signatureRaw
    ).call()

    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.CANCELLED)
  });

  test('Cannot cancel order by hash with invalid signature', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { Orders } = await OrderTestUtils.fixture(deployer)

    const nonce = OrderTestUtils.getRandomAmount(1)

    let order: OrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      expiry: OrderTestUtils.MAX_EXPIRY,
    }

    // produce invalid signature
    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder({ ...order, maker_amount: 10001 }, Orders))

    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(maker, Orders.id.toB256()).functions.cancel_order(
        OrderTestUtils.getHash(order, Orders),
        signatureRaw
      ).call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.INVALID_ORDER_SIGNATURE)

  });
});

