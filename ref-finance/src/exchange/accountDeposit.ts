import { near } from "@graphprotocol/graph-ts";

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
  outcome: near.ExecutionOutcome,
  block: near.Block
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {

}