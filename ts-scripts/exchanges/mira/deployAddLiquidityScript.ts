import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../../../env";
import { TestnetData } from "../../contexts";
import { CreatePoolAndAddLiquidityScriptFactory } from "../../typegen/CreatePoolAndAddLiquidityScriptFactory";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const LiqFactoryContract = new CreatePoolAndAddLiquidityScriptFactory(wallet)
    LiqFactoryContract.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })
    const txn = await LiqFactoryContract.deploy()
    await txn.waitForResult()

    console.log("script created")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });