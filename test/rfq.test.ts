import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { BigNumberish, BN, CoinQuantity, concatBytes, Contract, hashMessage, toBytes, WalletUnlocked } from 'fuels';
import { addressInput, assetIdInput, contractIdInput, prepareRequest } from '../ts-scripts/utils';

import { MockTokenFactory } from '../ts-scripts/typegen/MockTokenFactory';
import { MockToken } from '../ts-scripts/typegen/MockToken';
import { OrderRfq, ErrorInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { OrderRfqFactory } from '../ts-scripts/typegen/OrderRfqFactory';
import { BatchSwapStepInput, BatchSwapExactInScript, IdentityInput } from '../ts-scripts/typegen/BatchSwapExactInScript';
import { txParams } from '../ts-scripts/utils/constants';

const MAX_EXPIRY = 4_294_967_295
const RFQ_DEX_ID = 100

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

async function callExactInScriptScope(
  path: any,
  deadline: number,
  user: WalletUnlocked, rfqOrder: string) {


  return await new BatchSwapExactInScript(user).setConfigurableConstants(
    {
      MIRA_AMM_CONTRACT_ID: contractIdInput(rfqOrder).ContractId,
      ONE_DELTA_RFQ_CONTRACT_ID: contractIdInput(rfqOrder).ContractId,
    }
  ).functions.main(
    path,
    deadline
  )
}

/** We randomize the amounts used for tests */
function getRandomAmount(min = 1, max = DEFAULT_RANDOM_AMOUNT_LIMIT) {
  return new BN(Math.round((min + Math.random() * (max - min))))
}

/** Get the Rfq order contract with a specific signer */
function getRfqOrders(signer: WalletUnlocked, orderAddr: string) {
  return new OrderRfq(orderAddr, signer)
}

const DEFAULT_RANDOM_AMOUNT_LIMIT = 1_000_000
const DEFAULT_MINT_AMOUNT = 10_000_000
const DEFAULT_DECIMALS = 9
const DEFAULT_NAMES = ["MakerToken", "TakerToken"]
const EXTENDED_NAMES = [...DEFAULT_NAMES, "IntermediateToken"]

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

async function createMakerDeposits(
  maker: WalletUnlocked,
  orders: OrderRfq,
  tokens = ["0x", "0x"],
  amounts = [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
) {
  if (tokens.length !== amounts.length)
    throw new Error("createTakerDeposits: inconsistent input lengths")
  let i = 0
  for (let token of tokens) {
    await getRfqOrders(maker, contractIdBits(orders)).functions.deposit()
      .callParams({ forward: { assetId: token, amount: amounts[i] } })
      .call()
    i++;
  }
}

// computes the maker amount relative to the rates given in the order and taker amount
function computeMakerFillAmount(taker_fill_amount: BigNumberish, maker_amount: BigNumberish, taker_amount: BigNumberish) {
  return new BN(taker_fill_amount).mul(maker_amount).div(taker_amount)
}

// computes the taker amount relative to the rates given in the order and taker amount
// we need to add 1 to account for rounding errors
function computeTakerFillAmount(maker_fill_amount: BigNumberish, maker_amount: BigNumberish, taker_amount: BigNumberish) {
  return new BN(maker_fill_amount).mul(taker_amount).div(maker_amount).add(1)
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

function createRfqBatchSwapStep(order: RfqOrderInput, signature: string, receiver: IdentityInput) {
  const data: BatchSwapStepInput = {
    asset_in: assetIdInput(order.taker_asset),
    asset_out: assetIdInput(order.maker_asset),
    dex_id: RFQ_DEX_ID,
    data: concatBytes([
      toBytes(order.maker_amount, 8),
      toBytes(order.taker_amount, 8),
      toBytes(order.maker, 32),
      toBytes(order.nonce, 8),
      toBytes(order.expiry, 4),
      toBytes(signature, 64),
    ]) as any,
    receiver
  }
  return data
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

    test('Maker cannot withdraw more than they own', async () => {

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

      const withdraw_amount = getRandomAmount(deposit_amount.toNumber(), deposit_amount.toNumber() + 10000)

      let reason: string | undefined = undefined
      try {
        await getRfqOrders(maker, contractIdBits(rfqOrders)).functions.withdraw(maker_asset, withdraw_amount)
          .call()
      } catch (e) {
        reason = String(e)
      }

      expect(reason).to.toBeDefined()

      expect(
        reason
      ).to.include("WithdrawTooMuch")

    });
  });

  describe('Rfq fill via `fill`', async () => {
    test('Facilitates full order fill', async () => {

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

    test('Facilitates Order partial fill, specifying maker_amount', async () => {

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

      const maker_fill_amount = getRandomAmount(1, Number(maker_amount.toString()))

      const taker_fill_amount = computeTakerFillAmount(maker_fill_amount, order.maker_amount, order.taker_amount.toString())

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

  describe('Rfq fill via `fill_funded` through BatchSwapExactInScript', async () => {
    test('Facilitates full order fill', async () => {
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

      /** DEFINE PARAMETERS */

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

      const swap_step = createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

      const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
          taker_amount, maker_amount.sub(1), true, [swap_step]
        ]
      ]

      const deadline = MAX_EXPIRY

      const request = await (await callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
        .addContracts([rfqOrders])
        .txParams(txParams)
        .getTransactionRequest()

      const inputAssets: CoinQuantity[] = [
        {
          assetId: taker_asset,
          amount: taker_amount,
        }
      ];


      const finalRequest = await prepareRequest(taker, request, 3, inputAssets, [rfqOrders.id.toB256()])

      /** EXECUTE TXN */

      const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
      await tx.waitForResult()

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

    test('Facilitates partial order fill', async () => {
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

      /** DEFINE PARAMETERS */

      const order: RfqOrderInput = {
        maker_asset,
        taker_asset,
        maker_amount,
        taker_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: MAX_EXPIRY,
      }

      const taker_fill_amount = getRandomAmount(1, Number(taker_amount.toString()))

      const maker_fill_amount = computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount.toString())


      const signatureRaw = await maker.signMessage(packOrder(order))

      const swap_step = createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

      const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
          taker_fill_amount, maker_fill_amount.sub(1), true, [swap_step]
        ]
      ]

      const deadline = MAX_EXPIRY

      const request = await (await callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
        .addContracts([rfqOrders])
        .txParams(txParams)
        .getTransactionRequest()

      const inputAssets: CoinQuantity[] = [
        {
          assetId: taker_asset,
          amount: taker_fill_amount,
        }
      ];

      const finalRequest = await prepareRequest(taker, request, 3, inputAssets, [rfqOrders.id.toB256()])

      /** EXECUTE TXN */

      const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
      await tx.waitForResult()

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


    test('Facilitates multihop partial order fill', async () => {
      /**
       * We test a swap taker_asset -> intermediate_asset -> maker_asset
       */

      const launched = await launchTestNode({ walletsConfig: { count: 3 } });

      const {
        wallets: [maker, deployer, taker]
      } = launched;

      const { rfqOrders, tokens } = await fixture(deployer)

      const [maker_asset, taker_asset, intermediate_asset] = await createTokens(deployer, contractIdBits(tokens), EXTENDED_NAMES)

      await fundWallets(
        [maker, taker, maker],
        contractIdBits(tokens),
        [maker_asset, taker_asset, intermediate_asset],
        [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = getRandomAmount()
      const intermediate_amount = getRandomAmount()
      const taker_amount = getRandomAmount()


      await createMakerDeposits(maker, rfqOrders, [maker_asset, intermediate_asset], [maker_amount.toNumber(), intermediate_amount.toNumber()])

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

      /** DEFINE PARAMETERS */

      const order0: RfqOrderInput = {
        maker_asset: intermediate_asset, // asset_mid
        taker_asset, // asset_in
        maker_amount: intermediate_amount,
        taker_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: MAX_EXPIRY,
      }

      const order1: RfqOrderInput = {
        maker_asset, // asset_out
        taker_asset: intermediate_asset, // asset_mid
        maker_amount,
        taker_amount: intermediate_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: MAX_EXPIRY,
      }

      const taker_fill_amount = getRandomAmount(1, taker_amount.toNumber()) // this is the actual amount_in

      const intermediate_fill_amount = computeMakerFillAmount(taker_fill_amount, order0.maker_amount, order0.taker_amount)

      const maker_fill_amount = computeMakerFillAmount(intermediate_fill_amount, order1.maker_amount, order1.taker_amount)

      const signatureRaw0 = await maker.signMessage(packOrder(order0))
      const signatureRaw1 = await maker.signMessage(packOrder(order1))

      const swap_step0 = createRfqBatchSwapStep(order0, signatureRaw0, contractIdInput(rfqOrders.id))
      const swap_step1 = createRfqBatchSwapStep(order1, signatureRaw1, addressInput(taker.address))

      const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
          taker_fill_amount,
          1, // maker_fill_amount.sub(1),
          true,
          [
            swap_step0,
            swap_step1
          ]
        ]
      ]

      const deadline = MAX_EXPIRY

      const request = await (await callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
        .addContracts([rfqOrders])
        .txParams(txParams)
        .getTransactionRequest()

      const inputAssets: CoinQuantity[] = [
        {
          assetId: taker_asset,
          amount: taker_fill_amount,
        }
      ];

      const finalRequest = await prepareRequest(taker, request, 3, inputAssets, [rfqOrders.id.toB256()])

      /** EXECUTE TXN */

      const tx = await taker.sendTransaction(finalRequest, { estimateTxDependencies: true })
      await tx.waitForResult()

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

