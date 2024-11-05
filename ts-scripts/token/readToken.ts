import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../env";
import { TestnetData } from "../contexts";
import { MockToken } from "../typegen/MockToken";
import { assetIdInput } from "../utils";

const assetId: string = TestnetData.USDT.assetId

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MockTokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet)

    const tx = await MockTokenContract.functions.symbol(assetIdInput(assetId)).simulate()
    console.log("tx", tx.value)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });