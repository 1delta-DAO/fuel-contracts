import { TradeType } from "@1delta/base-sdk"
import { transformRoutesToTrade } from "@1delta/calldata-sdk"

export const TRADE = (
    amountIn0: bigint,
    amountIn1: bigint,
    amountOut0: bigint,
    amountOut1: bigint,
    tradeType: TradeType
) => {
    const route = [
        [
            {
                "type": "off-chain-quote-pool",
                "address": "0xeb4287b73f6f3374760be1389a5cf8868e607b2e4de90da6bfa9135c76974f61",
                "tokenIn": {
                    "chainId": -1,
                    "decimals": "9",
                    "address": "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07",
                    "symbol": "ETH"
                },
                "tokenOut": {
                    "chainId": -1,
                    "decimals": "6",
                    "address": "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b",
                    "symbol": "USDC"
                },
                "tradeIdentifier": [
                    "0",
                    "30",
                    "0"
                ],
                "protocol": "MIRA_VOLATILE",
                "amountIn": amountIn0.toString()
            },
            {
                "type": "off-chain-quote-pool",
                "address": "0x5a5d495efc4a4a3bf2f0fda8ceb5453cf4630a407430df1c548d213dc58f31d1",
                "tokenIn": {
                    "chainId": -1,
                    "decimals": "6",
                    "address": "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b",
                    "symbol": "USDC"
                },
                "tokenOut": {
                    "chainId": -1,
                    "decimals": "6",
                    "address": "0xa0265fb5c32f6e8db3197af3c7eb05c48ae373605b8165b6f4a51c5b0ba4812e",
                    "symbol": "USDT"
                },
                "tradeIdentifier": [
                    "0",
                    "5",
                    "1"
                ],
                "protocol": "MIRA_STABLE",
                "amountOut": amountOut0.toString()
            }
        ],
        [
            {
                "type": "off-chain-quote-pool",
                "address": "0x8236b995100eae8fe06100f78cd7349d2ed5fbdd35c7a51de2a15f70f661949f",
                "tokenIn": {
                    "chainId": -1,
                    "decimals": "9",
                    "address": "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07",
                    "symbol": "ETH"
                },
                "tokenOut": {
                    "chainId": -1,
                    "decimals": "6",
                    "address": "0xa0265fb5c32f6e8db3197af3c7eb05c48ae373605b8165b6f4a51c5b0ba4812e",
                    "symbol": "USDT"
                },
                "tradeIdentifier": [
                    "0",
                    "30",
                    "0"
                ],
                "protocol": "MIRA_VOLATILE",
                "amountIn": amountIn1.toString(),
                "amountOut": amountOut1.toString()
            }
        ]
    ]
    const rawTrade = {
        "blockNumber": "5982840",
        "amount": tradeType === TradeType.EXACT_INPUT ?
            (amountIn0 + amountIn1).toString() :
            (amountOut0 + amountOut1).toString(),
        "amountDecimals": "10",
        "quote": "28232018818",
        "quoteDecimals": "28232.018818",
        "quoteGasAdjusted": "28232018818",
        "quoteGasAdjustedDecimals": "28232.018818",
        "gasPriceWei": "0",
        route
    }
    const args = {
        amount: (amountIn0 + amountIn1).toString(), // 1 ETH
        tokenInAddress: "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07",
        tokenInChainId: -1,
        tokenInDecimals: 9,
        tokenInSymbol: "ETH",
        tokenOutAddress: "0xa0265fb5c32f6e8db3197af3c7eb05c48ae373605b8165b6f4a51c5b0ba4812e",
        tokenOutChainId: -1,
        tokenOutDecimals: 6,
        tokenOutSymbol: "USDT",
        routerPreference: "none",
        tradeType,
        flashSwap: false
    }
    return transformRoutesToTrade(args, rawTrade as any).trade!

}