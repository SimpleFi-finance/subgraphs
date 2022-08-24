import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
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

/**
fn mft_on_transfer(
        &mut self,
        token_id: String,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128>
 */
export function mftOnTransfer(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokenId = (args.get("token_id") as JSONValue).toString();
  const senderId = (args.get("sender_id") as JSONValue).toString();
  const amount = BigInt.fromString((args.get("amount") as JSONValue).toString());
  const msg = (args.get("msg") as JSONValue).toString();

  // This will receipt panic and fail if it's called with a non MFT
  // Therefore we can safly assume the tokenId to be a MFT format poolId
  const poolId = tokenId.slice(1);
  const seedId = receipt.predecessorId.concat("@").concat(poolId);

  if (msg == "") {
    depositSeedSimpleFarm(receipt, outcome, block, seedId, senderId, amount, "MFT");
  }
  // No need to handle non empty case because receipt will panic and fail
}