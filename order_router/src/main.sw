contract;

use std::{
    asset::transfer,
    b512::B512,
    bytes::Bytes,
    context::this_balance,
    hash::*,
    revert::require,
};
use order_utils::{
    compute_taker_fill_amount,
    IFlashCallback,
    OneDeltaOrders,
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
    );

    #[storage(read, write)]
    fn flash(
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
const INVALID_SENDER = 101u64;
const INVALID_MATCH = 102u64;

impl OrderRouter for Contract {
    #[storage(write, read), payable]
    fn fill_order(
        order: Order,
        order_signature: B512,
        taker_fill_amount: u64,
        taker_receiver: Identity,
        data: Option<Bytes>,
    ) {
        let orders = abi(OneDeltaOrders, ONE_DELTA_ORDERS_CONTRACT_ID.into());
        orders.fill(
            order,
            order_signature,
            taker_fill_amount,
            taker_receiver,
            data,
        );
        let asset_id = AssetId::from(order.taker_asset);
        let profit = this_balance(asset_id);
        if profit != 0 {
            transfer(msg_sender().unwrap(), asset_id, this_balance(asset_id));
        }
    }

    #[storage(read, write)]
    fn flash(
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
        require(
            msg_sender()
                .unwrap()
                .bits() == ONE_DELTA_ORDERS_CONTRACT_ID
                .bits(),
            INVALID_MATCH,
        );

        let orders = abi(OneDeltaOrders, ONE_DELTA_ORDERS_CONTRACT_ID.into());
        let (taker_filled, maker_filled) = orders.fill(
            order,
            signature,
            maker_amount,
            Identity::ContractId(ContractId::this()),
            None,
        );

        transfer(
            Identity::ContractId(ContractId::from(ONE_DELTA_ORDERS_CONTRACT_ID)),
            AssetId::from(taker_asset),
            taker_amount,
        );
    }
}
