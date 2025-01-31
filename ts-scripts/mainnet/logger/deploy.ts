import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { LoggerFactory } from "../../typegen/LoggerFactory";

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);

    const Logger = await LoggerFactory.deploy(wallet)

    const LoggerAddress = Logger.contractId
    console.log(LoggerAddress)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// latest deployoment: 0x60caa3fe777329cd32a66a4c7ac5840e4eb10441a1f8331cd00d45fb0341a7a6