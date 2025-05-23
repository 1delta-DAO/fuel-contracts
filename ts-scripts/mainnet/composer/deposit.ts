import { CoinQuantityLike, Contract, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { prepareRequest } from "../../utils";
import { getComposerRequest } from "../calldata";
import { Vec } from "../../typegen/common";
import { ActionInput } from "../../typegen/ComposerScript";
// import SWAYLEND_ABI from "../../../fixtures/swaylend/market-abi.json";
// import { getPrice } from "./price";

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
    const bals = await wallet.getBalances()
    
    // console.log(wallet.address, bals);

    const amountToDeposit = 100_000n; // 0.0001 ETH

    const deadline = 4_294_967_295 // max
    const collateral_asset = MainnetData.ETH

    const refBal = bals.balances.find(a => a.assetId === collateral_asset.address)?.amount.toString()

    console.log("balance in collateral", refBal)

    if (amountToDeposit > BigInt(refBal ?? 0)) throw new Error(`attempting to deposit ${amountToDeposit} but only has ${refBal}`)

    // const swaylend = new Contract(MainnetData.SWAYLEND_USDC_MARKET_PROXY, SWAYLEND_ABI, provider)
    // const priceData = await getPrice(swaylend)

    const paths: Vec<ActionInput> = [
        {
            Lending: {
                lender_id: 0,
                action_id: LenderAction.Deposit,
                asset: { bits: collateral_asset.address },
                amount_in: amountToDeposit.toString(),
                amount_type_id: AmountType.Defined,
                market: { bits: MainnetData.SWAYLEND_USDC_MARKET_PROXY },
                data: undefined
            },
        },
    ]

    const request = await getComposerRequest(paths, deadline)


    const variableOutputs: number = 0
    const inputAssets: CoinQuantityLike[] = [{
        assetId: collateral_asset.address,
        amount: amountToDeposit as any,
    }]
    // console.log("inputAssets", inputAssets)
    try {
        console.log("prepare request")
        const finalRequest = await prepareRequest(
            wallet,
            request,
            variableOutputs,
            inputAssets,
            [MainnetData.SWAYLEND_USDC_MARKET_PROXY]
        )
        // console.log("request", finalRequest)

        // estimate gas cost
        const gasCost = await wallet.getTransactionCost(finalRequest)
        console.log("gasCost", gasCost.gasUsed.toString())

        // simulate txn
        const tx = await wallet.simulateTransaction(finalRequest, { estimateTxDependencies: true, })
        console.log("completed", tx)
    } catch (e: any) {
        console.log(e?.metadata?.receipts)
        console.log(e?.metadata?.logs)
        throw e;
    }

    console.log("deposited")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });