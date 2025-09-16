import { Provider, Wallet } from "fuels";
import { MainnetData, TestnetData } from "./contexts";
import { MNEMONIC, PRIVATE_KEY } from "../env";


import { buildPoolId, MiraAmm } from "mira-dex-ts"
const txParams = {
  gasLimit: 999_999,
  maxFee: 999_999,
};

async function main() {
    const provider = new Provider(MainnetData.RPC);

    const wallet = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    console.log("address", wallet.address)
    const mira = new MiraAmm(wallet, "0x7c293b054938bedca41354203be4c08aec2c3466412cac803f4ad62abf22e476")
console.log(await wallet.getBalances())
    const t0 = "0x5505d0f58bea82a052bc51d2f67ab82e9735f0a98ca5d064ecb964b8fd30c474"
    const t1 = "0x1d5d97005e41cae2187a895fd8eab0506111e0e2f3331cd3912c15c24e3c1d82"

    const p = buildPoolId(t1, t0, true)
   
    const am = 2000_000_000_000
    // const am = 1_000_000_000
   const x =await mira.addLiquidity(p,
        am,
        am,
        am * 99 / 100,
        am * 99 / 100,
        1000000000,
        txParams
    ).then(async a=> await wallet.sendTransaction(a))
    console.log(x)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });