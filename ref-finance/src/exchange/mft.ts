import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Pool, RatedSwapPool, SimplePool, StableSwapPool } from "../../generated/schema";
import { getOrCreateShare } from "./commonExchange";
import { transferRatedPoolShares } from "./ratedExchange";
import { transferSimplePoolShares } from "./simpleExchange";
import { transferStablePoolShares } from "./stableExchange";


const POOL_TYPE_SIMPLE = "SIMPLE_POOL";
const POOL_TYPE_STABLE = "STABLE_SWAP";
const POOL_TYPE_RATED = "RATED_POOL";

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

  if (pool.poolType == POOL_TYPE_SIMPLE) {
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
  } else if (pool.poolType == POOL_TYPE_STABLE) {
    const stableSwapPool = StableSwapPool.load(pool.id) as StableSwapPool;
    transferStablePoolShares(
      stableSwapPool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
  } else if (pool.poolType == POOL_TYPE_RATED) {
    const ratedSwapPool = RatedSwapPool.load(pool.id) as RatedSwapPool;
    transferRatedPoolShares(
      ratedSwapPool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
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

  if (pool.poolType == POOL_TYPE_SIMPLE) {
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
  } else if (pool.poolType == POOL_TYPE_STABLE){
    const stableSwapPool = StableSwapPool.load(pool.id) as StableSwapPool;
    transferStablePoolShares(
      stableSwapPool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
  } else if (pool.poolType == POOL_TYPE_RATED) {
    const ratedSwapPool = RatedSwapPool.load(pool.id) as RatedSwapPool;
    transferRatedPoolShares(
      ratedSwapPool,
      senderId,
      receiverId,
      amount,
      receipt,
      outcome,
      block
    );
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

  if (pool.poolType == POOL_TYPE_SIMPLE) {
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
  } else if (pool.poolType == POOL_TYPE_STABLE) {
    const stableSwapPool = StableSwapPool.load(pool.id) as StableSwapPool;
    transferStablePoolShares(
      stableSwapPool,
      senderId,
      receiverId,
      refundAmount,
      receipt,
      outcome,
      block
    );
  } else if (pool.poolType == POOL_TYPE_RATED) {
    const ratedSwapPool = RatedSwapPool.load(pool.id) as RatedSwapPool;
    transferRatedPoolShares(
      ratedSwapPool,
      senderId,
      receiverId,
      refundAmount,
      receipt,
      outcome,
      block
    );
  }
}