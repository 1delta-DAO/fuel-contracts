import { CoinQuantityLike, Contract, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { prepareRequest } from "../../utils";
import { getComposerRequest } from "../calldata";
import { Vec } from "../../typegen/common";
import { ActionInput } from "../../typegen/ComposerScript";
import SWAYLEND_ABI from "../../../fixtures/swaylend/market-abi.json";
import { getPrice } from "./price";

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

    const amountToDeposit = 14_000_000n; // 14 USDT
    const amountToBorrow = 10_000_000n; // 10 USDC

    const deadline = 99999999
    const collateral_asset = MainnetData.USDT
    const borrow_asset = MainnetData.USDC

    const swaylend = new Contract(MainnetData.SWAYLEND_USDC_MARKET_PROXY, SWAYLEND_ABI, provider)
    const priceData = await getPrice(swaylend)

    const paths: Vec<ActionInput> = [
        {
            Lending: {
                lender_id: 0, 
                action_id: LenderAction.Deposit, 
                asset: { bits: collateral_asset.address }, 
                amount_in: amountToDeposit.toString(), 
                amount_type_id: AmountType.Defined, 
                data: undefined
            },
        },
        {
            Lending: {
                lender_id: 0, 
                action_id: LenderAction.Borrow, 
                asset: { bits: borrow_asset.address }, 
                amount_in: amountToBorrow.toString(), 
                amount_type_id: AmountType.Defined, 
                data: priceData?.priceUpdateData
            },
        },
    ]

    const request = await getComposerRequest(paths, deadline)

    const variableOutputs: number = 0
    const inputAssets: CoinQuantityLike[] = [{
        assetId: collateral_asset.address,
        amount: amountToDeposit as any,
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