import { Account, Provider, ScriptTransactionRequest, Wallet } from "fuels";
import { MNEMONIC } from "../env";
import { TestnetData } from "../contexts";
import { MockToken } from "../typegen/MockToken";

const USDT = {
    decimals: 9,
    name: 'Test_USDT',
    symbol: 'T_USDT',
    assetId: '0xd32c48692227082c03c4db7d6b51e7f25dca1d83d6f60c2992181baa4ddb09c9'
}

const USDC = {
    decimals: 9,
    name: 'Test_USDC',
    symbol: 'T_USDC',
    assetId: '0xb277fee45cb10e7eaa721d0598f83430d87f1d7c50e5d1e672f3fe1dcf32b148'
}

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const MockTokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet)

    const TokenData = await MockTokenContract.functions.add_token(USDC.name, USDC.symbol, USDC.decimals).call()
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