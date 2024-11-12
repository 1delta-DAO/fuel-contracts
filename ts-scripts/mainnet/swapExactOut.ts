import { Provider, Wallet } from "fuels";
import { MainnetData } from "../contexts";
import { MNEMONIC } from "../../env";
import { prepareRequest } from "../utils";
import { getSwapExactOutScope } from "./calldata";
import { TRADE } from "./path";
import { Percent, TradeType } from "@1delta/base-sdk";
import { FuelPathConverter } from "@1delta/calldata-sdk";

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const maximumAmountIn0 = 100_000n;
    const maximumAmountIn1 = 100_000n;

    const amountOut0 = 300_000n;
    const amountOut1 = 300_000n;


    const deadline = 99999999

    const datas = FuelPathConverter.encodeFuelPaths(
        TRADE(maximumAmountIn0, maximumAmountIn1, amountOut0, amountOut1, TradeType.EXACT_OUTPUT),
        wallet.address.toAddress(),
        new Percent(3, 1000),
        deadline
    )

    const request = await getSwapExactOutScope()

    request.scriptData = datas.params

    console.log(datas.inputAssets)
    console.log(datas.inputContracts)
    try {
        console.log("prepare request")
        const finalRequest = await prepareRequest(
            wallet,
            request,
            datas.variableOutputs,
            datas.inputAssets,
            datas.inputContracts
        )

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