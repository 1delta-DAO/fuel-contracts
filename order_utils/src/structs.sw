library;

// order object
pub struct LimitOrder {
    pub maker_token: b256,
    pub taker_token: b256,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub maker: Address,
    pub taker: Address,
    pub nonce: u256,
    pub expriy: u64,
}

pub struct OrderState {
    pub cancelled: bool,
    pub filled_amount: u64,
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
