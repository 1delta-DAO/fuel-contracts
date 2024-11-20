import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { BigNumberish, CoinQuantity, } from 'fuels';
import { addressInput, contractIdInput, prepareRequest } from '../ts-scripts/utils';

import { RfqOrderInput } from '../ts-scripts/typegen/OneDeltaRfq';
import { BatchSwapStepInput } from '../ts-scripts/typegen/BatchSwapExactInScript';
import { txParams } from '../ts-scripts/utils/constants';
import { RfqTestUtils } from './utils';

describe('Rfq fill via `fill_funded` through BatchSwapExactInScript', async () => {
  test('Cannot fill more than taker_amount', async () => {
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

    /** DEFINE PARAMETERS */

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce: RfqTestUtils.getRandomAmount(1),
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

    const swap_step = RfqTestUtils.createRfqBatchSwapStep(order, signatureRaw, addressInput(taker.address))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
      [
        taker_amount.add(1), maker_amount.sub(1), true, [swap_step]
      ]
    ]

    const deadline = RfqTestUtils.MAX_EXPIRY
    let reason: string | undefined = undefined
    try {
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
    } catch (e) {
      reason = String(e)
    }
    expect(reason).to.toBeDefined()

    expect(
      reason
    ).to.include("TakerFillAmountTooHigh")

  });


  test('Facilitates full order fill exact input', async () => {
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
    let nonce = RfqTestUtils.getRandomAmount(1)

    const order: RfqOrderInput = {
      maker_asset,
      taker_asset,
      maker_amount,
      taker_amount,
      maker: maker.address.toB256(),
      nonce,
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

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

    // validate nonce
    const newNonce = await RfqTestUtils.getNonce(order, rfqOrders)
    expect(newNonce.toString()).to.equal(nonce.toString())

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

    // validate taker change
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

  test('Facilitates partial order fill exact input', async () => {
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
      nonce: RfqTestUtils.getRandomAmount(1),
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const taker_fill_amount = RfqTestUtils.getRandomAmount(1, Number(taker_amount.toString()))

    const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order.maker_amount, order.taker_amount)


    const signatureRaw = await maker.signMessage(RfqTestUtils.packOrder(order, rfqOrders))

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

    // validate taker change
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


  test('Facilitates multihop partial order fill exact input', async () => {
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
      nonce: RfqTestUtils.getRandomAmount(1),
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const order1: RfqOrderInput = {
      maker_asset, // asset_out
      taker_asset: intermediate_asset, // asset_mid
      maker_amount,
      taker_amount: intermediate_amount,
      maker: maker.address.toB256(),
      nonce: RfqTestUtils.getRandomAmount(1),
      expiry: RfqTestUtils.MAX_EXPIRY,
    }

    const taker_fill_amount = RfqTestUtils.getRandomAmount(1, taker_amount.toNumber()) // this is the actual amount_in

    const intermediate_fill_amount = RfqTestUtils.computeMakerFillAmount(taker_fill_amount, order0.maker_amount, order0.taker_amount)

    const maker_fill_amount = RfqTestUtils.computeMakerFillAmount(intermediate_fill_amount, order1.maker_amount, order1.taker_amount)

    const signatureRaw0 = await maker.signMessage(RfqTestUtils.packOrder(order0, rfqOrders))
    const signatureRaw1 = await maker.signMessage(RfqTestUtils.packOrder(order1, rfqOrders))

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

    // validate taker change
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