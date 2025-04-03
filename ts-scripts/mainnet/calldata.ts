import { BigNumberish, Contract, Interface, Wallet } from "fuels";
import { MockProvider } from "../utils/provider";
import { txParams } from "../utils/constants";
import { MainnetData } from "../contexts";
import MIRA_ABI from "../../fixtures/mira-amm/mira_amm_contract-abi.json";
import RFQ_ABI from "../../one_delta_orders/out/release/one_delta_orders-abi.json";
import SWAYLEND_ABI from "../../fixtures/swaylend/market-abi.json";
import { BatchSwapExactInScript } from "../sway_abis/scripts/BatchSwapExactInScript";
import { BatchSwapExactOutScript } from "../sway_abis/scripts/BatchSwapExactOutScript";
import { ComposerScript } from "../sway_abis/scripts/ComposerScript";
import { Vec } from "../typegen/common";
import { ActionInput } from "../typegen/ComposerScript";

export async function getComposerRequest(path: Vec<ActionInput>, deadline: BigNumberish) {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const composerScript = new ComposerScript(wallet0)
    composerScript.setConfigurableConstants({
        MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID },
        ONE_DELTA_ORDERS_CONTRACT_ID: { bits: MainnetData.one_delta_orders },
        SWAYLEND_USDC_MARKET_CONTRACT_ID: { bits: MainnetData.SWAYLEND_USDC_MARKET_PROXY }
    })
    const invocationScope = composerScript.functions.main(path, deadline);
    const miraAmm = new Contract(MainnetData.MIRA_AMM_ID, MIRA_ABI, MockProvider as any)
    const rfqmm = new Contract(MainnetData.one_delta_orders, RFQ_ABI, MockProvider as any)
    const swaylend = new Contract(MainnetData.SWAYLEND_USDC_MARKET_PROXY, SWAYLEND_ABI, MockProvider as any)

    const abiInterface = new Interface(ComposerScript.abi)
    const functionName = "main"
    const frag = abiInterface.getFunction(functionName).encodeArguments([path, deadline])

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const request = await invocationScope
        .txParams(txParams)
        .addContracts([miraAmm, rfqmm, swaylend])
        .getTransactionRequest();

    request.scriptData = frag;

    return request
}

export async function getSwapExactInScope(path: any[] = [], deadline = 0) {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactInScript(wallet0)
    SwapExactInScript.setConfigurableConstants({
        MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID },
        ONE_DELTA_ORDERS_CONTRACT_ID: { bits: MainnetData.one_delta_orders },
    })
    const invocationScope = SwapExactInScript.functions.main(path, deadline);
    const miraAmm = new Contract(MainnetData.MIRA_AMM_ID, MIRA_ABI, MockProvider as any)
    const rfqmm = new Contract(MainnetData.one_delta_orders, RFQ_ABI, MockProvider as any)

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

    const SwapExactInScript = new BatchSwapExactOutScript(wallet0)
    SwapExactInScript.setConfigurableConstants({
        MIRA_AMM_CONTRACT_ID: { bits: MainnetData.MIRA_AMM_ID },
        ONE_DELTA_ORDERS_CONTRACT_ID: { bits: MainnetData.one_delta_orders },
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
