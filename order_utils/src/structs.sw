library;

// definition of the rfq order
pub struct RfqOrder {
    pub maker_asset: b256,
    pub taker_asset: b256,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub maker: b256,
    pub nonce: u64,
    pub expiry: u32,
}

// we log the hash and the funds exchanged
pub struct OrderFillEvent {
    pub order_hash: b256,
    pub maker_fill_amount: u64,
    pub taker_fill_amount: u64,
}

// errors
pub enum Error {
    None: (),
    InvalidOrderSignature: (),
    InvalidNonce: (),
    Expired: (),
    InvalidTakerAsset: (),
    TakerAmountTooHigh: (),
    InsufficientTakerAmountReceived: (),
    MakerBalanceTooLow: (),
    MakerInsufficientBalance: (),
    WithdrawTooMuch: (),
    NothingReceived: (),
}
