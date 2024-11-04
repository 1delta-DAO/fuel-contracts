import { Provider, Wallet } from "fuels";
import { TestnetData } from "./contexts";
import { MNEMONIC } from "./env";
import { BatchSwapExactInScriptFactory } from "./typegen/BatchSwapExactInScriptFactory";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const SwapExactInFactory = new BatchSwapExactInScriptFactory(wallet)
    SwapExactInFactory.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })
    const txn = await SwapExactInFactory.deploy()
    await txn.waitForResult()

    console.log("script created")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });