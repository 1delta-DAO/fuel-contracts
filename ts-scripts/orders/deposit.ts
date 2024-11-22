import { Provider, Wallet } from "fuels";
import { TestnetData } from "../contexts";
import { MNEMONIC } from "../../env";
import { OneDeltaOrders } from "../typegen/OneDeltaOrders";


const maker_asset = TestnetData.USDC.assetId
const deposit_amount = 100_000_000_000

async function main() {
    const provider = await Provider.create(TestnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const Orders = new OneDeltaOrders(TestnetData.one_delta_orders, wallet)

    await Orders.functions.deposit()
        .callParams({ forward: { assetId: maker_asset, amount: deposit_amount.toString() } })
        .call()

    console.log("deposited")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });