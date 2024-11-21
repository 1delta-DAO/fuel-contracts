import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { OrderTestUtils } from './utils';

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
});
