import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { BigNumberish, BN, concatBytes, Contract, hashMessage, toBytes, WalletUnlocked } from 'fuels';
import { addressInput, assetIdInput, contractIdInput } from '../ts-scripts/utils';

import { MockTokenFactory } from '../ts-scripts/typegen/MockTokenFactory';
import { MockToken } from '../ts-scripts/typegen/MockToken';
import { OrderRfq, ErrorInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { OrderRfqFactory } from '../ts-scripts/typegen/OrderRfqFactory';

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

/** We randomize the amounts used for tests */
function getRandomAmount(min = 1, max = DEFAULT_MINT_AMOUNT) {
  return new BN(Math.round((min + Math.random() * (max - min))))
}

/** Get the Rfq order contract with a specific signer */
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

// computes the maker amount relative to the rates given in the order and taker amount
function computeMakerFillAmount(taker_fill_amount: BigNumberish, maker_amount: BigNumberish, taker_amount: BigNumberish) {
  return new BN(taker_fill_amount).mul(maker_amount).div(taker_amount)
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

async function getMakerBalances(maker: string | WalletUnlocked, assets: string[], rfq: OrderRfq) {
  let bal: BN[] = []
  let makerStringified = typeof maker === "string" ? maker : maker.address.toB256()
  for (let assetId of assets) {
    const result = await rfq.functions.get_maker_balance(makerStringified, assetId).simulate()
    bal.push(result.value)
  }

  return bal
}

async function getConventionalBalances(u: WalletUnlocked, assets: string[]) {
  let bal: BN[] = []
  for (let assetId of assets) {
    const result = await u.getBalance(assetId)
    bal.push(result)
  }
  return bal
}

describe('RFQ Orders', () => {
  describe('Order Validation', async () => {
    test('Order Hash', async () => {

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

      const result = await rfqOrders.functions.get_order_hash(order).simulate();

      const data = packOrder(order)

      expect(hashMessage(data as any)).toBe(result.value);
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

    test('Disallow manipulated order', async () => {
      1
      const launched = await launchTestNode();

      const {
        wallets: [maker, deployer, taker]
      } = launched;

      const { rfqOrders } = await fixture(deployer)

      let order: RfqOrderInput = {
        maker_asset: maker.address.toB256(),
        taker_asset: maker.address.toB256(),
        maker_amount: 10000,
        taker_amount: 10000,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: MAX_EXPIRY,
      }

      const signatureRaw = await maker.signMessage(packOrder(order))

      order.maker_amount = getRandomAmount()

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
  });

  describe('Maker Actions', async () => {
    test('Maker can deposit', async () => {

      const launched = await launchTestNode();

      const {
        wallets: [maker, deployer]
      } = launched;


      const { rfqOrders, tokens } = await fixture(deployer)

      const [maker_asset] = await createTokens(deployer, contractIdBits(tokens), ["test"])

      await fundWallets([maker], contractIdBits(tokens), [maker_asset], [DEFAULT_MINT_AMOUNT])

      const deposit_amount = getRandomAmount(1, 10000)

      await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
        .call()

      const [balanceReceived] = await getMakerBalances(maker, [maker_asset], rfqOrders)

      expect(balanceReceived.toString()).to.equal(deposit_amount.toString())
    });

    test('Maker can withdraw', async () => {

      const launched = await launchTestNode();

      const {
        wallets: [maker, deployer]
      } = launched;


      const { rfqOrders, tokens } = await fixture(deployer)

      const [maker_asset] = await createTokens(deployer, contractIdBits(tokens), ["test"])

      await fundWallets([maker], contractIdBits(tokens), [maker_asset], [DEFAULT_MINT_AMOUNT])

      const deposit_amount = getRandomAmount(1, 10000)

      await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
        .call()

      const withdraw_amount = getRandomAmount(1, deposit_amount.toNumber())
      const [balance_before_withdraw] = await getMakerBalances(maker, [maker_asset], rfqOrders)
      const [maker_balance_before_withdraw] = await getConventionalBalances(maker, [maker_asset])

      await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.withdraw(maker_asset, withdraw_amount)
        .call()

      const [balance_after_withdraw] = await getMakerBalances(maker, [maker_asset], rfqOrders)
      const [maker_balance_after_withdraw] = await getConventionalBalances(maker, [maker_asset])

      expect(
        balance_before_withdraw.sub(balance_after_withdraw).toString()
      ).to.equal(withdraw_amount.toString())

      expect(
        maker_balance_after_withdraw.sub(maker_balance_before_withdraw).toString()
      ).to.equal(withdraw_amount.toString())
    });
  });

  describe('Rfq fill via `fill`', async () => {
    test('Facilitates Order Full Fill', async () => {

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

      // validate taker cahnge
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

      const { rfqOrders, tokens } = await fixture(deployer)

      const [maker_asset, taker_asset] = await createTokens(deployer, contractIdBits(tokens))

      await fundWallets(
        [maker, taker],
        contractIdBits(tokens),
        [maker_asset, taker_asset],
        [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = getRandomAmount()
      const taker_amount = getRandomAmount()


      await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()

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

      const taker_fill_amount = getRandomAmount(1, Number(taker_amount.toString()))

      const maker_fill_amount = computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount.toString())

      await getRfqOrders(taker, contractIdBits(rfqOrders)).functions.fill(
        order,
        signatureRaw,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
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

      // validate taker cahnge
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
  });

  describe('Rfq fill via `fill_funded`', async () => {
    test('Facilitates Order Full Fill', async () => {

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

      await taker.transfer(contractIdBits(rfqOrders), taker_amount, taker_asset)

      await getRfqOrders(taker, contractIdBits(rfqOrders)).functions.fill_funded(
        order,
        signatureRaw,
        taker_amount,
        addressInput(taker.address)
      )
        // .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
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

      // validate taker cahnge
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

      const { rfqOrders, tokens } = await fixture(deployer)

      const [maker_asset, taker_asset] = await createTokens(deployer, contractIdBits(tokens))

      await fundWallets(
        [maker, taker],
        contractIdBits(tokens),
        [maker_asset, taker_asset],
        [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = getRandomAmount()
      const taker_amount = getRandomAmount()


      await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()

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

      const taker_fill_amount = getRandomAmount(1, Number(taker_amount.toString()))

      const maker_fill_amount = computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount.toString())

      await taker.transfer(contractIdBits(rfqOrders), taker_fill_amount, taker_asset)

      await getRfqOrders(taker, contractIdBits(rfqOrders)).functions.fill_funded(
        order,
        signatureRaw,
        taker_fill_amount,
        addressInput(taker.address)
      )
        // .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
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

      // validate taker cahnge
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
  });
});

