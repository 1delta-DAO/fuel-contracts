contract;

use interfaces::mira_amm::MiraAMM;
use executor::{BatchSwapStep, execute_exact_in, get_dex_input_receiver};
use std::{
    asset::transfer,
    auth::msg_sender,
    revert::revert,
};
use market_abi::Market;
use account_utils::{
    AccountLogic,
    ExecutionValidation,
    structs::{
        Action,
        AmountType,
        LenderAction,
        TransferAction,
        LenderActionType,
        LenderId,
        SwapPath,
        SwapPathList,
    },
};

////////////////////////////////////////////////////
// Error codes
////////////////////////////////////////////////////
const EMPTY_PATH_ENTRY: u64 = 100;
const EMPTY_ACTION_ENTRY: u64 = 101;
const INVALID_LENDER_ID: u64 = 102;
const INVALID_ACTION_TYPE: u64 = 103;
const INVALID_AMOUNT_TYPE: u64 = 104;
const INVALID_BALANCE: u64 = 105;

////////////////////////////////////////////////////
// DEX references
////////////////////////////////////////////////////
configurable {
    FACTORY_ID: b256 = b256::zero(),
    MIRA_AMM_CONTRACT_ID: ContractId = ContractId::from(0x2e40f2b244b98ed6b8204b3de0156c6961f98525c8162f80162fcf53eebd90e7),
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId = ContractId::from(0xf6caa75386fe9ba4da15b82723ecffb0d56b28ae7ece396b15c5650b605359ac),
}

impl AccountLogic for Contract {
    #[payable, storage(write)]
    fn compose(actions: Vec<Action>) {
        // validate that only authorized entities can call this contract 
        require(
            abi(ExecutionValidation, FACTORY_ID)
                .can_call(ContractId::this(), msg_sender().unwrap()),
            "Unauthorized",
        );

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
                            Option::Some(SwapPath {
                                amount_in,
                                min_amount_out,
                                transfer_in,
                                steps,
                            }) => (amount_in, min_amount_out, transfer_in, steps),
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
                Some(Action::Lending(LenderAction {
                    lender_id,
                    action_id,
                    asset,
                    amount_in,
                    amount_type_id,
                    data,
                    market,
                })) => {
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
                    let mut amount = match amount_type {
                        AmountType::Received => {
                            // TEMP: make sure that assignment is via values
                            let am = amount_cached + 0;
                            // reset amount cached after it was used
                            amount_cached = 0;
                            am
                        },
                        AmountType::Defined => amount_in,
                    };

                    // increment operation index
                    j += 1;

                    match lender {
                        LenderId::SwaylendUSDC => {
                            // get lending market contract
                            let swaylend_market = abi(Market, market.into());

                            match action {
                                LenderActionType::Deposit => {
                                    swaylend_market
                                        .supply_collateral {
                                            asset_id: asset.into(),
                                            coins: amount,
                                        }();
                                },
                                LenderActionType::Borrow => {
                                    require(data.is_some(), "price data not defined");

                                    // 0 indicates full balance repay
                                    if amount == 0 {
                                        let (base_deposit, _) = swaylend_market.get_user_supply_borrow(Identity::ContractId(ContractId::this()));
                                        let base_deposit_64 = u64::try_from(base_deposit).unwrap();
                                        if base_deposit_64 == 0u64 {
                                            revert(INVALID_BALANCE);
                                        } else {
                                            amount = base_deposit_64;
                                        }
                                    }

                                    swaylend_market
                                        .withdraw_base {
                                            asset_id: AssetId::base().bits(),
                                            coins: data.unwrap().update_fee,
                                        }(amount, data.unwrap());
                                },
                                LenderActionType::Withdraw => {
                                    require(data.is_some(), "price data not defined");

                                    swaylend_market
                                        .withdraw_collateral {
                                            asset_id: AssetId::base().bits(),
                                            coins: data.unwrap().update_fee,
                                        }(asset, amount, data.unwrap());
                                },
                                LenderActionType::Repay => {
                                    if amount == 0 {
                                        let (_, user_borrow) = swaylend_market.get_user_supply_borrow(Identity::ContractId(ContractId::this()));
                                        let borrow_64 = u64::try_from(user_borrow).unwrap();
                                        if borrow_64 == 0u64 {
                                            revert(INVALID_BALANCE);
                                        } else {
                                            amount = borrow_64;
                                        }
                                    }
                                    swaylend_market
                                        .supply_base {
                                            asset_id: asset.into(),
                                            coins: amount,
                                        }();
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
                Some(Action::Transfer(TransferAction {
                    asset,
                    amount,
                    receiver,
                })) => {
                    transfer(receiver, asset, amount);
                    j += 1;
                },
                None => {
                    revert(EMPTY_ACTION_ENTRY);
                }
            };
        }
    }
}
