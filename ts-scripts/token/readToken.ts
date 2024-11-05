import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../env";
import { MainnetData } from "../contexts";
import { MockToken } from "../typegen/MockToken";
import { assetIdInput } from "../utils";

const assetId: string = MainnetData.USDT.address

async function main() {
    const provider = await Provider.create(MainnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MockTokenContract = new MockToken(MainnetData.TOKEN_GATEWAY, wallet)

    const tx2 = await MockTokenContract.multiCall(
        [
            MockTokenContract.functions.symbol(assetIdInput(assetId)),
            MockTokenContract.functions.decimals(assetIdInput(assetId)),
            MockTokenContract.functions.name(assetIdInput(assetId)),
        ]).dryRun()
    console.log("tx2", tx2.value)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });