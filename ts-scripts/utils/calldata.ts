import { Interface, Wallet } from "fuels";
import { MockProvider } from "./provider";
import { BatchSwapExactInScriptLoader } from "../sway_abis";
import SCRIPT_ABI from "../../scripts/batch_swap_exact_in_script/out/batch_swap_exact_in_script-loader-abi.json"
import {  MockToken } from "../typegen";
import { TestnetData } from "../contexts";
import { txParams } from "./constants";
import { assetIdInput } from "../utils";


export async function getSwapExactInScriptCall(path: any, deadline: any) {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const SwapExactInScript = new BatchSwapExactInScriptLoader(wallet0)
    SwapExactInScript.setConfigurableConstants({ MIRA_AMM_CONTRACT_ID: { bits: TestnetData.MIRA_AMM } })

    const abiInterface = new Interface(SCRIPT_ABI)

    const invocationScope = SwapExactInScript.functions.main([], 0);
    const functionName = "main"

    const frag = abiInterface.getFunction(functionName).encodeArguments([path, deadline])

    // Create the transaction request, this can be picked off the invocation
    // scope so the script bytecode is preset on the transaction
    const request = await invocationScope
        .txParams(txParams)
        .getTransactionRequest();

    request.scriptData = frag;
    // console.log(miraAmm)
    // request.addContractInputAndOutput(miraAmm)
    return request
}

export async function getMintCall(assetId: string, amount: string) {
    const wallet0 = Wallet.fromPrivateKey("0x001", MockProvider as any)

    const MockTokenContract = new MockToken(TestnetData.MOCK_TOKEN, wallet0)

    const request = await MockTokenContract
        .functions.mint_tokens(assetIdInput(assetId), amount)
        .setArguments(assetIdInput(assetId), amount)
        .addContracts([MockTokenContract])
        .txParams(txParams)
        // .addTransfer({})
        .getTransactionRequest();

    return request

} 