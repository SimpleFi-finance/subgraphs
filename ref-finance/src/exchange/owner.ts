import { near, BigInt, log, json, JSONValueKind, Bytes, JSONValue } from "@graphprotocol/graph-ts"

/**
pub fn set_owner(&mut self, owner_id: ValidAccountId)
 */
export function setOwner(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn change_state(&mut self, state: RunningState)
 */
export function changeState(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn modify_admin_fee(&mut self, exchange_fee: u32, referral_fee: u32)
 */
export function modifyAdminFee(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn remove_exchange_fee_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>)
 */
export function removeExchangeFeeLiquidity(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn stable_swap_ramp_amp(
  &mut self,
  pool_id: u64,
  future_amp_factor: u64,
  future_amp_time: WrappedTimestamp,
)
 */
export function stableSwapRampAmp(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn stable_swap_stop_ramp_amp(&mut self, pool_id: u64)
 */
export function stableSwapStopRampAmp(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}