import { AbstractAddress, Account, Address, arrayify, AssetId, BN, CoinQuantityLike, concat, ScriptTransactionRequest, sha256, Wallet } from "fuels";
import { AssetIdInput, ContractIdInput, IdentityInput } from "./typegen/BatchSwapExactInScript";

export function contractIdInput(contractId: string): ContractIdInput {
  return { bits: contractId };
}

export function addressInput(address: string | AbstractAddress): IdentityInput {
  return { Address: { bits: Address.fromAddressOrString(address).toB256() } };
}

export function assetInput(asset: AssetId): AssetIdInput {
  return asset;
}

export function getAssetId(contractId: string, subId: string): AssetId {
  const contractIdBytes = arrayify(contractId);
  const subIdBytes = arrayify(subId);
  const assetId = sha256(concat([contractIdBytes, subIdBytes]));
  return { 'bits': assetId };
}

export type PoolId = [AssetId, AssetId, boolean];

export function getLPAssetId(contractId: string, poolId: PoolId): AssetId {
  const poolSubId = sha256(concat([arrayify(poolId[0].bits), arrayify(poolId[1].bits), poolId[2] ? Uint8Array.of(1) : Uint8Array.of(0)]));
  return getAssetId(contractId, poolSubId);
}

export async function fundRequest(wallet: Account, request: ScriptTransactionRequest): Promise<ScriptTransactionRequest> {
  const gasCost = await wallet.getTransactionCost(request);
  console.log("gasCost", gasCost)
  return wallet.fund(request, gasCost);
}

export async function prepareRequest(
  account: Account,
  request: ScriptTransactionRequest,
  variableOutputs: number = 0,
  inputAssets: CoinQuantityLike[] = [],
  inputContracts: string[] = []): Promise<ScriptTransactionRequest> {
  if (variableOutputs > 0) {
    request.addVariableOutputs(variableOutputs);
  }
  request.addResources(
    await account.getResourcesToSpend(inputAssets)
  );
  const uniqueContracts = new Set(inputContracts.map(c => Address.fromAddressOrString(c)));
  for (const contract of uniqueContracts) {
    request.addContractInputAndOutput(contract);
  }
  return fundRequest(account, request);
}
