import { BN, toHex } from "fuels";

export function encodeMiraParams(fee: bigint | BN | string, isStable: boolean) {
    let hex: string
    if (isStable) hex = toHex(fee.toString(), 2) + crop(toHex("1", 1))
    else hex = toHex(fee.toString(), 2) + crop(toHex("0", 1))
    return toU8Array(hex)
}

function crop(hex: string) {
    return hex.replace("0x", "")
}

/** Convert hex to u8 array */
function toU8Array(str: string) {
    let cropped = crop(str)
    if (cropped.length % 2 != 0) throw new Error("toU8Array: incorrect bytes format")
    let result: number[] = [];

    for (let i = 0; i < cropped.length; i += 2) {
        const part = cropped.slice(i, i + 2)
        result.push(Number("0x" + part));
    }

    return result;
}