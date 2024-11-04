import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../env";
import { TestnetData } from "../contexts";
import { MockToken } from "../typegen/MockToken";
import { contractIdInput } from "../utils";

const assetId: string = ""
const amount = "1"

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MockTokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet)

    const tx = await MockTokenContract.functions.mint_tokens(contractIdInput(assetId), amount).call()
    await tx.waitForResult()
    console.log("assetId", assetId)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });