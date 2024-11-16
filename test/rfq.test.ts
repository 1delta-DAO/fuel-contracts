import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { OrderRfq, ErrorInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { OrderRfqFactory } from '../ts-scripts/typegen/OrderRfqFactory';
import { concatBytes, Contract, hashMessage, Signer, toBytes, WalletUnlocked } from 'fuels';
import { MockTokenFactory } from '../ts-scripts/typegen/MockTokenFactory';
import { MockToken } from '../ts-scripts/typegen';
import { addressInput, assetIdInput, contractIdInput } from '../ts-scripts/utils';
import { get } from 'lodash';

const MAX_EXPIRY = 4_294_967_295

/** Utility functions */

// deploy all relevant fixtures
async function fixture(deployer: WalletUnlocked) {

  const deployTokenTx = await MockTokenFactory.deploy(deployer)

  const { contract: tokens } = await deployTokenTx.waitForResult()

  const deployRfqTx = await OrderRfqFactory.deploy(deployer)

  const { contract: rfqOrders } = await deployRfqTx.waitForResult()

  return {
    tokens,
    rfqOrders
  }
}

function getRandomAmount(min = 1, max = DEFAULT_MINT_AMOUNT) {
  return Math.round((min + Math.random() * (max - min)))
}

function getRfqOrders(signer: WalletUnlocked, orderAddr: string) {
  return new OrderRfq(orderAddr, signer)
}

const DEFAULT_MINT_AMOUNT = 1_000_000
const DEFAULT_DECIMALS = 9

async function createTokens(signer: WalletUnlocked, mockTokenAddr: string, names = ["MakerToken", "TakerToken"]): Promise<string[]> {
  const token = new MockToken(mockTokenAddr, signer)

  let assetIds: string[] = []
  for (let name of names) {
    const a = await token.functions.add_token(name, name.toUpperCase(), DEFAULT_DECIMALS).call()
    const res = await a.waitForResult()
    assetIds.push(res.value.bits)
  }

  return assetIds
}


function contractIdBits(c: Contract) {
  return c.id.toB256()
}

async function fundWallets(
  receivers: WalletUnlocked[],
  mockTokenAddr: string,
  tokens = ["0x", "0x"],
  amounts = [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
) {

  if (tokens.length !== amounts.length || amounts.length !== receivers.length)
    throw new Error("fundWallets: inconsistent input lengths")
  let i = 0
  for (let token of tokens) {
    const receiver = receivers[i]
    const tokenContract = new MockToken(mockTokenAddr, receiver)
    await tokenContract.functions.mint_tokens(assetIdInput(token), amounts[i]).call()
    i++;
  }


}


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
    toBytes(order.taker_asset, 32),
    toBytes(order.maker_amount, 8),
    toBytes(order.taker_amount, 8),
    toBytes(order.maker, 32),
    toBytes(order.nonce, 8),
    toBytes(order.expiry, 4),
  ]) as any
}


async function getMakerBalances(maker: string, assets: string[], rfq: OrderRfq) {
  let bal: number[] = []
  for (let assetId of assets) {
    const result = await rfq.functions.get_balance(maker, assetId).simulate()
    bal.push(result.value.toNumber())
  }

  return bal
}

async function getConventionalBalances(u: WalletUnlocked, assets: string[]) {
  let bal: number[] = []
  for (let assetId of assets) {
    const result = await u.getBalance(assetId)
    bal.push(result.toNumber())
  }
  return bal
}

