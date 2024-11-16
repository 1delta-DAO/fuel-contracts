export const MockProvider = {
    operations: {
        getVersion: () => null,
        getNodeInfo: () => null,
        getChain: () => null,
        getChainAndNodeInfo: () => null,
        getTransaction: () => null,
        getTransactionWithReceipts: () => null,
        getTransactions: () => null,
        getTransactionsByOwner: () => null,
        estimatePredicates: () => null,
        getLatestBlock: () => null,
        getLatestBlockHeight: () => null,
        getBlock: () => null,
        getBlockWithTransactions: () => null,
        getBlocks: () => null,
        getCoin: () => null,
        getCoins: () => null,
        getCoinsToSpend: () => null,
        getContract: () => null,
        getContractBalance: () => null,
        getBalance: () => null,
        getLatestGasPrice: () => null,
        estimateGasPrice: () => null,
        getBalances: () => null,
        getMessages: () => null,
        getMessageProof: () => null,
        getMessageStatus: () => null,
        getRelayedTransactionStatus: () => null,
        dryRun: () => null,
        submit: () => null,
        produceBlocks: () => null,
        getMessageByNonce: () => null,
        isUserAccount: () => null,
        getConsensusParametersVersion: () => null,
        submitAndAwait: () => null,
        submitAndAwaitStatus: () => null,
        statusChange: () => null,
        getBlobs: () => null
    },
    getVersion: () => null,
    getNodeInfo: () => null,
    getChain: () => {
        return {
            name: "string",
            baseChainHeight: "999999",
            consensusParameters: null,
            latestBlock: {
                id: "string",
                height: "99999",
                time: "string",
                transactions: [],
            }
        }
    },
    getChainAndNodeInfo: () => null,
    getTransaction: () => null,
    getTransactionWithReceipts: () => null,
    getTransactions: () => null,
    getTransactionsByOwner: () => null,
    estimatePredicates: () => null,
    getLatestBlock: () => null,
    getLatestBlockHeight: () => null,
    getBlock: () => null,
    getBlockWithTransactions: () => null,
    getBlocks: () => null,
    getCoin: () => null,
    getCoins: () => null,
    getCoinsToSpend: () => null,
    getContract: () => null,
    getContractBalance: () => null,
    getBalance: () => null,
    getLatestGasPrice: () => null,
    estimateGasPrice: () => null,
    getBalances: () => null,
    getMessages: () => null,
    getMessageProof: () => null,
    getMessageStatus: () => null,
    getRelayedTransactionStatus: () => null,
    dryRun: () => null,
    submit: () => null,
    produceBlocks: () => null,
    getMessageByNonce: () => null,
    isUserAccount: () => null,
    getConsensusParametersVersion: () => null,
    submitAndAwait: () => null,
    submitAndAwaitStatus: () => null,
    statusChange: () => null,
    getBlobs: () => null,
    cache: { ttl: 20000 },
    url: 'https://testnet.fuel.network/v1/graphql',
    urlWithoutAuth: 'https://testnet.fuel.network/v1/graphql',
    consensusParametersTimestamp: 1731170371274,
    options: {
        timeout: undefined,
        resourceCacheTTL: undefined,
        fetch: undefined,
        retryOptions: undefined,
        headers: { Source: 'ts-sdk-0.96.1' }
    }
}