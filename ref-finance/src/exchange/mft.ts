import { near, BigInt, log, json, JSONValueKind, Bytes, JSONValue } from "@graphprotocol/graph-ts"

/**
pub fn mft_transfer(
  &mut self,
  token_id: String,
  receiver_id: ValidAccountId,
  amount: U128,
  memo: Option<String>,
)
 */
export function mftTransfer(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
pub fn mft_transfer_call(
  &mut self,
  token_id: String,
  receiver_id: ValidAccountId,
  amount: U128,
  memo: Option<String>,
  msg: String,
) -> PromiseOrValue<U128>
 */
export function mftTransferCall(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
This is used as callback in mftTransferCall

pub fn mft_resolve_transfer(
  &mut self,
  token_id: String,
  sender_id: AccountId,
  receiver_id: &AccountId,
  amount: U128,
) -> U128
 */
export function mftResolveTransfer(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}