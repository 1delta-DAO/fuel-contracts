import { BigNumberish, CoinQuantity, Provider, Wallet } from "fuels";
import { MainnetData } from "../../contexts";
import { MNEMONIC, PRIVATE_KEY } from "../../../env";
import {  OrderInput } from "../../typegen/OneDeltaOrders";
import { getSwapExactInScope } from "../calldata";
import { BatchSwapStepInput } from "../../typegen/BatchSwapExactInScript";
import { addressInput, prepareRequest } from "../../utils";
import { OrderTestUtils } from "../../../test/utils";

const maker_asset = MainnetData.USDT.address
const taker_asset = MainnetData.USDC.address
const maker_amount = 1_000
const taker_amount = 1_000

async function main() {
    const provider = await Provider.create(MainnetData.RPC);

    const maker = Wallet.fromPrivateKey(PRIVATE_KEY!, provider);
    const taker = Wallet.fromMnemonic(MNEMONIC!, undefined, undefined, provider);

    const order: OrderInput = {
        maker_asset,
        taker_asset,
        maker_amount,
        taker_amount,
        expiry: 999999999,
        nonce: 1,
        maker: maker.address.toB256()

    }
    const signature = await maker.signMessage(OrderTestUtils.packOrder(order, MainnetData.one_delta_orders))

    const step = OrderTestUtils.createRfqBatchSwapStep(
        order,
        signature,
        addressInput(taker.address)
    )
    const path: [BigNumberish, BigNumberish, boolean, BatchSwapStepInput[]][] = [
        [
            taker_amount, maker_amount - 1, true, [
                step
            ]
        ],
    ]
    const eiScope =await getSwapExactInScope(path, 999999999)

    const inputAssets: CoinQuantity[] = [
        {
            assetId: taker_asset,
            amount: order.taker_amount as any,
        }
    ];
    try {
        console.log("prepare request")
        const finalRequest = await prepareRequest(
            taker,
            eiScope,
            1,
            inputAssets,
            [MainnetData.one_delta_orders]
        )

        console.log("swap request", finalRequest)
        const tx = await taker.simulateTransaction(finalRequest, { estimateTxDependencies: true })
        // await tx.waitForResult()
        console.log("completed")
    } catch (e: any) {
        console.log(e?.metadata?.receipts)
        console.log(e?.metadata?.logs)
        throw e;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });