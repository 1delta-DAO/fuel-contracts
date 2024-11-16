library;

pub struct RfqOrder {
    pub maker_asset: b256,
    pub taker_asset: b256,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub maker: b256,
    pub nonce: u64,
    pub expriy: u64,
}

pub struct OrderFillReturn {
    pub taker_fill_amount: u64,
    pub maker_fill_amount: u64,
}

// errors
pub enum Error {
    OrderNotDefined: (),
    OrderReenter: (),
    TryToFillMoreThanRequired: (),
    SentAssetIdDoesNotMatchMakerToken: (),
    SentAssetAmountDoesNotMatchFillAmount: (),
    InsufficientTakerTokensReceivedFromCallback: (),
    OnlySettlementCanInteract: (),
    AlreadyIntitialized: (),
    MakerHasNotEnoughFunds: (),
}
