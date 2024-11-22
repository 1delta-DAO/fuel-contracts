import { BigNumberish, BN, concatBytes, Contract, hashMessage, toBytes, WalletUnlocked } from 'fuels';
import { assetIdInput, contractIdInput } from '../../ts-scripts/utils';

import { MockTokenFactory } from '../../ts-scripts/typegen/MockTokenFactory';
import { MockToken } from '../../ts-scripts/typegen/MockToken';
import { OneDeltaOrders, OrderInput } from '../../ts-scripts/typegen/OneDeltaOrders';
import { OneDeltaOrdersFactory } from '../../ts-scripts/typegen/OneDeltaOrdersFactory';
import { BatchSwapStepInput, BatchSwapExactInScript, IdentityInput } from '../../ts-scripts/typegen/BatchSwapExactInScript';
import { BatchSwapExactOutScript } from '../../ts-scripts/typegen/BatchSwapExactOutScript';
import { expect } from 'vitest';


export namespace OrderTestUtils {

  export enum ErrorCodes {
    // error codes
    NO_ERROR = 0x0,
    INVALID_ORDER_SIGNATURE = 0x1,
    INVALID_NONCE = 0x2,
    EXPIRED = 0x3,
    INSUFFICIENT_TAKER_AMOUNT_RECEIVED = 0x4,
    MAKER_BALANCE_TOO_LOW = 0x5,
    WITHDRAW_TOO_MUCH = 0x6,
    CANCELLED = 0x7,
    ORDER_ALREADY_FILLED = 0x8,
    INVALID_CANCEL = 0x9
  }

  export enum ScriptErrorCodes {
    INVALID_DEX = 0x1,
    ORDER_OUTPUT_TOO_HIGH = 0x2,
    ORDER_INCOMPLETE_FILL = 0x3,
  }

  export const MAX_EXPIRY = 4_294_967_295
  export const RFQ_DEX_ID = 100

  /** Utility functions */

  // deploy all relevant fixtures
  export async function fixture(deployer: WalletUnlocked) {

    const deployTokenTx = await MockTokenFactory.deploy(deployer)

    const { contract: tokens } = await deployTokenTx.waitForResult()

    const deployRfqTx = await OneDeltaOrdersFactory.deploy(deployer)

    const { contract: Orders } = await deployRfqTx.waitForResult()

    return {
      tokens,
      Orders
    }
  }

  export async function callExactInScriptScope(
    path: any,
    deadline: number,
    user: WalletUnlocked, Order: string) {

    return await new BatchSwapExactInScript(user).setConfigurableConstants(
      {
        MIRA_AMM_CONTRACT_ID: contractIdInput(Order).ContractId,
        ONE_DELTA_ORDERS_CONTRACT_ID: contractIdInput(Order).ContractId,
      }
    ).functions.main(
      path,
      deadline
    ) as any
  }

  export async function callExactOutScriptScope(
    path: any,
    deadline: number,
    user: WalletUnlocked, Order: string) {

    return await new BatchSwapExactOutScript(user).setConfigurableConstants(
      {
        MIRA_AMM_CONTRACT_ID: contractIdInput(Order).ContractId,
        ONE_DELTA_ORDERS_CONTRACT_ID: contractIdInput(Order).ContractId,
      }
    ).functions.main(
      path,
      deadline
    ) as any
  }

  /** We randomize the amounts used for tests */
  export function getRandomAmount(min = 1, max = DEFAULT_RANDOM_AMOUNT_LIMIT) {
    return new BN(Math.round((min + Math.random() * (max - min))))
  }

  /** Get the Rfq order contract with a specific signer */
  export function getOrders(signer: WalletUnlocked, orderAddr: string) {
    return new OneDeltaOrders(orderAddr, signer)
  }

  export const DEFAULT_RANDOM_AMOUNT_LIMIT = 1_000_000
  export const DEFAULT_MINT_AMOUNT = 10_000_000
  export const DEFAULT_DECIMALS = 9
  export const DEFAULT_NAMES = ["MakerToken", "TakerToken"]
  export const EXTENDED_NAMES = [...DEFAULT_NAMES, "IntermediateToken"]

