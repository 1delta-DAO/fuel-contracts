import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput, contractIdInput } from '../ts-scripts/utils';
import { OrderInput } from '../ts-scripts/typegen/OneDeltaOrders';
import { OrderTestUtils } from './utils';
import { ZeroBytes32 } from 'fuels';
import { AccountFactoryFactory } from '../ts-scripts/typegen';
import { AccountProxyFactory } from '../ts-scripts/typegen/AccountProxyFactory';

describe('factory creations', async () => {

  test('different roots for same contract with different configurables', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const factoryTx = await AccountFactoryFactory.deploy(deployer, {
      configurableConstants: {
        TEMPLATE_BYTECODE_ROOT: deployer.address.b256Address,
        BEACON_ADDRESS: deployer.address.b256Address,
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
});
