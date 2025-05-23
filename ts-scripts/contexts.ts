export namespace TestnetData {

    export const MIRA_ADD_LIQUIDITY_SCRIPT = "0xf81922cb5fdc213d65b4843140f635cd4d034ea384626c834cbcfec9e10ebd05"

    export const BATCH_SWAP_EXACT_IN = "0xc44cfe70ea520a251da0e5a4cfd22f3acc21c406fae15db3d2dff38c707ec5c4"

    export const MIRA_AMM = "0x8dca6db9dfaeed9825f547d2b0d609c255a0f516f806ed829474fda8d7dff969"

    export const one_delta_orders = "0x194c188af8d357171fb4ff8c113d2a260b7d0edf0b2034523e05dbfe8a66e91f"

    export const SWAYLEND_PYTH_ORACLE = "0xe31e04946c67fb41923f93d50ee7fc1c6c99d6e07c02860c6bea5f4a13919277"

    export const SWAYLEND_ETH_MARKET = "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07"

    export const RPC = "https://testnet.fuel.network/v1/graphql"

    export const MOCK_TOKEN = "0x3d8917742cf72d5b3309792f73ecb4f3a7f831c44249b88a56599e6a63a94a94"

    export const USDT = {
        decimals: 9,
        name: 'Test_USDT',
        symbol: 'T_USDT',
        assetId: '0xd32c48692227082c03c4db7d6b51e7f25dca1d83d6f60c2992181baa4ddb09c9'
    }

    export const USDC = {
        decimals: 9,
        name: 'Test_USDC',
        symbol: 'T_USDC',
        assetId: '0xb277fee45cb10e7eaa721d0598f83430d87f1d7c50e5d1e672f3fe1dcf32b148'
    }

    export const BTC = {
        decimals: 9,
        name: 'Test_BTC',
        symbol: 'T_BTC',
        assetId: '0x2fde73c2689a87fa44f2f0f23d6d110e80890ae9939938bffc0989b5b4697601'
    }

    export const ETH = {
        decimals: 9,
        name: 'Test_ETH',
        symbol: 'T_ETH',
        assetId: '0xe059c6380d9cd768957ef9081d229e64ae641256f5ec4d98191b8b5cc9b91b72'
    }

}

export namespace MainnetData {
    export const MIRA_AMM_ID = "0x2e40f2b244b98ed6b8204b3de0156c6961f98525c8162f80162fcf53eebd90e7"

    export const one_delta_orders = "0xf6caa75386fe9ba4da15b82723ecffb0d56b28ae7ece396b15c5650b605359ac"

    export const SWAYLEND_PYTH_ORACLE = "0xe31e04946c67fb41923f93d50ee7fc1c6c99d6e07c02860c6bea5f4a13919277"

    export const SWAYLEND_USDC_MARKET_PROXY = "0x657ab45a6eb98a4893a99fd104347179151e8b3828fd8f2a108cc09770d1ebae"

    export const TOKEN_GATEWAY = "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8"

    export const RPC = "https://mainnet.fuel.network/v1/graphql"

    export const USDT = {
        "chainId": 9889,
        "name": "USDT",
        "address": "0xa0265fb5c32f6e8db3197af3c7eb05c48ae373605b8165b6f4a51c5b0ba4812e",
        "symbol": "USDT",
        "decimals": 6,
        "logoURI": "https://verified-assets.fuel.network/images/usdt.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0x033dd0c9246b67aea1456ed2ea6aaac61253583b7a1c84cd73d968ad7d30b72d"
    }

    export const USDC = {
        "chainId": 9889,
        "name": "USDC",
        "address": "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b",
        "symbol": "USDC",
        "decimals": 6,
        "logoURI": "https://verified-assets.fuel.network/images/usdc.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0xb2114fe7ae91bdf9c23145ee523b2f59fdd7a3c542b93de75c9551873d429757"
    }

    export const FBTC = {
        "chainId": 9889,
        "name": "FBTC",
        "address": "0xb5ecb0a1e08e2abbabf624ffea089df933376855f468ade35c6375b00c33996a",
        "symbol": "FBTC",
        "decimals": 8,
        "logoURI": "https://verified-assets.fuel.network/images/fbtc.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0x5ecf00904c88f891048f2affb621a87c6392375fdb3c051dd7129526b4b0da55"
    }

    export const WETH = {
        "chainId": 9889,
        "name": "WETH",
        "address": "0xa38a5a8beeb08d95744bc7f58528073f4052b254def59eba20c99c202b5acaa3",
        "symbol": "WETH",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0xd4d7948d31e97d4ed6d0182814e8bc827dfe0d8e70a010bdb9e34aae92775491"
    }

    export const ETH = {
        "chainId": 9889,
        "name": "Ethereum",
        "address": "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07",
        "symbol": "ETH",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/eth.svg",
        "contractId": "",
        "subId": ""
    }

    export const ezETH = {
        "chainId": 9889,
        "name": "WEezETHTH",
        "address": "0x91b3559edb2619cde8ffb2aa7b3c3be97efd794ea46700db7092abeee62281b0",
        "symbol": "ezETH",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0x30d7a65ea7c8f934b8635cff93e9c4510ed9717fa526237ba935e7411830c153"
    }

    export const sDAI = {
        "chainId": 9889,
        "name": "sDAI",
        "address": "0x9e46f919fbf978f3cad7cd34cca982d5613af63ff8aab6c379e4faa179552958",
        "symbol": "sDAI",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0x3edc5f1ca0ef5712b655998630ae3d24382ade45735dabce3fc6a215a9dc8ab2"
    }

    export const weETH = {
        "chainId": 9889,
        "name": "weETH",
        "address": "0x239ed6e12b7ce4089ee245244e3bf906999a6429c2a9a445a1e1faf56914a4ab",
        "symbol": "weETH",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0x94cd19fd8aa593b2a2d25d6f3c9a32a958ad8cdd477d25c367de20f22207f679"
    }

    export const wstETH = {
        "chainId": 9889,
        "name": "wstETH",
        "address": "0x1a7815cc9f75db5c24a5b0814bfb706bb9fe485333e98254015de8f48f84c67b",
        "symbol": "wstETH",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0xa232a843105ef81cd9996efc121cd3c8455c5edd9fb9c5a0b097982e1e68d5d6"
    }

    export const FUEL = {
        "chainId": 9889,
        "name": "Fuel",
        "address": "0x1d5d97005e41cae2187a895fd8eab0506111e0e2f3331cd3912c15c24e3c1d82",
        "symbol": "FUEL",
        "decimals": 9,
        "logoURI": "https://verified-assets.fuel.network/images/weth.svg",
        "contractId": "0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8",
        "subId": "0xe81c89b8cf795c7c25e79f6c4f2f1cd233290b58e217ed4e9b6b18538badddaf"
    }

    export const SWAYLEND_ASSETS = [ETH, ezETH, USDT, sDAI, weETH, wstETH, FUEL]
}

// TOKEN_GATEWAY = 0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8