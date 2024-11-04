import { CoinQuantityLike, Provider, Wallet } from "fuels";
import { TestnetData } from "./contexts";
import { MNEMONIC } from "./env";
import { BatchSwapExactInScript, BatchSwapStepInput } from "./typegen/BatchSwapExactInScript";
import { DexId, txParams } from "./utils/constants";
import { MiraAmmContract } from "./typegen/MiraAmmContract";
import { addressInput, contractIdInput, prepareRequest } from "./utils";
import { encodeMiraParams } from "./utils/coder";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const SwapExactInScript = new BatchSwapExactInScript(wallet)
    SwapExactInScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })

    const miraAmm = new MiraAmmContract(TestnetData.MIRA_AMM, provider)
    const ammFees = (await miraAmm.functions.fees().get()).value
    console.log(ammFees)

    const isStable = true

    const fee = isStable ? ammFees[1] : ammFees[0]

    const miraParams = encodeMiraParams(fee, isStable)

    console.log("miraParams", miraParams)

    const amountIn = 10_000000000;

    const tokenIn = TestnetData.USDT
    const tokenOut = TestnetData.USDC

    let swapSteps: BatchSwapStepInput[] = [
        {
            dex_id: DexId.MiraV1,
            asset_in: contractIdInput(tokenIn.assetId),
            asset_out: contractIdInput(tokenOut.assetId),
            receiver: addressInput(wallet.address),
            data: miraParams,
        }
    ]

    const request = await SwapExactInScript.functions.main(
        [
            [amountIn, "0", true, swapSteps]
        ],
        99999999
    ).addContracts(
        [miraAmm]
    ).txParams(txParams).getTransactionRequest()

    const inputAssets: CoinQuantityLike[] = [
        {
            assetId: tokenIn.assetId,
            amount: amountIn,
        },
    ];
    try {
        const finalRequest = await prepareRequest(wallet, request, 1, inputAssets)
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