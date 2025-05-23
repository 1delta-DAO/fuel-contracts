import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { AccountLens, AccountLensFactory } from "../../typegen";
import { ACCOUNT_ADDRESSES } from "./addresses";
import { addressInput } from "../../utils";

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);

    // const accountLensTx = await AccountLensFactory.deploy(wallet)
    // const { contract: accountLens } = await accountLensTx.waitForResult()

    // console.log(`"accountLens": "${accountLens.id.b256Address}"`)

    const lens = new AccountLens(ACCOUNT_ADDRESSES.lens, wallet)

    const data = await lens.functions.get_account_data(
        addressInput(wallet.address.b256Address),
        ACCOUNT_ADDRESSES.factory,
        "0x657ab45a6eb98a4893a99fd104347179151e8b3828fd8f2a108cc09770d1ebae",
        0,
        10
    ).simulate()

    console.log("data", data.value)
    console.log(data.value[0][1])

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });