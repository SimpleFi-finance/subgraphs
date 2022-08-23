import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { parseNullableJSONAtrribute } from "../common";
import { addRewardToSimpleFarm, depositSeedSimpleFarm } from "./farm";

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
  const args = json.fromBytes(functionCall.args).toObject();
  const senderId = (args.get("sender_id") as JSONValue).toString();
  const amount = BigInt.fromString((args.get("amount") as JSONValue).toString());
  const msg = (args.get("msg") as JSONValue).toString();

  if (msg == "") {
    depositSeedSimpleFarm(receipt, outcome, block, receipt.predecessorId, senderId, amount, "FT");
  } else {
    addRewardToSimpleFarm(msg, amount, BigInt.fromU64(block.header.timestampNanosec));
  }
}