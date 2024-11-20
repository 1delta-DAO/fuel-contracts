import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { RfqTestUtils } from './utils';

describe('Maker Actions', async () => {
  test('Maker can deposit', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens), ["test"])

    await RfqTestUtils.fundWallets([maker], RfqTestUtils.contractIdBits(tokens), [maker_asset], [RfqTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = RfqTestUtils.getRandomAmount(1, 10000)

    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const [balanceReceived] = await RfqTestUtils.getMakerBalances(maker, [maker_asset], rfqOrders)

    expect(balanceReceived.toString()).to.equal(deposit_amount.toString())
  });

  test('Maker can withdraw', async () => {

    const launched = await launchTestNode();

    const {
      wallets: [maker, deployer]
    } = launched;


    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens), ["test"])

    await RfqTestUtils.fundWallets([maker], RfqTestUtils.contractIdBits(tokens), [maker_asset], [RfqTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = RfqTestUtils.getRandomAmount(1, 10000)

    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const withdraw_amount = RfqTestUtils.getRandomAmount(1, deposit_amount.toNumber())
    const [balance_before_withdraw] = await RfqTestUtils.getMakerBalances(maker, [maker_asset], rfqOrders)
    const [maker_balance_before_withdraw] = await RfqTestUtils.getConventionalBalances(maker, [maker_asset])

    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.withdraw(maker_asset, withdraw_amount)
      .call()

    const [balance_after_withdraw] = await RfqTestUtils.getMakerBalances(maker, [maker_asset], rfqOrders)
    const [maker_balance_after_withdraw] = await RfqTestUtils.getConventionalBalances(maker, [maker_asset])

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


    const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

    const [maker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens), ["test"])

    await RfqTestUtils.fundWallets([maker], RfqTestUtils.contractIdBits(tokens), [maker_asset], [RfqTestUtils.DEFAULT_MINT_AMOUNT])

    const deposit_amount = RfqTestUtils.getRandomAmount(1, 10000)

    await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
      .callParams({ forward: { assetId: maker_asset, amount: deposit_amount } })
      .call()

    const withdraw_amount = RfqTestUtils.getRandomAmount(deposit_amount.toNumber(), deposit_amount.toNumber() + 10000)

    let reason: string | undefined = undefined
    try {
      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.withdraw(maker_asset, withdraw_amount)
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
