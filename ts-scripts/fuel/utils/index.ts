import { Fraction, ONE, Percent } from "@1delta/base-sdk";
import { ContractIdInput, IdentityInput } from "../types";
import { AbstractAddress, Address } from "fuels";
import { MIRA_AMM_ID } from "../constants/pathConstants";
import _ from "lodash"

export function adjustOutputForSlippage(output: bigint, slippageTolerance: Percent) {
    return new Fraction(ONE)
        .add(slippageTolerance)
        .invert()
        .multiply(output).quotient
}

export function adjustInputForSlippge(input: bigint, slippageTolerance: Percent) {
    return new Fraction(ONE).add(slippageTolerance).multiply(input).quotient
}

/** get a valid assetID input from hex string */
export function assetIdInput(contractId: string): ContractIdInput {
    return { bits: contractId };
}


/** This is for EOAs as receiver addresses  */
export function addressInput(address: string | AbstractAddress): IdentityInput {
    return { Address: { bits: Address.fromAddressOrString(address).toB256() } };
}

/** This is for contracts as receiver addresses  */
export function contractIdInput(contractId: string | AbstractAddress): IdentityInput {
    return { ContractId: { bits: Address.fromAddressOrString(contractId).toB256() } };
}


export function getDexReceiver(protocol: string) {
    switch (protocol) {
        case "MIRA_STABLE":
        case "MIRA_VOLATILE":
            return MIRA_AMM_ID

        default: throw new Error("Incalid DEX")
    }
}


export function getDexContracts(protocols: string[]) {
    return _.uniq(_.uniq(protocols).map((protocol:any) => {
        switch (protocol) {
            case "MIRA_STABLE":
            case "MIRA_VOLATILE":
                return MIRA_AMM_ID

            default: throw new Error("Incalid DEX")
        }
    }))
}