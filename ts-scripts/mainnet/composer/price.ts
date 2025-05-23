import { HermesClient } from '@pythnetwork/hermes-client';
import { arrayify, Contract, DateTime } from 'fuels';
import { PriceDataUpdateInput } from '../../typegen/ComposerScript';

export async function getPrice(
  marketContract: Contract,
) {
    if (!marketContract || !marketContract) return null;

    const priceFeedIdToAssetId: Map<string, string> = new Map();

    const { value: collateralConfigurations } = await marketContract.functions.get_collateral_configurations().get()
    const { value: marketConfiguration } = await marketContract.functions.get_market_configuration().get()
    
    priceFeedIdToAssetId.set(
        marketConfiguration.base_token_price_feed_id,
        marketConfiguration.base_token.bits
    );

    for (const collateralConfiguration of collateralConfigurations) {
        priceFeedIdToAssetId.set((collateralConfiguration as any).price_feed_id, (collateralConfiguration as any).asset_id.bits);
    }

    const hermesClient = new HermesClient(process.env.NEXT_PUBLIC_HERMES_API ?? 'https://hermes.pyth.network', {
        httpRetries: 1,
        timeout: 3000,
    });

    const priceFeedIds = Array.from(priceFeedIdToAssetId.keys());

    // Fetch price updates from Hermes client
    let priceUpdates;
    try {
        priceUpdates = await hermesClient.getLatestPriceUpdates(priceFeedIds);
    } catch (error) {
        const client = new HermesClient('https://hermes.pyth.network');
        priceUpdates = await client.getLatestPriceUpdates(priceFeedIds);
    }

    if (!priceUpdates || !priceUpdates.parsed || priceUpdates.parsed.length === 0) {
        throw new Error('Failed to fetch price');
    }

    const buffer = Buffer.from(priceUpdates.binary.data[0], 'hex');
    const updateData = [arrayify(buffer)];

    const { value: fee } = await marketContract.functions
        .update_fee(updateData)
        .get();

    // Prepare the PriceDateUpdateInput object
    const priceUpdateData: PriceDataUpdateInput = {
        update_fee: fee,
        publish_times: priceUpdates.parsed.map((parsedPrice) =>
            DateTime.fromUnixSeconds(parsedPrice.price.publish_time).toTai64()
        ),
        price_feed_ids: priceFeedIds,
        update_data: updateData,
    };

    // Format prices to bigint
    const prices = Object.fromEntries(
        priceUpdates.parsed.map((parsedPrice) => {
            const price = BigInt(parsedPrice.price.price);
            const expo = BigInt(parsedPrice.price.expo);
            const multiplier = 10n ** (expo < 0n ? -expo : expo);
            return [
                priceFeedIdToAssetId.get(`0x${parsedPrice.id}`)!,
                expo < 0n ? price / multiplier : price * multiplier
            ];
        })
    );

    // Format confidence intervals to bigint
    const confidenceIntervals = Object.fromEntries(
        priceUpdates.parsed.map((parsedPrice) => {
            const conf = BigInt(parsedPrice.price.conf);
            const expo = BigInt(parsedPrice.price.expo);
            const multiplier = 10n ** (expo < 0n ? -expo : expo);
            return [
                priceFeedIdToAssetId.get(`0x${parsedPrice.id}`)!,
                expo < 0n ? conf / multiplier : conf * multiplier
            ];
        })
    );

    return {
        prices,
        confidenceIntervals,
        priceUpdateData,
    };
}