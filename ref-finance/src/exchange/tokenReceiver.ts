import { near, BigInt, log, json, JSONValueKind, Bytes, JSONValue } from "@graphprotocol/graph-ts"

/**
fn ft_on_transfer(
  &mut self,
  sender_id: ValidAccountId,
  amount: U128,
  msg: String,
) -> PromiseOrValue<U128>
 */
export function ftOnTransfer(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}