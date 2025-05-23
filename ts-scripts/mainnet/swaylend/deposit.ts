import { AssetId, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { Market } from "../../typegen/Market";
import { PriceDataUpdateInput } from "../../typegen/Market";

const maker_asset: AssetId = { bits: MainnetData.USDT.address }
const deposit_amount = 1_500_000
const withdraw_amount =1_000_000

async function main() {
    const provider = new Provider(MainnetData.RPC)

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log("wallet", wallet.address.toB256())
    const market = new Market(MainnetData.SWAYLEND_USDC_MARKET_PROXY, wallet)

    await market.functions.supply_collateral()
        .callParams({ forward: { assetId: maker_asset.bits, amount: deposit_amount.toString() } })
        .call()

    console.log("deposit")

    const priceUpdateData: PriceDataUpdateInput = {
        update_fee: 1,
        publish_times: [],
        price_feed_ids: [],
        update_data: [],
    }

    const res = await market.functions.withdraw_collateral(maker_asset, withdraw_amount, priceUpdateData)
        .call()

    console.log("withdraw")
    console.log(res)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });