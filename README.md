# DEX aggregation scripts & contracts

## Setup:

Use `forc v66.2` or higher.

Fetch the fixtures from Mira:
```
chmod +x ./tools/fetch_abis.sh
./tools/fetch_abis.sh
```

Build contracts: `forc build`

Run tests: `cargo test` and `cargo test -- --nocapture` for tests with logs.

## Contents

### Batch swap scripts

Execute complex exact input and exact output batch swaps.

- Allow for multi path, e.g. [a-b-c]; [a-c]
- Allow for multi-segment, e.g. [a-c]; [a-b-c]; [c-d]
- Allow for reverted multi segment, e.g. [a-b]; [b-c]; [b-d-c];

Swap multiple paths and path-fragments dynamically across multiple DEXs. Currenly we integrate the following DEXs:
- Mira V1 Volatile
- Mira V1 Stable