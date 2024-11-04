import { BN, toHex } from "fuels";

export function encodeMiraParams(fee: bigint | BN, isStable: boolean) {
    if (isStable) return toHex(fee.toString(), 8) + crop(toHex("1", 1))
    else return toHex(fee.toString(), 8) + crop(toHex("0", 1))
}

function crop(hex: string) {
    return hex.replace("0x", "")
}

export const toBuffer = (hex:string) => new Uint8Array(hex.match(/../g)!.map(h=>parseInt(h,16))).buffer