import { CoinQuantityLike, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { prepareRequest } from "../../utils";
import { getComposerRequest } from "../calldata";
import { Vec } from "../../typegen/common";
import { ActionInput } from "../../typegen/ComposerScript";

enum LenderAction {
    Deposit = 0,
    Borrow = 1,
    Withdraw = 2,
    Repay = 3
}

enum AmountType {
    Received = 0,
    Defined = 1,
}

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log(await wallet.getBalances());

    const amountIn0 = 300_000n; // 0.3 USDT

    const deadline = 99999999
    const collateral_asset = MainnetData.USDT

    const paths: Vec<ActionInput> = [{
        Lending: {
            lender_id: 0, 
            action_id: LenderAction.Deposit, 
            asset: { bits: collateral_asset.address }, 
            amount_in: amountIn0.toString(), 
            amount_type_id: AmountType.Defined, 
            receiver: { Address: { bits: wallet.address.toAddress() } }, 
            data: undefined
        }
    }]

    const request = await getComposerRequest(paths, deadline)

    const variableOutputs: number = 0
    const inputAssets: CoinQuantityLike[] = [{
        assetId: collateral_asset.address,
        amount: amountIn0 as any,
    }]

    try {
        console.log("prepare request")
        const finalRequest = await prepareRequest(
            wallet,
            request,
            variableOutputs,
            inputAssets,
        )
        console.log("request", finalRequest)
        const tx = await wallet.simulateTransaction(finalRequest, { estimateTxDependencies: true })

        console.log("completed")
    } catch (e: any) {
        console.log(e?.metadata?.receipts)
        console.log(e?.metadata?.logs)
        throw e;
    }

    console.log("opened position")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });