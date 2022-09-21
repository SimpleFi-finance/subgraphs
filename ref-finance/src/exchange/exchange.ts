import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Pool, RatedSwapPool, RefAccount, SimplePool, StableSwapPool, Token, TokenRate } from "../../generated/schema";
import { getOrCreateMarket, getOrCreateNEP141Token, parseNullableJSONAtrribute } from "../common";
import { ProtocolName, ProtocolType } from "../constants";
import { SwapAction } from "./commonExchange";
import { addRatedSwapLiquidity, executeRatedSwapAction, removeRatedLiquidityByShares, removeRatedLiquidityByTokens } from "./ratedExchange";
import { addSimpleLiquidity, executeSimpleSwapAction, removeSimpleLiquidity } from "./simpleExchange";
import { addStableSwapLiquidity, executeStableSwapAction, removeStableLiquidityByShares, removeStableLiquidityByTokens } from "./stableExchange";


const ADMIN_FEE_UPGRADE_BLOCK: u64 = 55263102;
const POOL_TYPE_SIMPLE = "SIMPLE_POOL";
const POOL_TYPE_STABLE = "STABLE_SWAP";
const POOL_TYPE_RATED = "RATED_POOL";

/**
pub fn new(owner_id: ValidAccountId, exchange_fee: u32, referral_fee: u32) -> Self
 */
export function initRefV2(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const ownerId = (args.get("owner_id") as JSONValue).toString();
  const exchangeFee = (args.get("exchange_fee") as JSONValue).toBigInt();
  const referralFee = (args.get("referral_fee") as JSONValue).toBigInt();

  const refAccount = new RefAccount(receipt.receiverId);
  refAccount.ownerId = ownerId;
  refAccount.exchangeFee = exchangeFee;
  refAccount.referralFee = referralFee;
  refAccount.save();
}

/**
add_simple_pool(&mut self, tokens: Vec<ValidAccountId>, fee: u32) -> u64
 */
export function addSimplePool(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokens = (args.get("tokens") as JSONValue).toArray().map<string>(jv => jv.toString());
  const fee = (args.get("fee") as JSONValue).toBigInt();

  const returnBytes = outcome.status.toValue();
  const poolId = json.fromBytes(returnBytes).toBigInt()
  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());
  const pool = new Pool(marketId);
  pool.poolType = POOL_TYPE_SIMPLE;
  pool.receiptId = receipt.id;
  pool.save();

  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;

  const simplePool = new SimplePool(marketId);
  simplePool.tokens = tokens;
  simplePool.amounts = tokens.map<BigInt>(t => BigInt.fromI32(0));
  // Version 1.4.1 deployed at block number - 55263102
  // the fee arugment is supposed to be total_fee instead of only pool swap fee
  // after this 1.4.1 deployment
  if (block.header.height > ADMIN_FEE_UPGRADE_BLOCK) {
    simplePool.totalFee = fee;
  } else {
    simplePool.totalFee = fee.plus(refAccount.exchangeFee).plus(refAccount.referralFee);
  }
  simplePool.exchangeFee = refAccount.exchangeFee;
  simplePool.referralFee = refAccount.referralFee;
  simplePool.totalSupply = BigInt.fromI32(0);
  simplePool.save();

  const inputTokens: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = getOrCreateNEP141Token(block, tokens[i]);
    inputTokens.push(token);
  };
  const outputToken = getOrCreateNEP141Token(block, poolId.toString());

  const market = getOrCreateMarket(
    block,
    marketId,
    ProtocolName.REF_FINANCE,
    ProtocolType.EXCHANGE,
    inputTokens,
    outputToken,
    []
  );

  outputToken.mintedByMarket = market.id;
  outputToken.save();
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokens = (args.get("tokens") as JSONValue).toArray().map<string>(jv => jv.toString());
  const decimals = (args.get("decimals") as JSONValue).toArray().map<BigInt>(jv => jv.toBigInt());
  const fee = (args.get("fee") as JSONValue).toBigInt();
  const ampFactor = (args.get("amp_factor") as JSONValue).toBigInt();

  const returnBytes = outcome.status.toValue();
  const poolId = json.fromBytes(returnBytes).toBigInt()
  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());
  const pool = new Pool(marketId);
  pool.poolType = POOL_TYPE_STABLE;
  pool.receiptId = receipt.id;
  pool.save();

  const stableSwapPool = new StableSwapPool(marketId);
  stableSwapPool.tokens = tokens;
  stableSwapPool.decimals = decimals;
  stableSwapPool.cAmounts = tokens.map<BigInt>(t => BigInt.fromI32(0));
  stableSwapPool.totalFee = fee;
  stableSwapPool.totalSupply = BigInt.fromI32(0);
  stableSwapPool.initAmpFactor = ampFactor;
  stableSwapPool.targetAmpFactor = ampFactor;
  stableSwapPool.initAmpTime = BigInt.fromI32(0);
  stableSwapPool.stopAmpTime = BigInt.fromI32(0);
  stableSwapPool.save();

  const inputTokens: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = getOrCreateNEP141Token(block, tokens[i]);
    inputTokens.push(token);
  };
  const outputToken = getOrCreateNEP141Token(block, poolId.toString());

  const market = getOrCreateMarket(
    block,
    marketId,
    ProtocolName.REF_FINANCE,
    ProtocolType.EXCHANGE,
    inputTokens,
    outputToken,
    []
  )

  outputToken.mintedByMarket = market.id;
  outputToken.save();
}

/**
pub fn add_rated_swap_pool(
  &mut self,
  tokens: Vec<ValidAccountId>,
  decimals: Vec<u8>,
  fee: u32,
  amp_factor: u64,
) -> u64
 */
