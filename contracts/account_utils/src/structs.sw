library;

use executor::{BatchSwapStep, execute_exact_in, get_dex_input_receiver};
use market_abi::{Market, structs::PriceDataUpdate};

////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////
pub struct SwapPath {
    pub amount_in: u64,
    pub min_amount_out: u64,
    pub transfer_in: bool,
    pub steps: Vec<BatchSwapStep>,
}

pub enum LenderId {
    SwaylendUSDC: (),
}

impl LenderId {
    pub fn from_u64(value: u64) -> Option<LenderId> {
        match value {
            0 => Some(LenderId::SwaylendUSDC),
            _ => None,
        }
    }

    pub fn to_u64(self) -> u64 {
        match self {
            LenderId::SwaylendUSDC => 0,
        }
    }
}

pub enum LenderActionType {
    Deposit: (),
    Borrow: (),
    Withdraw: (),
    Repay: (),
    DepositBase: (),
    WithdrawBase: (),
}

impl LenderActionType {
    pub fn from_u16(value: u16) -> Option<LenderActionType> {
        match value {
            0 => Some(LenderActionType::Deposit),
            1 => Some(LenderActionType::Borrow),
            2 => Some(LenderActionType::Withdraw),
            3 => Some(LenderActionType::Repay),
            4 => Some(LenderActionType::DepositBase),
            5 => Some(LenderActionType::WithdrawBase),
            _ => None,
        }
    }

    pub fn to_u16(self) -> u16 {
        match self {
            LenderActionType::Deposit => 0,
            LenderActionType::Borrow => 1,
            LenderActionType::Withdraw => 2,
            LenderActionType::Repay => 3,
            LenderActionType::DepositBase => 4,
            LenderActionType::WithdrawBase => 5,
        }
    }
}

pub enum AmountType {
    Received: (),
    Defined: (),
}

impl AmountType {
    pub fn from_u8(value: u8) -> Option<AmountType> {
        match value {
            0 => Some(AmountType::Received),
            1 => Some(AmountType::Defined),
            _ => None,
        }
    }

    pub fn to_u8(self) -> u8 {
        match self {
            AmountType::Received => 0,
            AmountType::Defined => 1,
        }
    }
}

pub struct LenderAction {
    pub lender_id: u64,
    pub action_id: u16,
    pub asset: AssetId,
    pub amount_in: u64,
    pub amount_type_id: u8,
    pub market: ContractId,
    pub data: Option<PriceDataUpdate>,
}

pub struct SwapPathList {
    pub paths: Vec<SwapPath>,
}

pub struct TransferAction {
    pub asset: AssetId,
    pub amount: u64,
    pub receiver: Identity,
}

pub enum Action {
    Swap: SwapPathList,
    Lending: LenderAction,
    Transfer: TransferAction
}