describe('RFQ Orders', () => {

  test('Hash and recover signature', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders } = await fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    // We can now call the contract functions and test the results. Lets assert the initial value of the counter.
    const { waitForResult: initWaitForResult } = await rfqOrders.functions.get_order_hash(order).call();
    const { value: order_hash_on_chain } = await initWaitForResult();

    // We can now call the contract functions and test the results. Lets assert the initial value of the counter.
    const { waitForResult: initWaitForResultBytes } = await rfqOrders.functions.pack_order(order).call();
    const { value: order_packed_on_chain } = await initWaitForResultBytes();


    const data = packOrder(order)

    console.log("orderBytes-actual", hex(order_packed_on_chain))
    console.log("orderBytes-manual", hex(data))
    console.log("------------------")
    console.log("hash      ", order_hash_on_chain)
    console.log("off-chain ", hashMessage(data as any))
    expect(hashMessage(data as any)).toBe(order_hash_on_chain);


    const signatureRaw = await maker.signMessage(order_hash_on_chain)
    console.log("sig", signatureRaw)

    const recoveredAddress = Signer.recoverAddress(order_hash_on_chain, signatureRaw);
    console.log("TS SDK EC Recover: ", recoveredAddress.toB256())

    const { waitForResult: checkSig } = await rfqOrders.functions.recover_signer(
      signatureRaw,
      hashMessage(order_hash_on_chain)
    ).call()
    const { value: signerOfHash } = await checkSig()
    console.log("gotten signer", signerOfHash, maker.address.toB256())

    expect(signerOfHash.bits).to.equal(maker.address.toB256())

  });

  test('Recover and validate order on signer', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { rfqOrders } = await fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(packOrder(order))

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    expect(result.value).to.equal(ErrorInput.None)

  });


  test('Respects expiry', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const { rfqOrders } = await fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: 0,
    }

    const signatureRaw = await maker.signMessage(packOrder(order))

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


    const { rfqOrders } = await fixture(deployer)

    const order: RfqOrderInput = {
      maker_asset: maker.address.toB256(),
      taker_asset: maker.address.toB256(),
      maker_amount: 10000,
      taker_amount: 10000,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(packOrder(order))

    await getRfqOrders(maker, rfqOrders.id.toB256()).functions.invalidate_nonce(
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


  test('Maker can deposit and withdraw', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { rfqOrders, tokens } = await fixture(deployer)

    const [maker_asset] = await createTokens(deployer, contractIdBits(tokens), ["test"])

    await fundWallets([maker], contractIdBits(tokens), [maker_asset], [DEFAULT_MINT_AMOUNT])


    console.log("--", await maker.getBalances())
    const deposit_amount = getRandomAmount(1, 10000)

    console.log("deposit_amount", deposit_amount)

    await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()


    const balance = await rfqOrders.functions.get_balance(maker.address.toB256(), maker_asset).simulate()

    const balanceReceived = balance.value
    expect(balanceReceived.toNumber()).to.equal(deposit_amount)

  });

  test('Facilitates Order Fill', async () => {

    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;

    const { rfqOrders, tokens } = await fixture(deployer)

    const [maker_asset, taker_asset] = await createTokens(deployer, contractIdBits(tokens))

    await fundWallets(
      [maker, taker],
      contractIdBits(tokens),
      [maker_asset, taker_asset],
      [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
    )

    const maker_amount = getRandomAmount()


    console.log("maker_amount", maker_amount, maker.address.toB256())

    await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
      .call()


    const taker_amount = getRandomAmount()

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: '0',
      expiry: MAX_EXPIRY,
    }
    const signatureRaw = await maker.signMessage(packOrder(order))

    const result = await rfqOrders.functions.validate_order(
      order,
      signatureRaw
    ).simulate()

    console.log("validation result", result.value)

    const [
      maker_maker_asset_balance_before,
      maker_taker_asset_balance_before
    ] = await getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_before,
      taker_taker_asset_balance_before
    ] = await getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    await getRfqOrders(taker, contractIdBits(rfqOrders)).functions.fill(
      order,
      signatureRaw,
      addressInput(taker.address)
    )
      .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
      .call()

    const [
      maker_maker_asset_balance_after,
      maker_taker_asset_balance_after
    ] = await getMakerBalances(
      maker.address.toB256(),
      [maker_asset, taker_asset],
      rfqOrders
    )

    const [
      taker_maker_asset_balance_after,
      taker_taker_asset_balance_after
    ] = await getConventionalBalances(
      taker,
      [maker_asset, taker_asset]
    )

    // validate maker change
    expect(maker_maker_asset_balance_before - maker_maker_asset_balance_after).to.equal(maker_amount)
    expect(maker_taker_asset_balance_after - maker_taker_asset_balance_before).to.equal(taker_amount)

    // validate taker cahnge
    expect(taker_maker_asset_balance_after - taker_maker_asset_balance_before).to.equal(maker_amount)
    expect(taker_taker_asset_balance_before - taker_taker_asset_balance_after).to.equal(taker_amount)


  });
});