export function addRatedSwapPool(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokens = (args.get("tokens") as JSONValue).toArray().map<string>(jv => jv.toString());
  const decimals = (args.get("decimals") as JSONValue).toArray().map<BigInt>(jv => jv.toBigInt());
  const fee = (args.get("fee") as JSONValue).toBigInt();
  const ampFactor = (args.get("amp_factor") as JSONValue).toBigInt();

  const returnBytes = outcome.status.toValue();
  const poolId = json.fromBytes(returnBytes).toBigInt()
  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());
  const pool = new Pool(marketId);
  pool.poolType = POOL_TYPE_RATED;
  pool.receiptId = receipt.id;
  pool.save();

  const ratedSwapPool = new RatedSwapPool(marketId);
  ratedSwapPool.tokens = tokens;
  ratedSwapPool.decimals = decimals;
  ratedSwapPool.cAmounts = tokens.map<BigInt>(t => BigInt.fromI32(0));
  ratedSwapPool.totalFee = fee;
  ratedSwapPool.totalSupply = BigInt.fromI32(0);
  ratedSwapPool.initAmpFactor = ampFactor;
  ratedSwapPool.targetAmpFactor = ampFactor;
  ratedSwapPool.initAmpTime = BigInt.fromI32(0);
  ratedSwapPool.stopAmpTime = BigInt.fromI32(0);
  ratedSwapPool.save();

  const inputTokens: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = getOrCreateNEP141Token(block, tokens[i]);
    const tokenRate = getOrCreateTokenRate(tokens[i]);
    inputTokens.push(token);
  };
  const outputToken = getOrCreateNEP141Token(block, poolId.toString());

  const market = getOrCreateMarket(
    block,
    marketId,
    ProtocolName.REF_FINANCE,
    ProtocolType.EXCHANGE,
    inputTokens,
    outputToken,
    []
  )

  outputToken.mintedByMarket = market.id;
  outputToken.save();
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  swap(functionCall, receipt, outcome, block);
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  const amounts = (args.get("amounts") as JSONValue).toArray().map<BigInt>(jv => BigInt.fromString(jv.toString()));

  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());

  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

  if (pool.poolType != POOL_TYPE_SIMPLE) {
    return;
  }

  addSimpleLiquidity(
    functionCall,
    receipt,
    outcome,
    block,
    pool,
    amounts
  );
}

/**
remove_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>)
 */
export function removeLiquidity(
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
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  const amounts = (args.get("amounts") as JSONValue).toArray().map<BigInt>(jv => BigInt.fromString(jv.toString()));

  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

  if (pool.poolType == POOL_TYPE_STABLE) {
    addStableSwapLiquidity(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      amounts
    );
  } else if (pool.poolType != POOL_TYPE_RATED) {
    addRatedSwapLiquidity(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      amounts
    );
  } else {
    return;
  }
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
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const poolId = (args.get("pool_id") as JSONValue).toBigInt();
  const amounts = (args.get("amounts") as JSONValue).toArray().map<BigInt>(jv => BigInt.fromString(jv.toString()));

  const marketId = receipt.receiverId.concat("-").concat(poolId.toString());

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }

  if (pool.poolType == POOL_TYPE_STABLE) {
    removeStableLiquidityByTokens(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      amounts
    );
  } else if (pool.poolType != POOL_TYPE_RATED) {
    removeRatedLiquidityByTokens(
      functionCall,
      receipt,
      outcome,
      block,
      pool,
      amounts
    );
  } else {
    return;
  }
}

/**
swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<ValidAccountId>) -> U128
 */
export function swap(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const actions = (args.get("actions") as JSONValue).toArray().map<SwapAction>(jv => new SwapAction(jv));
  const referralId: string | null = parseNullableJSONAtrribute<string>(
    args,
    "referral_id",
    (jv) => jv.toString()
  );
  let result: BigInt | null = null;

  for (let i = 0; i < actions.length; i++) {
    actions[i].amountIn = actions[i].amountIn ? actions[i].amountIn : result;
    actions[i].referralId = referralId;
    result = executeSwapAction(actions[i], receipt, outcome, block);
  }
}

/**
pub fn update_token_rate_callback(&mut self, token_id: AccountId)
 */
export function updateTokenRateCallback(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const tokenId = (args.get("token_id") as JSONValue).toString();

  const tokenRate = TokenRate.load(tokenId);
  if (tokenRate == null) {
    return;
  }

  const logs = outcome.logs;
  const updateLog = logs[0];
  const parts = updateLog.split(" ");
  const rate = BigInt.fromString(parts[5]);

  tokenRate.rate = rate;
  tokenRate.lastUpdateTime = BigInt.fromU64(block.header.timestampNanosec);
  tokenRate.save();
}

/** Internal helper functions **/

export function executeSwapAction(
  swapAction: SwapAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): BigInt {
  const marketId = receipt.receiverId.concat("-").concat(swapAction.poolId.toString());

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId) as Pool;
  if (pool.poolType == POOL_TYPE_SIMPLE) {
    return executeSimpleSwapAction(swapAction, receipt, outcome, block);
  } else if (pool.poolType == POOL_TYPE_STABLE) {
    return executeStableSwapAction(swapAction, receipt, outcome, block);
  } else if (pool.poolType == POOL_TYPE_RATED) {
    return executeRatedSwapAction(swapAction, receipt, outcome, block);
  } else {
    return BigInt.fromI32(0);
  }
}

function getOrCreateTokenRate(tokenId: string): TokenRate {
  let tokenRate = TokenRate.load(tokenId);
  if (tokenRate != null) {
    return tokenRate;
  }

  tokenRate = new TokenRate(tokenId);
  tokenRate.rate = BigInt.fromString("1000000000000000000000000");
  tokenRate.lastUpdateTime = BigInt.fromI32(0);
  tokenRate.save();

  return tokenRate;
}