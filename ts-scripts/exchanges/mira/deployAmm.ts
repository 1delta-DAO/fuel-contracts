import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../../env";
import { TestnetData } from "../../contexts";
import { MiraAmmContractFactory } from "../../typegen/MiraAmmContractFactory";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MiraAmmFactory = new MiraAmmContractFactory(wallet)
    const txn = await MiraAmmFactory.deploy()
    await txn.waitForResult()

    console.log("amm created")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });