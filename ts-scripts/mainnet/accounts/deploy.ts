import { Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { PRIVATE_KEY } from "../../../env";
import { addressInput, contractIdInput } from "../../utils";
import { MockBrFactory } from "../../typegen";
import { BeaconFactory } from "../../typegen/BeaconFactory";
import { AccountFactoryFactory } from "../../typegen/AccountFactoryFactory";
import { AccountProxyFactory } from "../../typegen/AccountProxyFactory";
import { AccountLogicFactory } from "../../typegen/AccountLogicFactory";

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);

    const brReaderTx = await MockBrFactory.deploy(wallet)
    const { contract: brReader } = await brReaderTx.waitForResult()


    console.log(`"brReader": "${brReader.id.b256Address}"`)

    let beaconTx = await BeaconFactory.deploy(wallet)

    const { contract: beacon } = await beaconTx.waitForResult()
    console.log(`"beacon": "${beacon.id.b256Address}"`)


    let firstAccountTx = await AccountProxyFactory.deploy(wallet, {
        configurableConstants: {
            BEACON: beacon.id.b256Address
        }
    })

    const { contract: firstAccount } = await firstAccountTx.waitForResult()

    const brRootResult = await brReader.functions
        .get_bytecode_root(contractIdInput(firstAccount.id).ContractId!)
        .simulate()

    const brRoot = brRootResult.value

    console.log(`"brRoot": "${brRoot}"`)

    let factoryTx = await AccountFactoryFactory.deploy(wallet, {
        configurableConstants: {
            ACCOUNT_BYTECODE_ROOT: brRoot,
        }
    })

    const { contract: factory } = await factoryTx.waitForResult()

    console.log(`"factory": "${factory.id.b256Address}"`)

    let logicTx = await AccountLogicFactory.deploy(wallet, {
        configurableConstants: {
            FACTORY_ID: factory.id.b256Address
        }
    })
    const { contract: logic } = await logicTx.waitForResult()
    console.log(`"logic": "${logic.id.b256Address}"`)

    // initialize
    await beacon.functions
    .initialize(addressInput(wallet.address))
    .call()

    // set implementation
    await beacon.functions
    .set_beacon_target(contractIdInput(logic.id).ContractId!)
    .call()

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });