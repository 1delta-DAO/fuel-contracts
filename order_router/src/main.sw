contract;

use std::{
    asset::transfer,
    b512::B512,
    block::height,
    bytes::Bytes,
    call_frames::msg_asset_id,
    context::{
        msg_amount,
        this_balance,
    },
    hash::*,
    revert::require,
    storage::storage_vec::*,
};
use sway_libs::reentrancy::reentrancy_guard;
use order_utils::{
    compute_order_hash,
    get_expiry,
    IFlashCallback,
    is_contract_receiver,
    min64,
    no_partial_fill,
    OneDeltaOrders,
    pack_order,
    recover_signer,
    structs::{
        CancelEvent,
        CancelPairEvent,
        DepositEvent,
        Order,
        OrderFillEvent,
        WithdrawEvent,
    },
    to_order_and_sig,
};

// The interface for interacting with Rfq orders 
abi OrderRouter {
    #[storage(write, read), payable]
    fn fill_order(
        order: Order,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) -> (u64, u64);

    #[storage(read, write)]
    fn flash(
        sender: Identity,
        maker_asset: b256,
        taker_asset: b256,
        maker_amount: u64,
        taker_amount: u64,
        data: Bytes,
    );
}

configurable {
    ONE_DELTA_ORDERS_CONTRACT_ID: ContractId = ContractId::from(0xf6caa75386fe9ba4da15b82723ecffb0d56b28ae7ece396b15c5650b605359ac),
}

storage {}

// error codes
const NO_ERROR = 0u64;
const INVALID_SENDER = 101u64;

impl OrderRouter for Contract {
    #[storage(write, read), payable]
    fn fill_order(
        order: Order,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) -> (u64, u64) {
        abi(OneDeltaOrders, ONE_DELTA_ORDERS_CONTRACT_ID.bits()).fill(
            order,
            order_signature,
            taker_fill_amount,
            taker_receiver,
            data,
        )
    }

    #[storage(read, write)]
    fn flash(
        sender: Identity,
        maker_asset: b256,
        taker_asset: b256,
        maker_amount: u64,
        taker_amount: u64,
        data: Bytes,
    ) {
        require(
            msg_sender()
                .unwrap()
                .bits() == ONE_DELTA_ORDERS_CONTRACT_ID
                .bits(),
            INVALID_SENDER,
        );

        let (order, signature) = to_order_and_sig(data);
        abi(OneDeltaOrders, ONE_DELTA_ORDERS_CONTRACT_ID.bits()).fill(
            order,
            signature,
            maker_amount,
            Identity::ContractId(ONE_DELTA_ORDERS_CONTRACT_ID),
            None,
        );
    }
}
