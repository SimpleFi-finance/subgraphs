import { log } from "@graphprotocol/graph-ts";
import {
    AddLiquidity,
    NewFee,
    NewParameters,
    RemoveLiquidity,
    RemoveLiquidityImbalance,
    RemoveLiquidityOne,
    TokenExchange,
    TokenExchangeUnderlying
} from "../generated/templates/CurvePool/StableSwap";


// Note: If a handler doesn't require existing field values, it is faster
// _not_ to load the entity from the store. Instead, create it fresh with
// `new Entity(...)`, set the fields that should be updated and save the
// entity back to the store. Fields that were not set or unset remain
// unchanged, allowing for partial updates to be applied.

// It is also possible to access smart contracts from mappings. For
// example, the contract that has emitted the event can be connected to
// with:
//
// let contract = Contract.bind(event.address)
//
// The following functions can then be called on this contract to access
// state variables and other data:
//
// - contract.get_virtual_price(...)
// - contract.calc_token_amount(...)
// - contract.get_dy(...)
// - contract.get_dy_underlying(...)
// - contract.coins(...)
// - contract.underlying_coins(...)
// - contract.balances(...)
// - contract.A(...)
// - contract.fee(...)
// - contract.admin_fee(...)
// - contract.owner(...)
// - contract.admin_actions_deadline(...)
// - contract.transfer_ownership_deadline(...)
// - contract.future_A(...)
// - contract.future_fee(...)
// - contract.future_admin_fee(...)
// - contract.future_owner(...)


export function handleTokenExchange(event: TokenExchange): void {
    log.info("handle event {}", ["TokenExchange"])
}

export function handleTokenExchangeUnderlying(event: TokenExchangeUnderlying): void {
    log.info("handle event {}", ["TokenExchangeUnderlying"])
}

export function handleAddLiquidity(event: AddLiquidity): void {
    log.info("handle event {}", ["AddLiquidity"])
}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
    log.info("handle event {}", ["RemoveLiquidity"])
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
    log.info("handle event {}", ["RemoveLiquidityOne"])
}

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
    log.info("handle event {}", ["RemoveLiquidityImbalance"])
}

export function handleNewFee(event: NewFee): void {
    log.info("handle event {}", ["NewFee"])
}

export function handleNewParameters(event: NewParameters): void {
    log.info("handle event {}", ["NewParmeters"])
}