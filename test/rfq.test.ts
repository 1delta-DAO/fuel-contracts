import { launchTestNode } from 'fuels/test-utils';

import { describe, test, expect } from 'vitest';

/**
 * Imports for the contract factory and bytecode, so that we can use them in the test.
 *
 * Can't find these imports? Make sure you've run `fuels build` to generate these with typegen.
 */
import { OrderValidationStatusInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { OrderRfqFactory } from '../ts-scripts/typegen/OrderRfqFactory';
import { concatBytes, hashMessage, Signer, toBytes } from 'fuels';

const MAX_EXPIRY = 4_294_967_295

/**
 * Contract Testing
 * 
 *
 * Tests for the contract program type within the TS SDK. Here we will test the deployment of
 * our contract, and the result of call it's functions.
 */
describe('RFQ Orders', () => {

  test('Hash and recover signature', async () => {

    // First, we'll launch a test node, passing the contract factory and bytecode. This will deploy the contract
    // to our test node so we can test against it.
    const launched = await launchTestNode();

    // We can now destructure the contract from the launched object.
    const {
      wallets: [user]
    } = launched;

    const deployTx = await OrderRfqFactory.deploy(user)

    const { contract } = await deployTx.waitForResult()

    const order: RfqOrderInput = {
      maker_asset: user.address.toB256(),
      taker_asset: user.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: user.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    // We can now call the contract functions and test the results. Lets assert the initial value of the counter.
    const { waitForResult: initWaitForResult } = await contract.functions.get_order_hash(order).call();
    const { value: order_hash_on_chain } = await initWaitForResult();

    // We can now call the contract functions and test the results. Lets assert the initial value of the counter.
    const { waitForResult: initWaitForResultBytes } = await contract.functions.pack_order(order).call();
    const { value: order_packed_on_chain } = await initWaitForResultBytes();


    const data: any = concatBytes([
      toBytes(order.maker_asset, 32),
      toBytes(order.maker_asset, 32),
      toBytes(order.maker_amount, 8),
      toBytes(order.taker_amount, 8),
      toBytes(order.maker, 32),
      toBytes(order.nonce, 8),
      toBytes(order.expiry, 4),
    ])

    console.log("orderBytes-actual", hex(order_packed_on_chain))
    console.log("orderBytes-manual", hex(data))
    console.log("------------------")
    console.log("hash      ", order_hash_on_chain)
    console.log("off-chain ", hashMessage(data as any))
    expect(hashMessage(data as any)).toBe(order_hash_on_chain);


    const signatureRaw = await user.signMessage(order_hash_on_chain)
    console.log("sig", signatureRaw)

    const recoveredAddress = Signer.recoverAddress(order_hash_on_chain, signatureRaw);
    console.log("TS SDK EC Recover: ", recoveredAddress.toB256())

    const { waitForResult: checkSig } = await contract.functions.recover_signer(
      signatureRaw,
      hashMessage(order_hash_on_chain)
    ).call()
    const { value: signerOfHash } = await checkSig()
    console.log("gotten signer", signerOfHash, user.address.toB256())

    expect(signerOfHash.bits).to.equal(user.address.toB256())

  });

  test('Recover and validate order on signer', async () => {

    // First, we'll launch a test node, passing the contract factory and bytecode. This will deploy the contract
    // to our test node so we can test against it.
    const launched = await launchTestNode();

    // We can now destructure the contract from the launched object.
    const {
      wallets: [user]
    } = launched;

    const deployTx = await OrderRfqFactory.deploy(user)

    const { contract } = await deployTx.waitForResult()

    const order: RfqOrderInput = {
      maker_asset: user.address.toB256(),
      taker_asset: user.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: user.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    const signatureRaw = await user.signMessage(packOrder(order))

    const { waitForResult: getStatus } = await contract.functions.validate_order(
      order,
      signatureRaw
    ).call()
    const { value: status } = await getStatus()

    expect(status).to.equal(OrderValidationStatusInput.Valid)

  });


  test('Respects expiry', async () => {

    // First, we'll launch a test node, passing the contract factory and bytecode. This will deploy the contract
    // to our test node so we can test against it.
    const launched = await launchTestNode();

    // We can now destructure the contract from the launched object.
    const {
      wallets: [user]
    } = launched;

    const deployTx = await OrderRfqFactory.deploy(user)

    const { contract } = await deployTx.waitForResult()

    const order: RfqOrderInput = {
      maker_asset: user.address.toB256(),
      taker_asset: user.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: user.address.toB256(),
      nonce: '0',
      expiry: 0,
    }

    const signatureRaw = await user.signMessage(packOrder(order))

    const { waitForResult: getStatus } = await contract.functions.validate_order(
      order,
      signatureRaw
    ).call()
    const { value: status } = await getStatus()

    expect(status).to.equal(OrderValidationStatusInput.Expired)

  });

  test('Respects invalidation of order', async () => {

    // First, we'll launch a test node, passing the contract factory and bytecode. This will deploy the contract
    // to our test node so we can test against it.
    const launched = await launchTestNode();

    // We can now destructure the contract from the launched object.
    const {
      wallets: [user]
    } = launched;

    const deployTx = await OrderRfqFactory.deploy(user)

    const { contract } = await deployTx.waitForResult()

    const order: RfqOrderInput = {
      maker_asset: user.address.toB256(),
      taker_asset: user.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: user.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    const signatureRaw = await user.signMessage(packOrder(order))

     await contract.functions.invalidate_nonce(
      order.maker_asset,
      order.taker_asset,
      1
    ).call()

    const { waitForResult: getStatus } = await contract.functions.validate_order(
      order,
      signatureRaw
    ).call()
    const { value: status } = await getStatus()

    expect(status).to.equal(OrderValidationStatusInput.InvalidNonce)

  });
});


function hex(arrayBuffer: any) {
  const byteToHex: any[] = [];

  for (let n = 0; n <= 0xff; ++n) {
    const hexOctet = n.toString(16).padStart(2, "0");
    byteToHex.push(hexOctet);
  }

  const buff = new Uint8Array(arrayBuffer);
  const hexOctets: any[] = []; // new Array(buff.length) is even faster (preallocates necessary array size), then use hexOctets[i] instead of .push()

  for (let i = 0; i < buff.length; ++i)
    hexOctets.push(byteToHex[buff[i]]);

  return "0x" + hexOctets.join("");
}


function packOrder(order: RfqOrderInput) {
  return concatBytes([
    toBytes(order.maker_asset, 32),
    toBytes(order.maker_asset, 32),
    toBytes(order.maker_amount, 8),
    toBytes(order.taker_amount, 8),
    toBytes(order.maker, 32),
    toBytes(order.nonce, 8),
    toBytes(order.expiry, 4),
  ]) as any
}