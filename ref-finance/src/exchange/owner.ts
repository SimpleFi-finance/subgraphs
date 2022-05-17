import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Market, Pool, RefAccount, SimplePool } from "../../generated/schema";
import { redeemSimplePoolShares } from "./exchange";

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
  // TODO handle stable swap pool as well
  const pool = Pool.load(marketId) as Pool;
  if (pool.poolType != "SIMPLE_POOL") {
    return;
  }

  const simplePool = SimplePool.load(marketId) as SimplePool;
  const tokensLength = simplePool.tokens.length;
  const oldPoolAmounts = simplePool.amounts;
  const amounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    const amount = oldPoolAmounts[i].times(shares).div(simplePool.totalSupply);
    amounts.push(amount);
  }

  let market = Market.load(marketId) as Market;

  redeemSimplePoolShares(
    simplePool,
    market,
    receipt.receiverId,
    shares,
    amounts,
    receipt,
    outcome,
    block
  );
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

}