import { near, BigInt, log, json, JSONValueKind, Bytes, JSONValue } from "@graphprotocol/graph-ts"
import { Pool, RefAccount, SimplePool, StableSwapPool } from "../generated/schema";

/**
pub fn new(owner_id: ValidAccountId, exchange_fee: u32, referral_fee: u32) -> Self
 */
export function initRefV2(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const ownerId = (args.get("owner_id") as JSONValue).toString();
  const exchangeFee = (args.get("exchange_fee") as JSONValue).toBigInt();
  const referralFee = (args.get("referral_fee") as JSONValue).toBigInt();

  const refAccount = new RefAccount(receipt.receiverId);
  refAccount.ownerId = ownerId;
  refAccount.exchangeFee = exchangeFee;
  refAccount.referralFee = referralFee;
  refAccount.poolsCounter = 0;
  refAccount.save();
}

/**
add_simple_pool(&mut self, tokens: Vec<ValidAccountId>, fee: u32) -> u64
 */ 
export function addSimplePool(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokens = (args.get("tokens") as JSONValue).toArray().map<string>(jv => jv.toString());
  const fee = (args.get("fee") as JSONValue).toBigInt();

  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  const poolId = refAccount.poolsCounter.toString();
  refAccount.poolsCounter += 1;
  refAccount.save();

  const pool = new Pool(poolId);
  pool.poolType = "SIMPLE_POOL";
  pool.save();

  const simplePool = new SimplePool(poolId);
  simplePool.tokens = tokens;
  simplePool.amounts = tokens.map<BigInt>(t => BigInt.fromI32(0));
  simplePool.totalFee = fee;
  simplePool.exchangeFee = BigInt.fromI32(0);
  simplePool.referralFee = BigInt.fromI32(0);
  simplePool.totalSupply = BigInt.fromI32(0);
  simplePool.save();
}

/**
add_stable_swap_pool(
  &mut self,
  tokens: Vec<ValidAccountId>,
  decimals: Vec<u8>,
  fee: u32,
  amp_factor: u64,
) -> u64
 */
export function addStableSwapPool(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokens = (args.get("tokens") as JSONValue).toArray().map<string>(jv => jv.toString());
  const decimals = (args.get("decimals") as JSONValue).toArray().map<BigInt>(jv => jv.toBigInt());
  const fee = (args.get("fee") as JSONValue).toBigInt();
  const ampFactor = (args.get("amp_factor") as JSONValue).toBigInt();

  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  const poolId = refAccount.poolsCounter.toString();
  refAccount.poolsCounter += 1;
  refAccount.save();

  const pool = new Pool(poolId);
  pool.poolType = "STABLE_SWAP";
  pool.save();

  const stableSwapPool = new StableSwapPool(poolId);
  stableSwapPool.tokens = tokens;
  stableSwapPool.decimals = decimals;
  stableSwapPool.cAmounts = tokens.map<BigInt>(t => BigInt.fromI32(0));
  stableSwapPool.totalFee = fee;
  stableSwapPool.totalSupply = BigInt.fromI32(0);
  stableSwapPool.initAmpFactor = ampFactor;
  stableSwapPool.targetAmpFactor = ampFactor;
  stableSwapPool.initAmpTime = BigInt.fromI32(0);
  stableSwapPool.stopAmptTime = BigInt.fromI32(0);
  stableSwapPool.save();
}

/**
execute_actions(
  &mut self,
  actions: Vec<Action>,
  referral_id: Option<ValidAccountId>,
) -> ActionResult
 */
export function executeActions(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
add_liquidity(
  &mut self,
  pool_id: u64,
  amounts: Vec<U128>,
  min_amounts: Option<Vec<U128>>,
)
 */
export function addLiquidity(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
add_stable_liquidity(
  &mut self,
  pool_id: u64,
  amounts: Vec<U128>,
  min_shares: U128,
) -> U128
 */
export function addStableLiquidity(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
remove_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>)
 */
export function removeLiquidity(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
remove_liquidity_by_tokens(
  &mut self, pool_id: u64, 
  amounts: Vec<U128>, 
  max_burn_shares: U128
) -> U128
 */
export function removeLiquidityByTokens(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}

/**
swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<ValidAccountId>) -> U128
 */
export function swap(
  functionCall: near.FunctionCallAction, 
  receipt: near.ActionReceipt, 
  block: near.Block, 
  outcome: near.ExecutionOutcome
): void {

}