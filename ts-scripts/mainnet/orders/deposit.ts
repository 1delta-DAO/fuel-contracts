import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { OneDeltaOrders } from "../../typegen/OneDeltaOrders";

const maker_asset = MainnetData.USDT.address
const deposit_amount = 1_000_000

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log("wallet", wallet.address.toB256())
    const Orders = new OneDeltaOrders(MainnetData.one_delta_orders, wallet)

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