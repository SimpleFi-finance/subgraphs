import { near, BigInt, log, json, JSONValueKind, Bytes, JSONValue } from "@graphprotocol/graph-ts"

/**
pub fn withdraw(
  &mut self,
  token_id: ValidAccountId,
  amount: U128,
  unregister: Option<bool>,
) -> Promise
 */
export function withdraw(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn exchange_callback_post_withdraw(
  &mut self,
  token_id: AccountId,
  sender_id: AccountId,
  amount: U128,
)
 */
export function callbakPostWithdraw(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}