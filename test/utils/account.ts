import { WalletUnlocked } from "fuels"
import { Beacon } from "../../ts-scripts/typegen/Beacon"
import { AccountLogic } from "../../ts-scripts/typegen/AccountLogic"
import { AccountLogicFactory } from "../../ts-scripts/typegen/AccountLogicFactory"
import { AccountFactory } from "../../ts-scripts/typegen/AccountFactory"
import { AccountFactoryFactory } from "../../ts-scripts/typegen/AccountFactoryFactory"
import { BeaconFactory } from "../../ts-scripts/typegen/BeaconFactory"
import { AccountProxyFactory } from "../../ts-scripts/typegen/AccountProxyFactory"
import { addressInput, contractIdInput } from "../../ts-scripts/utils"

export namespace AccountTestUtils {
    export function getBeacon(signer: WalletUnlocked, addr: string) {
        return new Beacon(addr, signer)
    }

    export function getAccount(signer: WalletUnlocked, addr: string) {
        return new AccountLogic(addr, signer)
    }

    export function getFactory(signer: WalletUnlocked, addr: string) {
        return new AccountFactory(addr, signer)
    }


    export async function deployFactory(deployer: WalletUnlocked, ACCOUNT_BYTECODE_ROOT: string) {
        const factoryTx = await AccountFactoryFactory.deploy(deployer, {
            configurableConstants: {
                ACCOUNT_BYTECODE_ROOT,
            }
        })
        const { contract: factory } = await factoryTx.waitForResult()
        return factory;
    }

    export async function deployBeacon(deployer: WalletUnlocked) {
        let beaconTx = await BeaconFactory.deploy(deployer)

        const { contract: beacon } = await beaconTx.waitForResult()
        return beacon;
    }

    export async function deployAccount(deployer: WalletUnlocked, BEACON: string) {
        let templatAccountTx = await AccountProxyFactory.deploy(deployer, {
            configurableConstants: {
                BEACON
            }
        })
        const { contract: accountTemplate } = await templatAccountTx.waitForResult()
        return accountTemplate
    }


    export async function deployAccountAndRegister(deployer: WalletUnlocked, BEACON: string, factory: string) {
        let templatAccountTx = await AccountProxyFactory.deploy(deployer, {
            configurableConstants: {
                BEACON
            }
        })
        const { contract: accountTemplate } = await templatAccountTx.waitForResult()

        await getFactory(deployer, factory).functions
            .register_and_call(
                contractIdInput(accountTemplate.id).ContractId!,
                addressInput(deployer.address)
            )
            .call()

        return accountTemplate
    }


    export async function deployAccountLogic(deployer: WalletUnlocked, FACTORY_ID: string) {
        let logicTx = await AccountLogicFactory.deploy(deployer, {
            configurableConstants: {
                FACTORY_ID
            }
        })
        const { contract: logic } = await logicTx.waitForResult()
        return logic
    }
}