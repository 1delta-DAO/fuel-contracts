import { CoinQuantityLike, Provider, Wallet } from "fuels";
import { MNEMONIC } from "../../env";
import { TestnetData } from "../../contexts";
import { CreatePoolAndAddLiquidityScript } from "../../typegen/CreatePoolAndAddLiquidityScript";
import { addressInput, contractIdInput, getAssetId, getLPAssetId, PoolId, prepareRequest } from "../../utils";
import { MiraAmmContract } from "../../typegen/MiraAmmContract";
import { MockToken } from "../../typegen/MockToken";
import { txParams } from "../../utils/constants";

async function main() {
    const provider = await Provider.create(TestnetData.RPC);
    const wallet = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const LiqContract = new CreatePoolAndAddLiquidityScript(wallet)
    LiqContract.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })

    const miraAmm = new MiraAmmContract(TestnetData.MIRA_AMM, provider)
    const ammFees = (await miraAmm.functions.fees().get()).value
    console.log(ammFees)
    const amount = "100000000000";

    const tokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet)

    const [token0, token1] = TestnetData.USDC.assetId < TestnetData.USDT.assetId ? [
        TestnetData.USDC.assetId, TestnetData.USDT.assetId
    ] : [
        TestnetData.USDT.assetId, TestnetData.USDC.assetId
    ]

    const subId0 = (await tokenContract.functions.get_sub_id({ bits: token0 }).get()).value

    const subId1 = (await tokenContract.functions.get_sub_id({ bits: token1 }).get()).value

    console.log({ subId0, subId1 })

    const token0Asset = getAssetId(TestnetData.MOCK_TOKEN, subId0!);
    const token1Asset = getAssetId(TestnetData.MOCK_TOKEN, subId1!);
    console.log({ token0Asset, token1Asset })

    const isStable = true
    const poolId: PoolId = [token0Asset, token1Asset, isStable]
    const lpAsset = getLPAssetId(TestnetData.MIRA_AMM, poolId)
    console.log("lpAsset", lpAsset)

    const request = await LiqContract.functions.main(
        contractIdInput(TestnetData.MOCK_TOKEN),
        subId0!,
        contractIdInput(TestnetData.MOCK_TOKEN),
        subId1!,
        isStable,
        amount,
        amount,
        addressInput(wallet.address),
        99999999
    ).addContracts(
        [miraAmm]
    ).txParams(txParams).getTransactionRequest()

    const inputAssets: CoinQuantityLike[] = [
        {
            assetId: token0Asset.bits,
            amount: amount,
        },
        {
            assetId: token1Asset.bits,
            amount: amount,
        },
    ];
    try {
        const finalRequest = await prepareRequest(wallet, request, 2, inputAssets, [TestnetData.MOCK_TOKEN, TestnetData.MIRA_AMM])
        console.log("added liquidity", finalRequest)
        const tx = await wallet.sendTransaction(finalRequest, { estimateTxDependencies: true })
        await tx.waitForResult()
        console.log("completed")
    } catch (e: any) {
        console.log(e?.metadata?.receipts)
        console.log(e?.metadata?.logs)
        throw e;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });