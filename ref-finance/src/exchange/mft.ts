import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Pool, SimplePool } from "../../generated/schema";
import { getOrCreateShare, transferSimplePoolShares } from "./exchange";

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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokenId = (args.get("token_id") as JSONValue).toString().slice(1);
  const receiverId = (args.get("receiver_id") as JSONValue).toString();
  const amount = BigInt.fromString((args.get("amount") as JSONValue).toString());
  const senderId = receipt.predecessorId;

  // If tokenId is a pool then only handle otherwise ignore it
  const marketId = receipt.receiverId.concat("-").concat(tokenId);
  const tryPool = Pool.load(marketId);
  let pool: Pool;
  if (tryPool == null) {
    return;
  } else {
    pool = tryPool as Pool;
  }

  if (pool.poolType == "SIMPLE_POOL") {
    const simplePool = SimplePool.load(pool.id) as SimplePool;
    transferSimplePoolShares(
      simplePool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
  } else {
    // TODO handle stable swap pool share transfer
  }
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokenId = (args.get("token_id") as JSONValue).toString().slice(1);
  const receiverId = (args.get("receiver_id") as JSONValue).toString();
  const amount = BigInt.fromString((args.get("amount") as JSONValue).toString());
  const senderId = receipt.predecessorId;

  // If tokenId is a pool then only handle otherwise ignore it
  const marketId = receipt.receiverId.concat("-").concat(tokenId);
  const tryPool = Pool.load(marketId);
  let pool: Pool;
  if (tryPool == null) {
    return;
  } else {
    pool = tryPool as Pool;
  }

  if (pool.poolType == "SIMPLE_POOL") {
    const simplePool = SimplePool.load(pool.id) as SimplePool;
    transferSimplePoolShares(
      simplePool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
  } else {
    // TODO handle stable swap pool share transfer
  }
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokenId = (args.get("token_id") as JSONValue).toString().slice(1);
  const receiverId = (args.get("receiver_id") as JSONValue).toString();
  // const amount = BigInt.fromString((args.get("amount") as JSONValue).toString());
  const senderId = receipt.predecessorId;

  // Parse outcome to get return value
  const returnBytes = outcome.status.toValue();
  const unusedAmount = BigInt.fromString(json.fromBytes(returnBytes).toString());

  if (unusedAmount.equals(BigInt.fromI32(0))) {
    return;
  }

  // If tokenId is a pool then only handle otherwise ignore it
  const marketId = receipt.receiverId.concat("-").concat(tokenId);
  const tryPool = Pool.load(marketId);
  let pool: Pool;
  if (tryPool == null) {
    return;
  } else {
    pool = tryPool as Pool;
  }

  const receiverShare = getOrCreateShare(receiverId, marketId);
  const receiverBalance = receiverShare.amount;

  if (receiverBalance.equals(BigInt.fromI32(0))) {
    return;
  }

  const refundAmount = unusedAmount.gt(receiverBalance) ? receiverBalance : unusedAmount;

  if (pool.poolType == "SIMPLE_POOL") {
    const simplePool = SimplePool.load(pool.id) as SimplePool;

    transferSimplePoolShares(
      simplePool,
      receiverId,
      senderId,
      refundAmount,
      receipt,
      outcome,
      block
    );
  } else {
    // TODO handle stable swap pool share transfer
  }
}