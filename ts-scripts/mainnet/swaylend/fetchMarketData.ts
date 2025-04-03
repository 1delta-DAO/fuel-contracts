import { Contract, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import SWAYLEND_ABI from "../../../fixtures/swaylend/market-abi.json";

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const swaylend = new Contract(MainnetData.SWAYLEND_USDC_MARKET_PROXY, SWAYLEND_ABI, provider)

    const { value: collateralConfigurations } = await swaylend.functions.get_collateral_configurations().get()
    const { value: marketConfiguration } = await swaylend.functions.get_market_configuration().get()
    
    console.log("fetched data:")
    console.log("collateralConfigurations:", collateralConfigurations)
    console.log("marketConfiguration:", marketConfiguration)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });