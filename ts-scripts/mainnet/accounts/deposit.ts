import { CoinQuantityLike, Contract, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { addressInput, contractIdInput, prepareRequest } from "../../utils";
import { getComposerRequest } from "../calldata";
import { Vec } from "../../typegen/common";
import { ActionInput } from "../../typegen/ComposerScript";
import { AccountFactory } from "../../typegen/AccountFactory";
import { ACCOUNT_ADDRESSES } from "./addresses";
import { composerTxParams } from "../../utils/constants";
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

const proxyAccount = "0xd3101a9b4f29f49be7af650fbd74bbf4402b1a0c5b2a421c3a8543db227181d1"

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    const bals = await wallet.getBalances()

    const amountToDeposit = 10_000n; // 0.00001 ETH

    const collateral_asset = MainnetData.ETH

    const refBal = bals.balances.find(a => a.assetId === collateral_asset.address)?.amount.toString()

    console.log("balance in collateral", refBal)

    if (amountToDeposit > BigInt(refBal ?? 0)) throw new Error(`attempting to deposit ${amountToDeposit} but only has ${refBal}`)


    const factory = new AccountFactory(ACCOUNT_ADDRESSES.factory, wallet)

    const params: Vec<ActionInput> = [
        {
            Lending: {
                lender_id: 0,
                action_id: LenderAction.Deposit,
                asset: { bits: collateral_asset.address },
                amount_in: amountToDeposit.toString(),
                amount_type_id: AmountType.Defined,
                market: { bits: MainnetData.SWAYLEND_USDC_MARKET_PROXY },
                data: undefined,
                additional_params: undefined
            },
        },
    ]
    const inputAssets: CoinQuantityLike[] = [{
        assetId: collateral_asset.address,
        amount: amountToDeposit as any,
    }]
    const request = await factory.functions
        .register_and_call(
            contractIdInput(proxyAccount).ContractId!,
            addressInput(wallet.address),
            params
        )
        .txParams(composerTxParams)
        .callParams({
            // @ts-ignore-next-line
            forward: {
                assetId: collateral_asset.address,
                amount: amountToDeposit
            }
        })
        .getTransactionRequest()

    // console.log("inputAssets", inputAssets)
    try {
        console.log("prepare request")
        const finalRequest = await prepareRequest(
            wallet,
            request,
            0,
            inputAssets,
        )
        // console.log("request", finalRequest)

        // estimate gas cost
        const gasCost = await wallet.getTransactionCost(finalRequest)
        console.log("gasCost", gasCost.gasUsed.toString())

        // simulate txn
        const tx = await wallet.sendTransaction(finalRequest, { estimateTxDependencies: true, })
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