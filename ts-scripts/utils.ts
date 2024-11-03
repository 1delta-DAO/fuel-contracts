import {AbstractAddress, Address, arrayify, AssetId, BN, concat, sha256} from "fuels";
import { AssetIdInput, ContractIdInput, IdentityInput } from "./typegen/BatchSwapExactInScript";

export function contractIdInput(contractId: string): ContractIdInput {
  return {bits: contractId};
}

export function addressInput(address: string | AbstractAddress): IdentityInput {
  return {Address: {bits: Address.fromAddressOrString(address).toB256()}};
}

export function assetInput(asset: AssetId): AssetIdInput {
  return asset;
}

export function getAssetId(contractId: string, subId: string): AssetId {
  const contractIdBytes = arrayify(contractId);
  const subIdBytes = arrayify(subId);
  const assetId = sha256(concat([contractIdBytes, subIdBytes]));
  return {'bits': assetId};
}