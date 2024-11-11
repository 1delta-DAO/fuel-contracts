import { ChainId, Percent, TradeType } from "@1delta/base-sdk";
import { getDexId } from "@1delta/pool-sdk";
import { CoinQuantityLike, Interface } from "fuels";
import EXACT_IN_SCRIPT_ABI from "./abi/batch_swap_exact_in_script-loader-abi.json"
import EXACT_OUT_SCRIPT_ABI from "./abi/batch_swap_exact_out_script-loader-abi.json"
import { BatchSwapStepInput, FuelCallParameters, SimpleRoute } from "./types";
import { addressInput, adjustInputForSlippge, adjustOutputForSlippage, assetIdInput, contractIdInput, getDexContracts, getDexReceiver } from "./utils";
import { ScriptFunctions } from "./constants/pathConstants";


/** Encode the fuel path calldata based on a generix API response */
export function getEncodedFuelPath(routes: SimpleRoute[], tradeType: TradeType, receiver: string, slippageTolerance: Percent, deadline: number) {
    if (tradeType === TradeType.EXACT_INPUT) return getEncodedFuelPathExactIn(routes, receiver, slippageTolerance, deadline)
    else return getEncodedFuelPathExactOut(routes, receiver, slippageTolerance, deadline)
}

function getEncodedFuelPathExactIn(routes: SimpleRoute[], receiver: string, slippageTolerance: Percent, deadline: number): FuelCallParameters {

    let path = []
    let allProtocols = []
    let inputAssets = []

    for (let route of routes) {
        let pool = route[0]
        const amountIn = pool.amountIn

        const inputQuantity: CoinQuantityLike = {
            assetId: pool.tokenIn.address,
            amount: amountIn
        }

        inputAssets.push(inputQuantity)

        let steps: BatchSwapStepInput[] = []

        const length = route.length
        const lastIndex = length - 1
        for (let i = 0; i < length; i++) {

            const currentReceiver = i === lastIndex ?
                addressInput(receiver) :
                contractIdInput(getDexReceiver(route[i + 1].protocol))

            allProtocols.push(pool.protocol)

            let step: BatchSwapStepInput = {
                dex_id: getDexId(pool.protocol, ChainId.FUEL),
                asset_in: assetIdInput(pool.tokenIn.address),
                asset_out: assetIdInput(pool.tokenOut.address),
                receiver: currentReceiver,
                data: pool.tradeIdentifier.map(id => Number(id))
            }
            steps.push(step)

            // access new pool
            if (i < lastIndex) pool = route[i + 1]
        }


        const minimumOut = adjustOutputForSlippage(BigInt(pool.amountOut), slippageTolerance)

        const routeEncoded = [amountIn.toString(), minimumOut.toString(), false, steps]
        path.push(routeEncoded)
    }

    const abiInterface = new Interface(EXACT_IN_SCRIPT_ABI)

    const functionName = ScriptFunctions.Main

    return {
        params: abiInterface.getFunction(functionName).encodeArguments([path, deadline]),
        inputAssets,
        variableOutputs: routes.length,
        inputContracts: getDexContracts(allProtocols)
    }
}

function getEncodedFuelPathExactOut(routes: SimpleRoute[], receiver: string, slippageTolerance: Percent, deadline: number): FuelCallParameters {

    let path = []
    let allProtocols = []
    let inputAssets = []

    for (let route of routes) {
        const length = route.length
        const lastIndex = length - 1
        let pool = route[lastIndex]
        const amountOut = pool.amountOut

        let steps: BatchSwapStepInput[] = []

        for (let i = lastIndex; i > -1; i--) {

            const currentReceiver = i === lastIndex ?
                addressInput(receiver) :
                contractIdInput(getDexReceiver(route[i].protocol))

            allProtocols.push(pool.protocol)

            let step: BatchSwapStepInput = {
                dex_id: getDexId(pool.protocol, ChainId.FUEL),
                asset_in: assetIdInput(pool.tokenIn.address),
                asset_out: assetIdInput(pool.tokenOut.address),
                receiver: currentReceiver,
                data: pool.tradeIdentifier.map(id => Number(id))
            }
            steps.push(step)

            // access new pool
            if (i > 0) pool = route[i - 1]

        }


        const amount = BigInt(pool.amountIn)

        const maximumIn = adjustInputForSlippge(amount, slippageTolerance)

        const inputQuantity: CoinQuantityLike = {
            assetId: pool.tokenIn.address,
            max: maximumIn.toString(),
            amount: amount.toString()
        }

        inputAssets.push(inputQuantity)

        const routeEncoded = [amountOut.toString(), maximumIn.toString(), false, steps]
        path.push(routeEncoded)
    }

    const abiInterface = new Interface(EXACT_OUT_SCRIPT_ABI)

    const functionName = ScriptFunctions.Main

    return {
        params: abiInterface.getFunction(functionName).encodeArguments([path, deadline]),
        inputAssets,
        variableOutputs: routes.length,
        inputContracts: getDexContracts(allProtocols)
    }
}

