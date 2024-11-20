import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { OneDeltaRfq } from "../../typegen/OneDeltaRfq";

const maker_asset = MainnetData.USDT.address

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log("wallet", wallet.address.toB256())
    const rfqOrders = new OneDeltaRfq(MainnetData.ONE_DELTA_RFQ, wallet)

    const balance = (await rfqOrders.functions.get_maker_balance(wallet.address.toB256(), maker_asset).simulate()).value
    const total_balance = (await rfqOrders.functions.get_balance(maker_asset).simulate()).value

    const balanceNr = balance.toNumber()
    const total_balanceNr = total_balance.toNumber()

    console.log({ balanceNr, total_balanceNr })
    if (balanceNr > 0)
        await rfqOrders.functions.withdraw(maker_asset, balance)
            .call()

    console.log("withdrawn")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });