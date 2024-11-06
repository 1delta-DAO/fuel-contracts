import { Provider, Wallet } from "fuels";
import { MNEMONIC } from "../../env";
import { TestnetData } from "../contexts";
import { MockToken } from "../typegen";

const TOKEN_INFO = {
    decimals: 9,
    name: 'Test_ETH',
    symbol: 'T_ETH',
    assetId: '0xe059c6380d9cd768957ef9081d229e64ae641256f5ec4d98191b8b5cc9b91b72'
}

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MockTokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet)

    const TokenData = await MockTokenContract.functions.add_token(TOKEN_INFO.name, TOKEN_INFO.symbol, TOKEN_INFO.decimals).call()
    console.log("tokenData", TokenData)
    const assetId = (await TokenData.waitForResult()).value
    console.log("assetId", assetId)
}



main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });