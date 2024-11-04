import { BigNumberish, CoinQuantityLike, Provider, Wallet } from "fuels";
import { TestnetData } from "./contexts";
import { MNEMONIC } from "./env";
import { BatchSwapExactOutScript, BatchSwapStepInput } from "./typegen/BatchSwapExactOutScript";
import { DexId, txParams } from "./utils/constants";
import { MiraAmmContract } from "./typegen/MiraAmmContract";
import { addressInput, assetIdInput, contractIdInput, prepareRequest } from "./utils";
import { encodeMiraParams } from "./utils/coder";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const SwapExactOutScript = new BatchSwapExactOutScript(wallet)
    SwapExactOutScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })

    const miraAmm = new MiraAmmContract(TestnetData.MIRA_AMM, provider)
    const ammFees = (await miraAmm.functions.fees().get()).value
    console.log(ammFees.map(s => s.toString()))

    const getMiraParams = (isStable: boolean) => isStable ? encodeMiraParams(ammFees[1], true) : encodeMiraParams(ammFees[0], false)

    const amountInMax0 = 18_000000000;
    const amountInMax1 = 10_000000000;

    const amountOut0 = 14_000000000;
    const amountOut1 = 6_000000000;

    const tokenIn = TestnetData.USDC
    const tokenOut = TestnetData.USDT
    const tokenMid = TestnetData.ETH

    // console.log("getMiraParams(false)", getMiraParams(false))

    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
            amountOut0, amountInMax0, true, [
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
            amountOut1, amountInMax1, true, [
                {
                    dex_id: DexId.MiraV1,
                    asset_in: assetIdInput(tokenMid.assetId),
                    asset_out: assetIdInput(tokenOut.assetId),
                    receiver: addressInput(wallet.address),
                    data: getMiraParams(false),
                },
                {
                    dex_id: DexId.MiraV1,
                    asset_in: assetIdInput(tokenIn.assetId),
                    asset_out: assetIdInput(tokenMid.assetId),
                    receiver: contractIdInput(TestnetData.MIRA_AMM),
                    data: getMiraParams(false),
                },
            ]
        ],
    ]

    const request = await SwapExactOutScript.functions.main(
        path,
        99999999
    ).addContracts(
        [miraAmm]
    ).txParams(txParams).getTransactionRequest()

    const inputAssets: CoinQuantityLike[] = [
        {
            assetId: tokenIn.assetId,
            amount: amountInMax0 + amountInMax1,
        },
    ];
    try {
        const finalRequest = await prepareRequest(wallet, request, 2, inputAssets, [TestnetData.MIRA_AMM])
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