  export async function createTokens(signer: WalletUnlocked, mockTokenAddr: string, names = ["MakerToken", "TakerToken"]): Promise<string[]> {
    const token = new MockToken(mockTokenAddr, signer)

    let assetIds: string[] = []
    for (let name of names) {
      const a = await token.functions.add_token(name, name.toUpperCase(), DEFAULT_DECIMALS).call()
      const res = await a.waitForResult()
      assetIds.push(res.value.bits)
    }

    return assetIds
  }

  export function contractIdBits(c: Contract) {
    return c.id.toB256()
  }

  export async function fundWallets(
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

  export async function createMakerDeposits(
    maker: WalletUnlocked,
    orders: OneDeltaOrders,
    tokens = ["0x", "0x"],
    amounts = [DEFAULT_MINT_AMOUNT, DEFAULT_MINT_AMOUNT]
  ) {
    if (tokens.length !== amounts.length)
      throw new Error("createTakerDeposits: inconsistent input lengths")
    let i = 0
    for (let token of tokens) {
      await getOrders(maker, contractIdBits(orders)).functions.deposit()
        .callParams({ forward: { assetId: token, amount: amounts[i] } })
        .call()
      i++;
    }
  }

  // computes the maker amount relative to the rates given in the order and taker amount
  export function computeMakerFillAmount(taker_fill_amount: BigNumberish, maker_amount: BigNumberish, taker_amount: BigNumberish) {
    return new BN(taker_fill_amount).mul(maker_amount).div(taker_amount)
  }

  // computes the taker amount relative to the rates given in the order and taker amount
  // we need to add 1 to account for rounding errors
  export function computeTakerFillAmount(maker_fill_amount: BigNumberish, maker_amount: BigNumberish, taker_amount: BigNumberish) {
    return new BN(maker_fill_amount).mul(taker_amount).div(maker_amount).add(1)
  }

  export function packOrder(order: OrderInput, rfq: OneDeltaOrders | string) {
    const rfqAddress = typeof rfq === "string" ? rfq : rfq.id.toB256()
    return concatBytes([
      toBytes(rfqAddress, 32),
      toBytes(order.maker_asset, 32),
      toBytes(order.taker_asset, 32),
      toBytes(order.maker_amount, 8),
      toBytes(order.taker_amount, 8),
      toBytes(order.maker, 32),
      toBytes(order.nonce, 8),
      toBytes(order.expiry, 4),
    ]) as any
  }

  export async function testFillStatus(order: OrderInput, rfq: OneDeltaOrders, expected_filled_amount: BigNumberish, isCancelled = false) {

    const [cancelled, taker_filled_amount] = (await rfq.functions.get_order_fill_status(OrderTestUtils.getHash(order, rfq)).simulate()).value

    expect(cancelled).to.equal(isCancelled)

    // validate state
    expect(
      taker_filled_amount.toString()
    ).to.equal(
      expected_filled_amount.toString()
    )
  }

  export function getHash(order: OrderInput, rfq: OneDeltaOrders | string) {
    return hashMessage(packOrder(order, rfq))
  }

  export async function getMakerBalances(maker: string | WalletUnlocked, assets: string[], rfq: OneDeltaOrders) {
    let bal: BN[] = []
    let makerStringified = typeof maker === "string" ? maker : maker.address.toB256()
    for (let assetId of assets) {
      const result = await rfq.functions.get_maker_balance(makerStringified, assetId).simulate()
      bal.push(result.value)
    }

    return bal
  }

  export async function getTotalBalances(assets: string[], rfq: OneDeltaOrders) {
    let bal: BN[] = []
    for (let assetId of assets) {
      const result = await rfq.functions.get_balance(assetId).simulate()
      bal.push(result.value)
    }

    return bal
  }


  export async function getNonce(order: OrderInput, rfq: OneDeltaOrders) {
    return (await rfq.functions.get_nonce(order.maker, order.maker_asset, order.taker_asset).simulate()).value
  }

  export async function getConventionalBalances(u: WalletUnlocked, assets: string[]) {
    let bal: BN[] = []
    for (let assetId of assets) {
      const result = await u.getBalance(assetId)
      bal.push(result)
    }
    return bal
  }

  export function createRfqBatchSwapStep(order: OrderInput, signature: string, receiver: IdentityInput) {
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

}