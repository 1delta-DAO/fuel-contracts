contract;

use std::{b512::B512, ecr::{ec_recover, ec_recover_address, EcRecoverError}};
use std::hash::*;
use std::bytes::Bytes;
use std::{storage::storage_vec::*};
use std::{
    bytes_conversions::b256::*,
    bytes_conversions::u256::*,
    bytes_conversions::u64::*,
    primitive_conversions::b256::*,
    primitive_conversions::u256::*,
    primitive_conversions::u64::*,
};
 

// The abi defines the blueprint for the contract.
abi FlashBatcher {
    #[storage(read)]
    fn exectute() -> u64;
}

impl FlashBatcher for Contract {
    #[storage(read)]
    fn exectute() -> u64 {

    }

}
