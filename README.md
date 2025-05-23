# DEX aggregation scripts & contracts

## Setup

Use `forc v66.2` or higher.

Build everything fromn scratch and run tests

```bash
pnpm i
pnpm abis # fetch external abis
pnpm build # build contracts
pnpm test:rs # Rust tests
pnpm types # generate types
pnpm test:ts # TypeScript tests
```

Sometimes one needs to enable permissions for the sh file:

```bash
chmod +x ./tools/fetch_abis.sh
./tools/fetch_abis.sh
```


## Contents

### 1delta orders

Off-chain order settlement contract.
Can be used for RFQ and standard limit orders.

### Batch swap scripts

Execute complex exact input and exact output batch swaps.

- Allow for multi path, e.g. [a-b-c]; [a-c]
- Allow for multi-segment, e.g. [a-c]; [a-b-c]; [c-d]
- Allow for reverted multi segment, e.g. [a-b]; [b-c]; [b-d-c];

Swap multiple paths and path-fragments dynamically across multiple DEXs. Currenly we integrate the following DEXs:
- Mira V1 Volatile
- Mira V1 Stable
- 1delta Orders

### Beacon proxy accounts

A beacon smart contract manages the implementation for identical deployments of account smart contracts. The contract-based acconts are needed to interact with lending protocols in a modular way, allowing for looping positions for leverage.

#### Architecture

- The beacon provides the implementation for the proxies as a read function.
- The beacon is owned and managed.
- Proxy accounts need to be deployed separately and are activated by registering it with a SRC12 style contract factory.
- Accounts implement a `compose` function, an explicit batch function that allows to loop lending positions correctly.
- The factory istlef unlocks the `compose` function of an account for an `owner` by registering the `owner` for a account proxy contract
- On registering an account, a user can also directly execute an operation.