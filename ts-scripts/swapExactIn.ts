import { BigNumberish, CoinQuantityLike, Provider, Wallet } from "fuels";
import { TestnetData } from "./contexts";
import { MNEMONIC } from "../env";
import { BatchSwapStepInput } from "./typegen/BatchSwapExactInScript";
import { DexId } from "./utils/constants";
import { MiraAmmContract } from "./typegen/MiraAmmContract";
import { addressInput, assetIdInput, contractIdInput, prepareRequest } from "./utils";
import { encodeMiraParams } from "./utils/coder";
import { getSwapExactInScriptCall } from "./utils/calldata";


async function main() {
    const provider = await Provider.create(TestnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const miraAmm = new MiraAmmContract(TestnetData.MIRA_AMM, provider)
    const ammFees = (await miraAmm.functions.fees().get()).value
    console.log(ammFees.map(s => s.toString()))

    const getMiraParams = (isStable: boolean) => isStable ? encodeMiraParams(ammFees[1], true) : encodeMiraParams(ammFees[0], false)

    const amountIn0 = 14_000000000;
    const amountIn1 = 6_000000000;

    const minimumOut0 = 1_0000000;
    const minimumOut1 = 1_0000000;

    const tokenIn = TestnetData.USDT
    const tokenOut = TestnetData.USDC
    const tokenMid = TestnetData.ETH


    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
            amountIn0, minimumOut0, true, [
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
            amountIn1, minimumOut1, true, [
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
    const deadline = 99999999

    const request = await getSwapExactInScriptCall(path, deadline)

    const inputAssets: CoinQuantityLike[] = [
        {
            assetId: tokenIn.assetId,
            amount: amountIn1 + amountIn1,
        }
    ];

    try {
        console.log("prepare request")
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