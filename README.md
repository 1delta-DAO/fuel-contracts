# DEX aggregation scripts & contracts

## Setup

Use `forc v66.2` or higher.

Build everything fromn scratch and run tests

```bash
pnpm i
pnpm abis # fetch external abis
pnpm build # build contract
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