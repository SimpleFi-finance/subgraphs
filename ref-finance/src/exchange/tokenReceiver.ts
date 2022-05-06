import { near } from "@graphprotocol/graph-ts";

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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {

}