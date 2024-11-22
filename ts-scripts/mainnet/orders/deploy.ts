import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { MNEMONIC } from "../../../env";
import { OneDeltaOrdersFactory } from "../../typegen/OneDeltaOrdersFactory";

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const Orders = await OneDeltaOrdersFactory.deploy(wallet)

    const OrdersAddress = Orders.contractId
    console.log(OrdersAddress)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });