import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../env";
import { TestnetData } from "../contexts";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);
    console.log(await wallet.getBalances())
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });