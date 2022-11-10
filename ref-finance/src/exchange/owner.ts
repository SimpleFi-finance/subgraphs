import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Pool, RefAccount } from "../../generated/schema";
import { ratedRampAmp, ratedStopRampAmp, removeRatedLiquidityByShares } from "./ratedExchange";
import { removeSimpleLiquidity } from "./simpleExchange";
import { removeStableLiquidityByShares, stableRampAmp, stableStopRampAmp } from "./stableExchange";


const POOL_TYPE_SIMPLE = "SIMPLE_POOL";
const POOL_TYPE_STABLE = "STABLE_SWAP";
const POOL_TYPE_RATED = "RATED_POOL";

/**
pub fn set_owner(&mut self, owner_id: ValidAccountId)
 */
export function setOwner(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {

}

/**
pub fn change_state(&mut self, state: RunningState)
 */
export function changeState(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {

}

/**
pub fn modify_admin_fee(&mut self, exchange_fee: u32, referral_fee: u32)
 */
export function modifyAdminFee(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const exchangeFee = (args.get("exchange_fee") as JSONValue).toBigInt();
  const referralFee = (args.get("referral_fee") as JSONValue).toBigInt();

  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  refAccount.exchangeFee = exchangeFee;
  refAccount.referralFee = referralFee;
  refAccount.save();
}

/**
pub fn remove_exchange_fee_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>)
 */
export function removeExchangeFeeLiquidity(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  const shares = BigInt.fromString((args.get("shares") as JSONValue).toString());

  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId) as Pool;
  
  if (pool.poolType == POOL_TYPE_SIMPLE) {
    removeSimpleLiquidity(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      shares
    );
  } else if (pool.poolType == POOL_TYPE_STABLE) {
    removeStableLiquidityByShares(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      shares
    );
  } else if (pool.poolType == POOL_TYPE_RATED) {
    removeRatedLiquidityByShares(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      shares
    );
  }
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  const futureAmpFactor = (args.get("future_amp_factor") as JSONValue).toBigInt();
  const futureAmpTime = BigInt.fromString((args.get("future_amp_time") as JSONValue).toString());

  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

  if (pool.poolType == POOL_TYPE_STABLE) {
    stableRampAmp(block, marketId, futureAmpFactor, futureAmpTime);
  } else if (pool.poolType == POOL_TYPE_RATED) {
    ratedRampAmp(block, marketId, futureAmpFactor, futureAmpTime);
  }
}

/**
pub fn stable_swap_stop_ramp_amp(&mut self, pool_id: u64)
 */
export function stableSwapStopRampAmp(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  
  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

  if (pool.poolType == POOL_TYPE_STABLE) {
    stableStopRampAmp(block, marketId);
  } else if (pool.poolType == POOL_TYPE_RATED) {
    ratedStopRampAmp(block, marketId);
  }
}