import { BigNumberish, CoinQuantityLike, Provider, Wallet } from "fuels";
import { TestnetData } from "./contexts";
import { MNEMONIC } from "../env";
import {  BatchSwapStepInput } from "./typegen/BatchSwapExactInScript";
import { DexId, txParams } from "./utils/constants";
import { MiraAmmContract } from "./typegen/MiraAmmContract";
import { addressInput, assetIdInput, contractIdInput, prepareRequest } from "./utils";
import { encodeMiraParams } from "./utils/coder";
import { BatchSwapExactInScriptLoader } from "./sway_abis";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const SwapExactInScript = new BatchSwapExactInScriptLoader(wallet)
    SwapExactInScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })

    const miraAmm = new MiraAmmContract(TestnetData.MIRA_AMM, provider)
    const ammFees = (await miraAmm.functions.fees().get()).value
    console.log(ammFees.map(s => s.toString()))

    const getMiraParams = (isStable: boolean) => isStable ? encodeMiraParams(ammFees[1], true) : encodeMiraParams(ammFees[0], false)


    const amountIn0 = 14_000000000;
    const amountIn1 = 6_000000000;

    const tokenIn = TestnetData.USDT
    const tokenOut = TestnetData.USDC
    const tokenMid = TestnetData.ETH

    // console.log("getMiraParams(false)", getMiraParams(false))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
            amountIn0, "1", true, [
                {
                    dex_id: DexId.MiraV1,
                    asset_in: assetIdInput(tokenIn.assetId),
                    asset_out: assetIdInput(tokenOut.assetId),
                    receiver: addressInput(wallet.address),
                    data: getMiraParams(true),
                }
            ]
        ],
        [
            amountIn1, "1", true, [
                {
                    dex_id: DexId.MiraV1,
                    asset_in: assetIdInput(tokenIn.assetId),
                    asset_out: assetIdInput(tokenMid.assetId),
                    receiver: contractIdInput(TestnetData.MIRA_AMM),
                    data: getMiraParams(false),
                },
                {
                    dex_id: DexId.MiraV1,
                    asset_in: assetIdInput(tokenMid.assetId),
                    asset_out: assetIdInput(tokenOut.assetId),
                    receiver: addressInput(wallet.address),
                    data: getMiraParams(false),
                }
            ]
        ],
    ]

    const request = await SwapExactInScript.functions.main(
        path,
        99999999
    ).addContracts(
        [miraAmm]
    ).txParams(txParams).getTransactionRequest()

    const inputAssets: CoinQuantityLike[] = [
        {
            assetId: tokenIn.assetId,
            amount: amountIn1 + amountIn1,
        }
    ];
    try {
        const finalRequest = await prepareRequest(wallet, request, 3, inputAssets, [TestnetData.MIRA_AMM])
        console.log("swap request", finalRequest)
        const tx = await wallet.sendTransaction(finalRequest, { estimateTxDependencies: true })
        await tx.waitForResult()
        console.log("completed")
    } catch (e: any) {
        console.log(e?.metadata?.receipts)
        console.log(e?.metadata?.logs)
        throw e;
    }

    console.log("swapped")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });