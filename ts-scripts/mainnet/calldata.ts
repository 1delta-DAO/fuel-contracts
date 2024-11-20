import { Contract, Wallet } from "fuels";
import { MockProvider } from "../utils/provider";
import { txParams } from "../utils/constants";
import { MainnetData } from "../contexts";
import MIRA_ABI from "../../fixtures/mira-amm/mira_amm_contract-abi.json";
import RFQ_ABI from "../../one_delta_rfq/out/release/one_delta_rfq-abi.json"
import { BatchSwapExactInScriptLoader } from "../sway_abis/BatchSwapExactInScriptLoader";
import { BatchSwapExactOutScriptLoader } from "../sway_abis/BatchSwapExactOutScriptLoader";

export async function getSwapExactInScope(path: any[] = [], deadline = 0) {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactInScriptLoader(wallet0)
    SwapExactInScript.setConfigurableConstants({
        MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID },
        ONE_DELTA_RFQ_CONTRACT_ID: { bits: MainnetData.ONE_DELTA_RFQ },
    })
    const invocationScope = SwapExactInScript.functions.main(path, deadline);
    const miraAmm = new Contract(MainnetData.MIRA_AMM_ID, MIRA_ABI, MockProvider as any)
    const rfqmm = new Contract(MainnetData.ONE_DELTA_RFQ, RFQ_ABI, MockProvider as any)

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const scope = await invocationScope
        .txParams(txParams)
        .addContracts([miraAmm, rfqmm])
        .getTransactionRequest();
    return scope
}

export async function getSwapExactOutScope() {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactOutScriptLoader(wallet0)
    SwapExactInScript.setConfigurableConstants({
        MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID },
        ONE_DELTA_RFQ_CONTRACT_ID: { bits: MainnetData.ONE_DELTA_RFQ },
    })
    const invocationScope = SwapExactInScript.functions.main([], 0);
    const miraAmm = new Contract(MainnetData.MIRA_AMM_ID, MIRA_ABI, MockProvider as any)

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const scope = await invocationScope
        .txParams(txParams)
        .addContracts([miraAmm])
        .getTransactionRequest();
    return scope

}
