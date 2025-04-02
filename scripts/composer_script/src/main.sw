script;

use interfaces::mira_amm::MiraAMM;
use utils::blockchain_utils::check_deadline;
use executor::{BatchSwapStep, execute_exact_in, get_dex_input_receiver};
use std::{asset::transfer, bytes::Bytes, bytes_conversions::u64::*, revert::revert};
use logger_abi::Logger;
use market_abi::{Market, structs::PriceDataUpdate};

////////////////////////////////////////////////////
// Error codes
////////////////////////////////////////////////////
const EMPTY_PATH_ENTRY: u64 = 100;
const EMPTY_ACTION_ENTRY: u64 = 101;
const INVALID_LENDER_ID: u64 = 102;
const INVALID_ACTION_TYPE: u64 = 103;
const INVALID_AMOUNT_TYPE: u64 = 104;

////////////////////////////////////////////////////
// DEX references
////////////////////////////////////////////////////
configurable {
    MIRA_AMM_CONTRACT_ID: ContractId = ContractId::from(0x2e40f2b244b98ed6b8204b3de0156c6961f98525c8162f80162fcf53eebd90e7),
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId = ContractId::from(0xf6caa75386fe9ba4da15b82723ecffb0d56b28ae7ece396b15c5650b605359ac),
    LOGGER_CONTRACT_ID: ContractId = ContractId::from(0x60caa3fe777329cd32a66a4c7ac5840e4eb10441a1f8331cd00d45fb0341a7a6),
    SWAYLEND_USDC_MARKET_CONTRACT_ID: ContractId = ContractId::from(0x657ab45a6eb98a4893a99fd104347179151e8b3828fd8f2a108cc09770d1ebae),
}

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
    pub receiver: Identity,
    pub data: Option<PriceDataUpdate>,
}

pub struct SwapPathList {
    pub paths: Vec<SwapPath>,
}

pub enum Action {
    Swap: (SwapPathList),
    Lending: (LenderAction),
}

// Swap split paths exact in
fn main(
    actions: Vec<Action>,
    deadline: u32,
) {
    check_deadline(deadline);

    // use cached amount for split swaps
    let mut amount_cached = 0u64;

    // start to go through actions
    let mut j = 0;
    while j < actions.len() {
        match actions.get(j) {
            Some(Action::Swap(swap_path_list)) => {
                // start to swap through paths
                let mut i = 0;
                while i < swap_path_list.paths.len() {
                    // get current path, input amount, slippage_check, transfer_in flag and path
                    let (current_amount_in, minimum_out, transfer_in, current_path) = match swap_path_list.paths.get(i) {
                        Option::Some(SwapPath { amount_in, min_amount_out, transfer_in, steps }) => (amount_in, min_amount_out, transfer_in, steps),
                        Option::None => revert(EMPTY_PATH_ENTRY),
                    };

                    // get the amount to be used
                    // if zero, we use the last cached amount to swap splits
                    // after a single swap
                    // if the cached amount is used, we reset it to zero
                    let mut amount_in_used = if current_amount_in != 0 {
                        current_amount_in
                    } else {
                        // TEMP: make sure that assignment is via values
                        let am = amount_cached + 0;
                        // reset amount cached after it was used
                        amount_cached = 0;
                        am
                    };
                
                    // get path length for iteration
                    let path_length = current_path.len();

                    // initialize first swap step (from action j)
                    let mut swap_step = current_path.get(0).unwrap();

                    // transfer to first DEX if needed
                    if transfer_in {
                        transfer(
                            get_dex_input_receiver(
                                swap_step
                                    .dex_id,
                                swap_step
                                    .data,
                                MIRA_AMM_CONTRACT_ID,
                                ONE_DELTA_ORDERS_CONTRACT_ID,
                            ),
                            swap_step
                                .asset_in,
                            amount_in_used,
                        );
                    }
                    // start swapping the path via index k
                    let mut k = 0;
                    while true {
                        //=============================================
                        //      DEX swap execution  
                        //=============================================

                        // execute swap
                        amount_in_used = execute_exact_in(
                            u64::try_from(amount_in_used)
                                .unwrap(),
                            swap_step,
                            MIRA_AMM_CONTRACT_ID,
                            ONE_DELTA_ORDERS_CONTRACT_ID,
                        );

                        //=============================================
                        //      DEX swap end  
                        //=============================================

                        // increment swap step index within path
                        k += 1;

                        // check if we need to continue
                        if k < path_length {
                            // get next swap_step
                            swap_step = current_path.get(k).unwrap();
                        } else {
                            // in this block, we completed a path
                            // we record / increment the cached amount and check for slippage
                            // increment cache
                            amount_cached += amount_in_used;
                            // check for slippage on path
                            require(amount_in_used > minimum_out, "Insufficient output amount");
                            // break and start next path
                            break;
                        }
                    }
                    // increment path index
                    i += 1;
                }
                // increment action index
                j += 1;
            },
            Some(Action::Lending(LenderAction { lender_id, action_id, asset, amount_in, amount_type_id, receiver, data })) => {
                let lender = match LenderId::from_u64(lender_id) {
                    Some(lender) => lender,
                    None => revert(INVALID_LENDER_ID),
                };
                let action = match LenderActionType::from_u16(action_id) {
                    Some(action) => action,
                    None => revert(INVALID_ACTION_TYPE),
                };
                let amount_type = match AmountType::from_u8(amount_type_id) {
                    Some(amount_type) => amount_type,
                    None => revert(INVALID_AMOUNT_TYPE),
                };
                let amount = match amount_type {
                    AmountType::Received => amount_cached,
                    AmountType::Defined => amount_in,
                };

                // increment operation index
                j += 1;

                match lender {
                    LenderId::SwaylendUSDC => {
                        let swaylend_market = abi(Market, SWAYLEND_USDC_MARKET_CONTRACT_ID.into());

                        match action {
                            LenderActionType::Deposit => {
                                transfer(
                                    Identity::ContractId(SWAYLEND_USDC_MARKET_CONTRACT_ID),
                                    asset,
                                    amount,
                                );
                                
                                swaylend_market.supply_collateral();
                            },
                            LenderActionType::Borrow => {
                                require(data.is_some(), "price data not defined");
                                
                                swaylend_market.withdraw_base(amount, data.unwrap());
                            },
                            LenderActionType::Withdraw => {
                                require(data.is_some(), "price data not defined");

                                swaylend_market.withdraw_collateral(asset, amount, data.unwrap());
                            },
                            LenderActionType::Repay => {
                                transfer(
                                    Identity::ContractId(SWAYLEND_USDC_MARKET_CONTRACT_ID),
                                    asset,
                                    amount,
                                );

                                swaylend_market.supply_base();
                            },
                            _ => {
                                revert(EMPTY_ACTION_ENTRY);
                            }
                        }
                    },
                    _ => {
                        revert(EMPTY_ACTION_ENTRY);
                    }
                }
            },
            None => {
                revert(EMPTY_ACTION_ENTRY);
            }
        };
    }

    // call dead_call on logger to make this TX traceable
    let logger = abi(Logger, LOGGER_CONTRACT_ID.into());
    logger.dead_call();
}
