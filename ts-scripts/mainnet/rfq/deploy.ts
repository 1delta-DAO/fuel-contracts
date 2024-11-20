import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { MNEMONIC } from "../../../env";
import { OneDeltaRfqFactory } from "../../typegen/OneDeltaRfqFactory";

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const rfqOrders = await OneDeltaRfqFactory.deploy(wallet)

    const rfqOrdersAddress = rfqOrders.contractId
    console.log(rfqOrdersAddress)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });