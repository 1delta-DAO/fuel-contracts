import { DexProtocol } from "@1delta/pool-sdk"
import { BigNumberish, Bytes, CoinQuantityLike } from "fuels"

interface TokenWithAddress {
    address: string
}

export interface GenericFuelPoolInRoute {
    protocol: DexProtocol
    tokenIn: TokenWithAddress
    tokenOut: TokenWithAddress
    tradeIdentifier: string[]
    amountIn: string
    amountOut: string
}

export type Enum<T> = {
    [K in keyof T]: Pick<T, K> & { [P in Exclude<keyof T, K>]?: never };
}[keyof T];

export type ContractIdInput = { bits: string };
export type ContractIdOutput = ContractIdInput;

export type IdentityInput = Enum<{ Address: AddressInput, ContractId: ContractIdInput }>;
export type IdentityOutput = Enum<{ Address: AddressOutput, ContractId: ContractIdOutput }>;
export type AddressInput = { bits: string };
export type AddressOutput = AddressInput;
export type AssetIdInput = { bits: string };
export type AssetIdOutput = AssetIdInput;
export type BatchSwapStepInput = { dex_id: BigNumberish, asset_in: AssetIdInput, asset_out: AssetIdInput, receiver: IdentityInput, data: Bytes };

export type SimpleRoute = GenericFuelPoolInRoute[]


export interface FuelCallParameters {
    params: Uint8Array,
    inputAssets: CoinQuantityLike[],
    variableOutputs: number
    inputContracts: string[]
}