import { Provider, Wallet } from "fuels";
import { MainnetData } from "../contexts";
import { MNEMONIC } from "../../env";
import { prepareRequest } from "../utils";
import { getSwapExactInScope } from "./calldata";
import { TRADE } from "./path";
import { Percent, TradeType } from "@1delta/base-sdk";
import { FuelPathConverter } from "@1delta/calldata-sdk";

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const amountIn0 = 100_000n; // 0.0001 ETH
    const amountIn1 = 100_000n;

    const minimumOut0 = 300_000n; // 0.3 USDT
    const minimumOut1 = 300_000n;

    const deadline = 99999999

    const datas = FuelPathConverter.encodeFuelPaths(
        TRADE(amountIn0, amountIn1, minimumOut0, minimumOut1, TradeType.EXACT_INPUT),
        wallet.address.toAddress(),
        new Percent(3, 1000),
        deadline
    )

    const request = await getSwapExactInScope()

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
        const tx = await wallet.simulateTransaction(finalRequest, { estimateTxDependencies: true })
        // await tx.waitForResult()
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