import { launchTestNode } from 'fuels/test-utils';
import { describe, test, expect } from 'vitest';
import { addressInput, contractIdInput } from '../ts-scripts/utils';
import { randomBytes, toHex, WalletUnlocked, ZeroBytes32 } from 'fuels';
import { AccountProxyFactory } from '../ts-scripts/typegen/AccountProxyFactory';
import { AccountLogicFactory } from '../ts-scripts/typegen/AccountLogicFactory';
import { Beacon } from '../ts-scripts/typegen/Beacon';
import { AccountFactory } from '../ts-scripts/typegen/AccountFactory';
import { AccountLogic } from '../ts-scripts/typegen/AccountLogic';
import { AccountTestUtils } from './utils/account';
import { AccountProxy } from '../ts-scripts/typegen/AccountProxy';
import { MockBrFactory } from '../ts-scripts/typegen';

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

  describe('Basics: different roots for same contract with different configurables', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [maker, deployer, taker]
    } = launched;


    const bytecodeRootGetterTx = await MockBrFactory.deploy(deployer)
    const { contract: bytecodeRootGetter } = await bytecodeRootGetterTx.waitForResult()

    let templatAccountTx = await AccountProxyFactory.deploy(deployer, {
      configurableConstants: {
        BEACON: deployer.address.b256Address
      }
    })
    const { contract: account0 } = await templatAccountTx.waitForResult()


    let result = await bytecodeRootGetter.functions
      .get_bytecode_root(contractIdInput(account0.id).ContractId!).simulate()

    const firstRoot = result.value

    templatAccountTx = await AccountProxyFactory.deploy(deployer, {
      configurableConstants: {
        BEACON: maker.address.b256Address
      }
    })
    const { contract: account1 } = await templatAccountTx.waitForResult()

    result = await bytecodeRootGetter.functions
      .get_bytecode_root(contractIdInput(account1.id).ContractId!).simulate()

    const secondRoot = result.value

    test('Root is correct and dependent on configurables', async () => {
      expect(secondRoot).to.not.equal(firstRoot)
    })
  });

  describe('Beacon & Factory: Create and register', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 3 } });

    const {
      wallets: [user, deployer, beaconOwner]
    } = launched;

    let beacon = await AccountTestUtils.deployBeacon(deployer)

    const accountTemplate = await AccountTestUtils.deployAccount(deployer, beacon.id.b256Address)


    /// get bytecode root for deployment
    const bytecodeRootGetterTx = await MockBrFactory.deploy(deployer)
    const { contract: bytecodeRootGetter } = await bytecodeRootGetterTx.waitForResult()

    let result = await bytecodeRootGetter.functions
      .get_bytecode_root(contractIdInput(accountTemplate.id).ContractId!).simulate()
    const rootBytecode = result.value

    const factory = await AccountTestUtils.deployFactory(deployer, rootBytecode)

    // deploy logic
    const accountLogicTx = await AccountLogicFactory.deploy(deployer, {
      configurableConstants: {
        FACTORY_ID: factory.id.b256Address
      }
    })
    const { contract: accountLogic } = await accountLogicTx.waitForResult()

    test('Beacon: cannot set owner before initialization', async () => {
      try {
        await getBeacon(user, beacon.id.b256Address).functions
          .set_owner(addressInput(user.address)).addSigners(beaconOwner).call()

      } catch (e) {

        expect(JSON.stringify(e).includes("Not owner")).to.equal(true, "Did revert with the wrong message")
      }
    })

    await getBeacon(beaconOwner, beacon.id.b256Address).functions
      .initialize(addressInput(beaconOwner.address)).addSigners(beaconOwner).call()


    test('Beacon: can be initialized once', async () => {
      try {
        await getBeacon(beaconOwner, beacon.id.b256Address).functions
          .initialize(addressInput(beaconOwner.address)).addSigners(beaconOwner).call()

      } catch (e) {

        expect(JSON.stringify(e).includes("Already initialized")).to.equal(true, "Did revert with the wrong message")
      }
    })

    test('Beacon: has correct owner', async () => {
      const _beaconOwner = await beacon.functions.beacon_owner().simulate()
      expect(_beaconOwner.value.Address?.bits).to.equal(beaconOwner.address.b256Address)
    });

    test('Non owner cannot set new owner', async () => {
      try {
        await getBeacon(user, beacon.id.b256Address).functions
          .set_owner(addressInput(user.address)).addSigners(beaconOwner).call()

      } catch (e) {

        expect(JSON.stringify(e).includes("Not owner")).to.equal(true, "Did revert with the wrong message")
      }
    })

    test('Non owner cannot set new implementation', async () => {
      try {
        await getBeacon(user, beacon.id.b256Address).functions
          .set_beacon_target(contractIdInput(accountTemplate.id).ContractId!).addSigners(beaconOwner).call()

      } catch (e) {

        expect(JSON.stringify(e).includes("Not owner")).to.equal(true, "Did revert with the wrong message")
      }
    })

    test('Beacon owner can set new implementation', async () => {
      await getBeacon(beaconOwner, beacon.id.b256Address).functions
        .set_beacon_target(contractIdInput(accountLogic.id).ContractId!)
        .addSigners(beaconOwner)
        .call()
    });

    await getBeacon(beaconOwner, beacon.id.b256Address).functions
      .set_beacon_target(contractIdInput(accountLogic.id).ContractId!)
      .addSigners(beaconOwner)
      .call()

    await getFactory(user, factory.id.b256Address).functions
      .register_and_call(
        contractIdInput(accountTemplate.id).ContractId!,
        addressInput(user.address)
      )
      .call()

    const impl = await accountTemplate.functions.proxy_target().simulate()

    test('Beacon: has correct implementation', async () => {
      expect(impl.value.bits).to.equal(accountLogic.id.b256Address)
    });

    test('Unauthorized user cannot access owned account', async () => {
      // unauthorized beaconOwner account cannot call
      try {
        await getAccount(beaconOwner, accountTemplate.id.b256Address).functions
          .compose([])
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {

        expect(JSON.stringify(e).includes("Unauthorized")).to.equal(true, "Did revert with the wrong message")
      }
    })

    const accountsForUser = await factory.functions.get_user_contracts(addressInput(user.address), 0, 99).simulate()

    test('Correct account included in read function', async () => {
      expect(accountsForUser.value[0].bits).to.equal(accountTemplate.id.b256Address)
    })
  });


  describe('Account: Transfers', async () => {
    const launched = await launchTestNode({ walletsConfig: { count: 4 } });

    const {
      wallets: [user, otherUser, deployer, beaconOwner]
    } = launched;

    const beacon = await AccountTestUtils.deployBeacon(deployer)

    const accountTemplate = await AccountTestUtils.deployAccount(deployer, beacon.id.b256Address)

    /// get bytecode root for deployment
    const bytecodeRootGetterTx = await MockBrFactory.deploy(deployer)
    const { contract: bytecodeRootGetter } = await bytecodeRootGetterTx.waitForResult()

    const result = await bytecodeRootGetter.functions.get_bytecode_root(contractIdInput(accountTemplate.id).ContractId!).simulate()
    const factory = await AccountTestUtils.deployFactory(deployer, result.value)

    // deploy logic
    const accountLogic = await AccountTestUtils.deployAccountLogic(deployer, factory.id.b256Address)

    // set beacon logic
    await getBeacon(beaconOwner, beacon.id.b256Address).functions.initialize(addressInput(beaconOwner.address)).addSigners(beaconOwner).call()


    await getBeacon(beaconOwner, beacon.id.b256Address).functions
      .set_beacon_target(contractIdInput(accountLogic.id).ContractId!)
      .addSigners(beaconOwner)
      .call()

    // create 2 accounts for `user`
    const account0 = await AccountTestUtils.deployAccountAndRegister(user, beacon.id.b256Address, factory.id.b256Address)
    const account1 = await AccountTestUtils.deployAccountAndRegister(user, beacon.id.b256Address, factory.id.b256Address)

    // transfer one to `otherUser`
    await AccountTestUtils.getFactory(user, factory.id.b256Address).functions
      .transfer_ownership(contractIdInput(account1.id).ContractId!, addressInput(otherUser.address))
      .call()


    test('Old owner cannot call account after transfer', async () => {
      // the original owner cannot access the transferred one
      try {
        await getAccount(user, account1.id.b256Address).functions
          .compose([])
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {
        expect(JSON.stringify(e).includes("Unauthorized")).to.equal(true, "Did revert with the wrong message")
      }
    })


    test('New owner can call account received', async () => {
      // the new owner CAN access the transferred one
      await getAccount(otherUser, account1.id.b256Address).functions
        .compose([])
        .call()
    });


    const accountsForUserBeforeTransfer = (await factory.functions.get_user_contracts(addressInput(user.address), 0, 99).simulate()).value


    test('Correct accounts listed after simple transfer', async () => {
      // should have one account
      expect(accountsForUserBeforeTransfer.length).to.equal(1, "account length mismatch")
      expect(accountsForUserBeforeTransfer[0].bits).to.equal(account0.id.b256Address)
    });

    // create a series of accounts
    let accounts0: AccountProxy[] = []
    accounts0[0] = await AccountTestUtils.deployAccountAndRegister(otherUser, beacon.id.b256Address, factory.id.b256Address)
    accounts0[1] = await AccountTestUtils.deployAccountAndRegister(otherUser, beacon.id.b256Address, factory.id.b256Address)
    accounts0[2] = await AccountTestUtils.deployAccountAndRegister(otherUser, beacon.id.b256Address, factory.id.b256Address)
    accounts0[3] = await AccountTestUtils.deployAccountAndRegister(otherUser, beacon.id.b256Address, factory.id.b256Address)


    let listProvided = [
      // prior created accounts
      ...accounts0.map(a => a.id.b256Address),
      // transferre from `user`
      account1.id.b256Address
    ]

    // expect the 4 created ones and the one transferred
    const accountsForUser = (await factory.functions.get_user_contracts(addressInput(otherUser.address), 0, 99).simulate()).value

    expect(accountsForUser.length).to.equal(listProvided.length, "account length mismatch")
    // check that all account are included
    accountsForUser.forEach((acc, i) => {
      expect(listProvided.includes(acc.bits)).to.equal(true, "Not included: " + acc.bits)
    })


    await AccountTestUtils.getFactory(otherUser, factory.id.b256Address).functions
      .transfer_ownership(contractIdInput(accounts0[1].id).ContractId!, addressInput(user.address))
      .call()


    test('Correct accounts after transfer', async () => {
      // we expect the transferred one to be not included
      listProvided = listProvided.filter(a => a !== accounts0[1].id.b256Address)

      const accountsForOtherUserAfterTransfer = (await factory.functions.get_user_contracts(addressInput(otherUser.address), 0, 99).simulate()).value

      expect(accountsForOtherUserAfterTransfer.length).to.equal(listProvided.length, "account length mismatch")
      accountsForOtherUserAfterTransfer.forEach((acc, i) => {
        expect(listProvided.includes(acc.bits)).to.equal(true, "Not included: " + acc.bits)
      })
    });

    test('Cannot transfer account not owned', async () => {
      // try transfer account not owned
      try {
        await AccountTestUtils.getFactory(user, factory.id.b256Address).functions
          .transfer_ownership(contractIdInput(account1.id).ContractId!, addressInput(otherUser.address))
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {
        expect(JSON.stringify(e).includes("Not owner")).to.equal(true, "Did revert with the wrong message: " + JSON.stringify(e))
      }
    });


    test('Cannot transfer account to self', async () => {
      // try transfer account to self
      try {
        await AccountTestUtils.getFactory(user, factory.id.b256Address).functions
          .transfer_ownership(contractIdInput(account0.id).ContractId!, addressInput(user.address))
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {
        expect(JSON.stringify(e).includes("Invalid receiver")).to.equal(true, "Did revert with the wrong message")
      }
    });

    test('Cannot transfer account to zero', async () => {
      // try transfer account to zero not possible
      try {
        await AccountTestUtils.getFactory(user, factory.id.b256Address).functions
          .transfer_ownership(contractIdInput(account0.id).ContractId!, addressInput(ZeroBytes32))
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {
        expect(JSON.stringify(e).includes("Invalid receiver")).to.equal(true, "Did revert with the wrong message")
      }

    });

    test('Cannot transfer account that is not registered', async () => {
      // try transfer non registered account
      try {
        await AccountTestUtils.getFactory(user, factory.id.b256Address).functions
          .transfer_ownership(contractIdInput(toHex(randomBytes(32))).ContractId!, addressInput(ZeroBytes32))
          .call()
        expect(false).to.equal(true, "Did not revert")
      } catch (e) {
        expect(JSON.stringify(e).includes("Not registered")).to.equal(true, "Did revert with the wrong message")
      }
    });
  });
});
