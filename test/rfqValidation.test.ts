import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { hashMessage } from 'fuels';
import { ErrorInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { RfqTestUtils } from './utils';


describe('Order Validation', async () => {
  test('Order Hash', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders } = await RfqTestUtils.fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const result = await rfqOrders.functions.get_order_hash(order).simulate();

    const data = RfqTestUtils.packOrder(order, rfqOrders)

    expect(hashMessage(data as any)).toBe(result.value);
  });

  test('Recover and validate order on signer', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders } = await RfqTestUtils.fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value).to.equal(ErrorInput.None)

  });

  test('Disallow manipulated order', async () => {
    1
    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders } = await RfqTestUtils.fixture(deployer)

    let order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

    order.maker_amount = RfqTestUtils.getRandomAmount()

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value).to.equal(ErrorInput.InvalidOrderSignature)

  });

  test('Respects expiry', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { rfqOrders } = await RfqTestUtils.fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: 0,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value).to.equal(ErrorInput.Expired)

  });

  test('Respects invalidation of order', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { rfqOrders } = await RfqTestUtils.fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

    await RfqTestUtils.getRfqOrders(maker, rfqOrders.id.toB256()).functions.invalidate_nonce(
      order.maker_asset,
      order.taker_asset,
      1
    ).call()

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value).to.equal(ErrorInput.InvalidNonce)
  });
});

