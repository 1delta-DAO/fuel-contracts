import { Wallet } from "fuels";
import { MockProvider } from "../utils/provider";
import { BatchSwapExactInScriptLoader, BatchSwapExactOutScriptLoader } from "../sway_abis";
import { txParams } from "../utils/constants";
import { MiraAmmContract } from "../typegen";
import { MainnetData } from "../contexts";

export async function getSwapExactInScope() {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactInScriptLoader(wallet0)
    SwapExactInScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID } })
    const invocationScope = SwapExactInScript.functions.main([], 0);
    const miraAmm = new MiraAmmContract(MainnetData.MIRA_AMM_ID, MockProvider as any)

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const scope = await invocationScope
        .txParams(txParams)
        .addContracts([miraAmm])
        .getTransactionRequest();
    return scope

}


export async function getSwapExactOutScope() {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactOutScriptLoader(wallet0)
    SwapExactInScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID } })
    const invocationScope = SwapExactInScript.functions.main([], 0);
    const miraAmm = new MiraAmmContract(MainnetData.MIRA_AMM_ID, MockProvider as any)

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const scope = await invocationScope
        .txParams(txParams)
        .addContracts([miraAmm])
        .getTransactionRequest();
    return scope

}
