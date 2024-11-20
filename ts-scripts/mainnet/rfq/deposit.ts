import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { MNEMONIC, PRIVATE_KEY } from "../../../env";
import { OneDeltaRfq } from "../../typegen/OneDeltaRfq";


const maker_asset = MainnetData.USDT.address
const deposit_amount = 1_000_000

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log("wallet", wallet.address.toB256())
    const rfqOrders = new OneDeltaRfq(MainnetData.ONE_DELTA_RFQ, wallet)

    await rfqOrders.functions.deposit()
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