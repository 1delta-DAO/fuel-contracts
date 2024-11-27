import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { hashMessage} from 'fuels';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';

describe('Order Validation', async () => {
  test('Order Hash', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [_, deployer]
    } = launched;

    const { Orders } = await OrderTestUtils.fixture(deployer)

    const order = OrderTestUtils.getOrder()

    const data_on_chain = await Orders.functions.validate_order(
      order,
      // this is a random nonzero bytes blob (and not a valid signature since we only want to test the hash)
      "0xcc4e1afae871bdd89c4b711f53e047dc82ac30073b704c537aaf972ef71157139d27074926bc0f30fe5aa712aa551832e1ca4b0cbf9814745d6e028bb785e353"
    ).simulate();

    const data = OrderTestUtils.packOrder(order, Orders)

    expect(hashMessage(data as any)).toBe(data_on_chain.value[0]);
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

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker_asset,
      taker_asset: maker.address.toB256(),
      maker_amount: deposit_amount,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
    })

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

    let order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: OrderTestUtils.MAX_EXPIRY,
    })

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

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker_asset,
      taker_asset: maker_asset,
      maker_amount: deposit_amount,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: OrderTestUtils.getRandomAmount(1),
      maker_traits: 0,
    })


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

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      maker_traits: OrderTestUtils.MAX_EXPIRY,
    })

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

    const order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      maker_traits: OrderTestUtils.MAX_EXPIRY,
    })


    await OrderTestUtils.getOrders(maker, Orders.id.toB256()).functions.cancel_order(
      order
    ).call()

    const signatureRaw = await maker.signMessage(OrderTestUtils.packOrder(order, Orders))
    const result = await Orders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value[1].toNumber()).to.equal(OrderTestUtils.ErrorCodes.CANCELLED)
  });

  test('Cannot cancel order by hash with invalid caller', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, other]
    } = launched;


    const { Orders } = await OrderTestUtils.fixture(deployer)

    const nonce = OrderTestUtils.getRandomAmount(1)

    let order: OrderInput = OrderTestUtils.getOrder({
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce,
      maker_traits: OrderTestUtils.MAX_EXPIRY,
    })

    let reason: string | undefined = undefined
    try {
      await OrderTestUtils.getOrders(other, Orders.id.toB256()).functions.cancel_order(
        order
      ).call()
    } catch (e) {
      reason = String(e)
    }

    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include(OrderTestUtils.ErrorCodes.INVALID_CANCEL)

  });
});

