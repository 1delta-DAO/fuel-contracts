import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput, contractIdInput } from '../ts-scripts/utils';
import { WalletUnlocked, ZeroBytes32 } from 'fuels';
import { AccountFactoryFactory } from '../ts-scripts/typegen/AccountFactoryFactory';
import { BeaconFactory } from '../ts-scripts/typegen/BeaconFactory';
import { AccountProxyFactory } from '../ts-scripts/typegen/AccountProxyFactory';
import { AccountLogicFactory } from '../ts-scripts/typegen/AccountLogicFactory';
import { Beacon } from '../ts-scripts/typegen/Beacon';
import { AccountFactory } from '../ts-scripts/typegen/AccountFactory';
import { AccountLogic } from '../ts-scripts/typegen/AccountLogic';


export function getBeacon(signer: WalletUnlocked, addr: string) {
  return new Beacon(addr, signer)
}

export function getAccount(signer: WalletUnlocked, addr: string) {
  return new AccountLogic(addr, signer)
}

export function getFactory(signer: WalletUnlocked, addr: string) {
  return new AccountFactory(addr, signer)
}

describe('factory creations', async () => {

  test('different roots for same contract with different configurables', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const factoryTx = await AccountFactoryFactory.deploy(deployer, {
      configurableConstants: {
        TEMPLATE_BYTECODE_ROOT: deployer.address.b256Address,
      }
    })
    const { contract: factory } = await factoryTx.waitForResult()

    let templatAccountTx = await AccountProxyFactory.deploy(deployer, {
      configurableConstants: {
        BEACON: deployer.address.b256Address
      }
    })
    const { contract: account0 } = await templatAccountTx.waitForResult()

    // @ts-ignore
    let result = await factory.functions.bytecode_root(contractIdInput(account0.id).ContractId).simulate()


    const firstRoot = result.value
    console.log("firstRoot", firstRoot)

    templatAccountTx = await AccountProxyFactory.deploy(deployer, {
      configurableConstants: {
        BEACON: maker.address.b256Address
      }
    })
    const { contract: account1 } = await templatAccountTx.waitForResult()

    // @ts-ignore
    result = await factory.functions.bytecode_root(contractIdInput(account1.id).ContractId).simulate()


    const secondRoot = result.value
    console.log("secondRoot", secondRoot)

    expect(secondRoot).to.not.equal(firstRoot)
  });

  test.only('Create and register', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [user, deployer, owner]
    } = launched;

    let beaconTx = await BeaconFactory.deploy(deployer)

    const { contract: beacon } = await beaconTx.waitForResult()

    let templatAccountTx = await AccountProxyFactory.deploy(deployer, {
      configurableConstants: {
        BEACON: beacon.id.b256Address
      }
    })
    const { contract: accountTemplate } = await templatAccountTx.waitForResult()


    const fakeFactoryTx = await AccountFactoryFactory.deploy(deployer, {
      configurableConstants: {
        TEMPLATE_BYTECODE_ROOT: deployer.address.b256Address,
      }
    })
    const { contract: fakeFactory } = await fakeFactoryTx.waitForResult()

    // @ts-ignore
    let result = await fakeFactory.functions.bytecode_root(contractIdInput(accountTemplate.id).ContractId).simulate()


    const rootBytecode = result.value
    console.log("rootBytecode", rootBytecode)

    const factoryTx = await AccountFactoryFactory.deploy(deployer, {
      configurableConstants: {
        TEMPLATE_BYTECODE_ROOT: rootBytecode,
      }
    })


    const { contract: factory } = await factoryTx.waitForResult()

    console.log("factory", factory.id)

    // deploy logic
    const accountLogicTx = await AccountLogicFactory.deploy(deployer, {
      configurableConstants: {
        FACTORY_ID: factory.id.b256Address
      }
    })
    const { contract: accountLogic } = await accountLogicTx.waitForResult()

    await getBeacon(owner, beacon.id.b256Address).functions.initialize(addressInput(owner.address)).addSigners(owner).call()

    const beaconOwner = await beacon.functions.beacon_owner().simulate()

    console.log("beaconOwner", beaconOwner.value)

    await getBeacon(owner, beacon.id.b256Address).functions
      .set_beacon_target(contractIdInput(accountLogic.id).ContractId!)
      .addSigners(owner)
      .call()



    await getFactory(user, factory.id.b256Address).functions
      .register_and_call(
        contractIdInput(accountTemplate.id).ContractId!,
        addressInput(user.address)
      )
      .call()

    const impl = await accountTemplate.functions.proxy_target().simulate()

    console.log("impl", impl.value)

    try {
      await getAccount(owner, accountTemplate.id.b256Address).functions
        .compose([])
        .call()
      expect(false).to.equal(true, "Did not revert")
    } catch (e) {

      expect(JSON.stringify(e).includes("Unauthorized")).to.equal(true, "Did revert with the wqrong message")
    }
  });
});
