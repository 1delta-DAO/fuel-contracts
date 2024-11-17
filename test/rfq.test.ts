import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { BigNumberish, CoinQuantity, hashMessage, } from 'fuels';
import { addressInput, contractIdInput, prepareRequest } from '../ts-scripts/utils';
import { ErrorInput, RfqOrderInput } from '../ts-scripts/typegen/OrderRfq';
import { BatchSwapStepInput } from '../ts-scripts/typegen/BatchSwapExactInScript';
import { txParams } from '../ts-scripts/utils/constants';
import { RfqTestUtils } from './utils';

describe('RFQ Orders', () => {
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

      const data = RfqTestUtils.packOrder(order)

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

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

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

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

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

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

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

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

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

  describe('Rfq fill via `fill`', async () => {
    test('Facilitates full order fill', async () => {

      const launched = await launchTestNode({ walletsConfig: { count: 3 } });

      const {
        wallets: [maker, deployer, taker]
      } = launched;

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

      const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

      await RfqTestUtils.fundWallets(
        [maker, taker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()

      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()


      const taker_amount = RfqTestUtils.getRandomAmount()

      const order: RfqOrderInput = {
        maker_asset,
        taker_asset,
        maker_amount,
        taker_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: RfqTestUtils.MAX_EXPIRY,
      }

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
        taker,
        [maker_asset, taker_asset]
      )

      await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
        order,
        signatureRaw,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_amount } })
        .call()

      const [
        maker_maker_asset_balance_after,
        maker_taker_asset_balance_after
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

      const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

      await RfqTestUtils.fundWallets(
        [maker, taker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()
      const taker_amount = RfqTestUtils.getRandomAmount()


      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()

      const order: RfqOrderInput = {
        maker_asset,
        taker_asset,
        maker_amount,
        taker_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: RfqTestUtils.MAX_EXPIRY,
      }
      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))


      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
        taker,
        [maker_asset, taker_asset]
      )

      const taker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(taker_amount.toString()))

      const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount.toString())

      await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
        order,
        signatureRaw,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
        .call()

      const [
        maker_maker_asset_balance_after,
        maker_taker_asset_balance_after
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

      const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

      await RfqTestUtils.fundWallets(
        [maker, taker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()
      const taker_amount = RfqTestUtils.getRandomAmount()


      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()

      const order: RfqOrderInput = {
        maker_asset,
        taker_asset,
        maker_amount,
        taker_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: RfqTestUtils.MAX_EXPIRY,
      }
      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))


      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
        taker,
        [maker_asset, taker_asset]
      )

      const maker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(maker_amount.toString()))

      const taker_fill_amount = RfqTestUtils.computeTakerFillAmount(maker_fill_amount, order.maker_amount, order.taker_amount.toString())

      await RfqTestUtils.getRfqOrders(taker, RfqTestUtils.contractIdBits(rfqOrders)).functions.fill(
        order,
        signatureRaw,
        addressInput(taker.address)
      )
        .callParams({ forward: { assetId: taker_asset, amount: taker_fill_amount } })
        .call()

      const [
        maker_maker_asset_balance_after,
        maker_taker_asset_balance_after
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

      const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

      await RfqTestUtils.fundWallets(
        [maker, taker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()
      const taker_amount = RfqTestUtils.getRandomAmount()


      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()


      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
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
        expiry: RfqTestUtils.MAX_EXPIRY,
      }

      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

      const swap_step = RfqTestUtils.createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

      const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
          taker_amount, maker_amount.sub(1), true, [swap_step]
        ]
      ]

      const deadline = RfqTestUtils.MAX_EXPIRY

      const request = await (await RfqTestUtils.callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
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
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)



      const [maker_asset, taker_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens))

      await RfqTestUtils.fundWallets(
        [maker, taker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()
      const taker_amount = RfqTestUtils.getRandomAmount()


      await RfqTestUtils.getRfqOrders(maker, RfqTestUtils.contractIdBits(rfqOrders)).functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: maker_amount } })
        .call()


      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
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
        expiry: RfqTestUtils.MAX_EXPIRY,
      }

      const taker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(taker_amount.toString()))

      const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount.toString())


      const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order))

      const swap_step = RfqTestUtils.createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

      const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
          taker_fill_amount, maker_fill_amount.sub(1), true, [swap_step]
        ]
      ]

      const deadline = RfqTestUtils.MAX_EXPIRY

      const request = await (await RfqTestUtils.callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
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
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

      const { rfqOrders, tokens } = await RfqTestUtils.fixture(deployer)

      const [maker_asset, taker_asset, intermediate_asset] = await RfqTestUtils.createTokens(deployer, RfqTestUtils.contractIdBits(tokens), RfqTestUtils.EXTENDED_NAMES)

      await RfqTestUtils.fundWallets(
        [maker, taker, maker],
        RfqTestUtils.contractIdBits(tokens),
        [maker_asset, taker_asset, intermediate_asset],
        [RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT, RfqTestUtils.DEFAULT_MINT_AMOUNT]
      )

      const maker_amount = RfqTestUtils.getRandomAmount()
      const intermediate_amount = RfqTestUtils.getRandomAmount()
      const taker_amount = RfqTestUtils.getRandomAmount()


      await RfqTestUtils.createMakerDeposits(maker, rfqOrders, [maker_asset, intermediate_asset], [maker_amount.toNumber(), intermediate_amount.toNumber()])

      const [
        maker_maker_asset_balance_before,
        maker_taker_asset_balance_before
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_before,
        taker_taker_asset_balance_before
      ] = await RfqTestUtils.getConventionalBalances(
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
        expiry: RfqTestUtils.MAX_EXPIRY,
      }

      const order1: RfqOrderInput = {
        maker_asset, // asset_out
        taker_asset: intermediate_asset, // asset_mid
        maker_amount,
        taker_amount: intermediate_amount,
        maker: maker.address.toB256(),
        nonce: '0',
        expiry: RfqTestUtils.MAX_EXPIRY,
      }

      const taker_fill_amount = RfqTestUtils.getRandomAmount(1, taker_amount.toNumber()) // this is the actual amount_in

      const intermediate_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order0.maker_amount, order0.taker_amount)

      const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(intermediate_fill_amount, order1.maker_amount, order1.taker_amount)

      const signatureRaw0 = await maker.signMessage(RfqTestUtils.packOrder(order0))
      const signatureRaw1 = await maker.signMessage(RfqTestUtils.packOrder(order1))

      const swap_step0 = RfqTestUtils.createRfqBatchSwapStep(order0, signatureRaw0, contractIdInput(rfqOrders.id))
      const swap_step1 = RfqTestUtils.createRfqBatchSwapStep(order1, signatureRaw1, addressInput(taker.address))

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

      const deadline = RfqTestUtils.MAX_EXPIRY

      const request = await (await RfqTestUtils.callExactInScriptScope(path, deadline, taker, rfqOrders.id.toB256()))
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
      ] = await RfqTestUtils.getMakerBalances(
        maker.address.toB256(),
        [maker_asset, taker_asset],
        rfqOrders
      )

      const [
        taker_maker_asset_balance_after,
        taker_taker_asset_balance_after
      ] = await RfqTestUtils.getConventionalBalances(
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

