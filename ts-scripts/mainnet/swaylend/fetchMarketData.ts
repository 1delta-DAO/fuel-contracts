import { AssetId, Contract, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import SWAYLEND_ABI from "../../../fixtures/swaylend/market-abi.json";
import { IdentityInput } from "../../typegen/BatchSwapExactInScript";
import { writeFileSync } from "fs";

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const swaylend = new Contract(MainnetData.SWAYLEND_USDC_MARKET_PROXY, SWAYLEND_ABI, provider)

    const { value: collateralConfigurations } = await swaylend.functions.get_collateral_configurations().get()
    const { value: marketConfiguration } = await swaylend.functions.get_market_configuration().get()
    const { value: marketConfigurationWithInterest } = await swaylend.functions.get_market_basics_with_interest().get()
    const { value: reserves } = await swaylend.functions.get_reserves().get()

    const assetId: AssetId = { bits: MainnetData.ETH.address }
    const { value: collateralReserves } = await swaylend.functions.get_collateral_reserves(assetId).get()
    const { value: balanceOf } = await swaylend.functions.balance_of(assetId).get()

    const identity: IdentityInput = { Address: { bits: "0x80Ea2b1812bE28BF7Cf8cDf95438A964DE549DF9EfEC24509482A5C7Be55DE7B" } }
    const { value: userBasic } = await swaylend.functions.get_user_basic(identity).get()
    const { value: userBasicWithInterest } = await swaylend.functions.get_user_balance_with_interest(identity).get()


    console.log("fetched data:")
    console.log("collateralConfigurations:", collateralConfigurations)
    console.log("marketConfiguration:", marketConfiguration)
    console.log("marketConfigurationWithInterest:", marketConfigurationWithInterest)
    console.log("reserves:", reserves)
    console.log("collateralReserves:", collateralReserves)
    console.log("balanceOf ETH:", balanceOf)
    console.log("userBasic:", userBasic)
    console.log("userBasicWithInterest:", userBasicWithInterest)

    const result = {
        collateralConfigurations,
        marketConfiguration,
        marketConfigurationWithInterest,
        reserves,
        collateralReserves,
        balanceOf,
        userBasic,
        userBasicWithInterest,
    }

    writeFileSync("swaylend_data.json", JSON.stringify(result, null, 2))
    console.log("Data written to swaylend_data.json")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });