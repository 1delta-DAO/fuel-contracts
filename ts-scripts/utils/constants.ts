export const DEFAULT_MIRA_AMM_CONTRACT_ID =
  "0x2e40f2b244b98ed6b8204b3de0156c6961f98525c8162f80162fcf53eebd90e7";

export const txParams = {
  gasLimit: 999_999,
  maxFee: 5000,
};

export const composerTxParams = {
  gasLimit: 999_999,
  maxFee: 99_999,
};

export enum DexId {
  MiraV1 = 0,
  OneDeltaOrders = 100
}