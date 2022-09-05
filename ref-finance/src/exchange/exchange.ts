import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Market, Pool, RefAccount, Share, SimplePool, StableSwapPool, Token } from "../../generated/schema";
import { getOrCreateAccount, getOrCreateMarket, getOrCreateNEP141Token, investInMarket, parseNullableJSONAtrribute, redeemFromMarket, TokenBalance, updateMarket } from "../common";
import { ProtocolName, ProtocolType } from "../constants";
import { Fees, StableSwap } from "./stableSwap";


const ZERO = BigInt.fromI32(0);
const ONE_E_18 = BigInt.fromString("1000000000000000000000000");
const UINT_256_MAX = BigInt.fromString("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const FEE_DEVISOR = BigInt.fromI32(10000);
const ADMIN_FEE_UPGRADE_BLOCK: u64 = 55263102;
const MIN_RESERVE = BigInt.fromString("1000000000000000000");
const TARGET_DECIMAL = u32(18);

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
  pool.poolType = "SIMPLE_POOL";
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
  pool.poolType = "STABLE_SWAP";
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

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId);
  if (pool == null) {
    return;
  }
  if (pool.poolType != "SIMPLE_POOL") {
    return;
  }

  const simplePool = SimplePool.load(marketId) as SimplePool;
  const tokensLength = simplePool.tokens.length;
  const oldPoolAmounts = simplePool.amounts;
  let shares = UINT_256_MAX;

  if (simplePool.totalSupply == BigInt.fromI32(0)) {
    shares = ONE_E_18;
  } else {
    for (let i = 0; i < tokensLength; i++) {
      shares = min(shares, amounts[i].times(simplePool.totalSupply).div(oldPoolAmounts[i]));
    }

    for (let i = 0; i < tokensLength; i++) {
      amounts[i] = oldPoolAmounts[i].times(shares).div(simplePool.totalSupply);
    }
  }

  let market = Market.load(marketId) as Market;

  mintSimplePoolShares(
    simplePool,
    market,
    receipt.predecessorId,
    shares,
    amounts,
    receipt,
    outcome,
    block
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
  if (pool.poolType == "SIMPLE_POOL") {
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
      receipt.predecessorId,
      shares,
      amounts,
      receipt,
      outcome,
      block
    );
  } else {
    const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
    const oldPoolCAmounts = stableSwapPool.cAmounts;
    const cAmounts: BigInt[] = [];
    for (let i = 0; i < oldPoolCAmounts.length; i++) {
      const cAmount = oldPoolCAmounts[i].times(shares).div(stableSwapPool.totalSupply);
      cAmounts.push(cAmount);
    }

    let market = Market.load(marketId) as Market;
    redeemStablePoolShares(
      stableSwapPool,
      market,
      receipt.predecessorId,
      shares,
      cAmounts,
      receipt,
      outcome,
      block
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
  if (pool.poolType != "STABLE_SWAP") {
    return;
  }

  const returnBytes = outcome.status.toValue();
  const newShares = BigInt.fromString(json.fromBytes(returnBytes).toString());

  // Ref account exchange fee is used while adding or removing liquidity
  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
  const market = Market.load(marketId) as Market;

  const cAmounts: BigInt[] = [];
  for (let i = 0; i < amounts.length; i++) {
    cAmounts.push(amountToCAmount(stableSwapPool, amounts[i], i));
  }
  const fees = new Fees(stableSwapPool.totalFee, refAccount.exchangeFee, ZERO);

  if (stableSwapPool.totalSupply == ZERO) {
    mintStableSwapPoolShares(
      stableSwapPool,
      market,
      receipt.predecessorId,
      newShares,
      cAmounts,
      receipt,
      outcome,
      block
    );
    return;
  }

  const stableSwap = new StableSwap(block, stableSwapPool);
  const sharesAndFee = stableSwap.computeLPAmountForDeposit(
    cAmounts,
    stableSwapPool.cAmounts,
    stableSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }
  const newSharesCalculated = sharesAndFee[0];
  const feePart = sharesAndFee[1];

  mintStableSwapPoolShares(
    stableSwapPool,
    market,
    receipt.predecessorId,
    newSharesCalculated,
    cAmounts,
    receipt,
    outcome,
    block
  );

  if (feePart == ZERO) {
    return;
  }

  // No referral fee for adding liquidity method
  // Mint admin fee
  const exchangeFee = feePart.times(fees.exchangeFee).div(FEE_DEVISOR);
  mintStableSwapPoolShares(
    stableSwapPool,
    market,
    receipt.receiverId,
    exchangeFee,
    cAmounts,
    receipt,
    outcome,
    block
  );
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
  if (pool.poolType != "STABLE_SWAP") {
    return;
  }

  // Ref account exchange fee is used while adding or removing liquidity
  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
  const market = Market.load(marketId) as Market;

  const cAmounts: BigInt[] = [];
  for (let i = 0; i < amounts.length; i++) {
    cAmounts.push(amountToCAmount(stableSwapPool, amounts[i], i));
  }
  const fees = new Fees(stableSwapPool.totalFee, refAccount.exchangeFee, ZERO);

  const stableSwap = new StableSwap(block, stableSwapPool);
  const sharesAndFee = stableSwap.computeLPAmountForWithdraw(
    cAmounts,
    stableSwapPool.cAmounts,
    stableSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }
  const burnSharesCalculated = sharesAndFee[0];
  const feePart = sharesAndFee[1];

  redeemStablePoolShares(
    stableSwapPool,
    market,
    receipt.predecessorId,
    burnSharesCalculated,
    cAmounts,
    receipt,
    outcome,
    block
  );

  if (feePart == ZERO) {
    return;
  }

  // No referral fee for remove liquidity method
  // Mint admin fee
  const exchangeFee = feePart.times(fees.exchangeFee).div(FEE_DEVISOR);
  mintStableSwapPoolShares(
    stableSwapPool,
    market,
    receipt.receiverId,
    exchangeFee,
    cAmounts,
    receipt,
    outcome,
    block
  );
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

/** Internal helper functions **/

// min function as implemented in Rust std::cmp::min
function min(a: BigInt, b: BigInt): BigInt {
  if (a.le(b)) {
    return a;
  } else {
    return b;
  }
}

export function getOrCreateShare(accountId: string, poolId: string): Share {
  const sahreId = accountId.concat("-").concat(poolId);
  let share = Share.load(sahreId);
  if (share == null) {
    share = new Share(sahreId);
    share.accountId = accountId;
    share.poolId = poolId;
    share.amount = ZERO;
    share.save();
  }

  return share as Share;
}

export class SwapAction {
  poolId: BigInt
  tokenIn: string
  amountIn: BigInt | null
  tokenOut: string
  referralId: string | null

  constructor(jv: JSONValue) {
    const obj = jv.toObject();
    this.poolId = (obj.get("pool_id") as JSONValue).toBigInt();
    this.tokenIn = (obj.get("token_in") as JSONValue).toString();
    this.amountIn = parseNullableJSONAtrribute<BigInt>(
      obj,
      "amount_in",
      (jv) => BigInt.fromString(jv.toString())
    );
    this.tokenOut = (obj.get("token_out") as JSONValue).toString();
    this.referralId = null;
  }

  toString(): string {
    const ai = this.amountIn;
    const as = ai ? ai.toString() : "null";
    const ri = this.referralId;
    const rs = ri ? ri : "null";
    return this.poolId.toString().concat("|").concat(this.tokenIn).concat("|").concat(as).concat("|").concat(this.tokenOut).concat("|").concat(rs);
  }
}

export function executeSwapAction(
  swapAction: SwapAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): BigInt {
  const marketId = receipt.receiverId.concat("-").concat(swapAction.poolId.toString());

  // Update pool and calculate LP token amount
  const pool = Pool.load(marketId) as Pool;
  if (pool.poolType == "SIMPLE_POOL") {
    return executeSimplePoolSwapAction(swapAction, receipt, outcome, block);
  } else {
    return executeStableSwapAction(swapAction, receipt, outcome, block);
  }
}

function executeSimplePoolSwapAction(
  swapAction: SwapAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): BigInt {
  const amountIn = swapAction.amountIn as BigInt;
  const marketId = receipt.receiverId.concat("-").concat(swapAction.poolId.toString());
  const simplePool = SimplePool.load(marketId) as SimplePool;
  const tokens = simplePool.tokens;
  const oldPoolAmounts = simplePool.amounts;
  const amounts: BigInt[] = []; // Only for use in fee share mints

  let tokenInIndex = 0;
  let tokenOutIndex = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] == swapAction.tokenIn) {
      tokenInIndex = i;
    }

    if (tokens[i] == swapAction.tokenOut) {
      tokenOutIndex = i;
    }
    amounts.push(ZERO);
  }

  // Calculate amountOut
  const inBalance = simplePool.amounts[tokenInIndex];
  const outBalance = simplePool.amounts[tokenOutIndex];
  const amountWithFee = amountIn.times(FEE_DEVISOR.minus(simplePool.totalFee));
  const amountOut = amountWithFee.times(outBalance).div(FEE_DEVISOR.times(inBalance).plus(amountWithFee));

  // Update simplePool and Market
  const newPoolAmounts: BigInt[] = oldPoolAmounts.map<BigInt>(a => a);
  newPoolAmounts[tokenInIndex] = newPoolAmounts[tokenInIndex].plus(amountIn);
  newPoolAmounts[tokenOutIndex] = newPoolAmounts[tokenOutIndex].minus(amountOut);
  simplePool.amounts = newPoolAmounts;
  simplePool.save();

  let market = Market.load(marketId) as Market;
  const marketInputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < tokens.length; i++) {
    marketInputTokenBalances.push(new TokenBalance(simplePool.tokens[i], receipt.receiverId, newPoolAmounts[i]));
  }
  market = updateMarket(receipt, block, market, marketInputTokenBalances, simplePool.totalSupply);

  // Calculate fees to mint LP tokens for exchange and referral id
  const prevInvariant = oldPoolAmounts[tokenInIndex].times(oldPoolAmounts[tokenOutIndex]).sqrt();
  const newInvariant = newPoolAmounts[tokenInIndex].times(newPoolAmounts[tokenOutIndex]).sqrt();

  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;
  const numerator = newInvariant.minus(prevInvariant).times(simplePool.totalSupply);

  if (refAccount.exchangeFee.gt(ZERO) && numerator.gt(ZERO)) {
    let denominator: BigInt;
    if (block.header.height > ADMIN_FEE_UPGRADE_BLOCK) {
      denominator = newInvariant.times(FEE_DEVISOR).div(refAccount.exchangeFee);
    } else {
      denominator = newInvariant.times(simplePool.totalFee).div(refAccount.exchangeFee);
    }
    const exchangeFeeShares = numerator.div(denominator);
    mintSimplePoolShares(
      simplePool,
      market,
      refAccount.ownerId,
      exchangeFeeShares,
      amounts,
      receipt,
      outcome,
      block
    );
  }

  if (swapAction.referralId != null && refAccount.referralFee.gt(ZERO) && numerator.gt(ZERO)) {
    const referralSahreId = (swapAction.referralId as string).concat("-").concat(market.id);
    const referralShare = Share.load(referralSahreId);
    if (referralShare == null) {
      return amountOut;
    }
    
    let denominator: BigInt;
    if (block.header.height > ADMIN_FEE_UPGRADE_BLOCK) {
      denominator = newInvariant.times(FEE_DEVISOR).div(refAccount.referralFee);
    } else {
      denominator = newInvariant.times(simplePool.totalFee).div(refAccount.referralFee);
    }
    const referralFeeShares = numerator.div(denominator);
    mintSimplePoolShares(
      simplePool,
      market,
      swapAction.referralId as string,
      referralFeeShares,
      amounts,
      receipt,
      outcome,
      block
    );
  }

  return amountOut;
}

function executeStableSwapAction(
  swapAction: SwapAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): BigInt {
  const amountIn = swapAction.amountIn as BigInt;
  const marketId = receipt.receiverId.concat("-").concat(swapAction.poolId.toString());
  const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;

  const tokens = stableSwapPool.tokens;
  const oldPoolCAmounts = stableSwapPool.cAmounts;

  let tokenInIndex = 0;
  let tokenOutIndex = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] == swapAction.tokenIn) {
      tokenInIndex = i;
    }

    if (tokens[i] == swapAction.tokenOut) {
      tokenOutIndex = i;
    }
  }

  const cAmountIn = amountToCAmount(stableSwapPool, amountIn, tokenInIndex);
  const fees = new Fees(stableSwapPool.totalFee, refAccount.exchangeFee, refAccount.referralFee);
  const stableSwap = new StableSwap(block, stableSwapPool);
  const swapResult = stableSwap.swapTo(
    tokenInIndex,
    cAmountIn,
    tokenOutIndex,
    oldPoolCAmounts,
    fees
  );

  // Update pool and market
  const newPoolCAmounts: BigInt[] = oldPoolCAmounts.map<BigInt>(a => a);
  newPoolCAmounts[tokenInIndex] = swapResult.newSourceAmount;
  newPoolCAmounts[tokenOutIndex] = swapResult.newDestiantionAmount;
  stableSwapPool.cAmounts = newPoolCAmounts;
  stableSwapPool.save();

  let market = Market.load(marketId) as Market;
  const marketInputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const newPoolAmount = cAmountToAmount(stableSwapPool, newPoolCAmounts[i], i);
    marketInputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }
  market = updateMarket(receipt, block, market, marketInputTokenBalances, stableSwapPool.totalSupply);

  const amountSwapped = cAmountToAmount(stableSwapPool, swapResult.amountSwapped, tokenOutIndex);

  // Mint fee
  if (fees.adminFee <= ZERO) {
    return amountSwapped;
  }

  let feeToken = BigInt.fromI32(0);
  if (swapAction.referralId != null) {
    const referralSahreId = (swapAction.referralId as string).concat("-").concat(market.id);
    const referralShare = Share.load(referralSahreId);
    if (referralShare != null) {
      // fee_token = result.admin_fee * fees.referral_fee as u128 / (fees.referral_fee + fees.exchange_fee) as u128;
      feeToken = swapResult.adminFee.times(fees.referralFee).div(fees.adminFee);
      if (feeToken > ZERO) {
        adminFeeToLiquidity(
          stableSwapPool, 
          market, 
          swapAction.referralId as string,
          tokenOutIndex,
          feeToken,
          receipt,
          outcome,
          block
        );
      }
    }
  }

  // exchange fee = admin_fee - referral_fee
  feeToken = swapResult.adminFee.minus(feeToken);
  if (feeToken > ZERO) {
    adminFeeToLiquidity(
      stableSwapPool, 
      market, 
      receipt.receiverId,
      tokenOutIndex,
      feeToken,
      receipt,
      outcome,
      block
    );
  }

  return amountSwapped;
}

function adminFeeToLiquidity(
  stableSwapPool: StableSwapPool,
  market: Market,
  accountId: string,
  tokenIndex: i32,
  cAmount: BigInt,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const cAmounts: BigInt[] = [];
  for (let i = 0; i < stableSwapPool.tokens.length; i++) {
    cAmounts.push(BigInt.fromI32(0));
  }
  cAmounts[tokenIndex] = cAmount;

  const stableSwap = new StableSwap(block, stableSwapPool);
  const fees = new Fees(ZERO, ZERO, ZERO);
  const sharesAndFee = stableSwap.computeLPAmountForDeposit(
    cAmounts,
    stableSwapPool.cAmounts,
    stableSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }

  const newShares = sharesAndFee[0];
  cAmounts[tokenIndex] = ZERO;

  mintStableSwapPoolShares(
    stableSwapPool,
    market,
    accountId,
    newShares,
    cAmounts,
    receipt,
    outcome,
    block
  );
}

export function mintSimplePoolShares(
  simplePool: SimplePool,
  market: Market,
  accountId: string,
  shares: BigInt,
  amounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = simplePool.tokens.length;
  const oldPoolAmounts = simplePool.amounts;
  const newPoolAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolAmounts.push(oldPoolAmounts[i].plus(amounts[i]));
  }

  simplePool.totalSupply = simplePool.totalSupply.plus(shares);
  simplePool.amounts = newPoolAmounts;
  simplePool.save();

  const account = getOrCreateAccount(accountId);
  const accountShare = getOrCreateShare(account.id, market.id);
  accountShare.amount = accountShare.amount.plus(shares);
  accountShare.save();

  const outputTokenAmount = shares;
  const outputTokenBalance = accountShare.amount;
  const inputTokenAmounts: TokenBalance[] = [];
  const inputTokenBalances: TokenBalance[] = [];
  const marketInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    inputTokenAmounts.push(new TokenBalance(simplePool.tokens[i], account.id, amounts[i]));
    let inputTokenBalance = simplePool.totalSupply.equals(ZERO) ? ZERO : newPoolAmounts[i].times(outputTokenBalance).div(simplePool.totalSupply);
    inputTokenBalances.push(new TokenBalance(simplePool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(simplePool.tokens[i], receipt.receiverId, newPoolAmounts[i]));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, simplePool.totalSupply);

  investInMarket(
    receipt,
    outcome,
    block,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )
}

export function redeemSimplePoolShares(
  simplePool: SimplePool,
  market: Market,
  accountId: string,
  shares: BigInt,
  amounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = simplePool.tokens.length;
  const oldPoolAmounts = simplePool.amounts;
  const newPoolAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolAmounts.push(oldPoolAmounts[i].minus(amounts[i]));
  }

  simplePool.totalSupply = simplePool.totalSupply.minus(shares);
  simplePool.amounts = newPoolAmounts;
  simplePool.save();

  const account = getOrCreateAccount(accountId);
  const accountShare = getOrCreateShare(account.id, market.id);
  accountShare.amount = accountShare.amount.minus(shares);
  accountShare.save();

  const outputTokenAmount = shares;
  const outputTokenBalance = accountShare.amount;
  const inputTokenAmounts: TokenBalance[] = [];
  const inputTokenBalances: TokenBalance[] = [];
  const marketInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    inputTokenAmounts.push(new TokenBalance(simplePool.tokens[i], account.id, amounts[i]));
    let inputTokenBalance = simplePool.totalSupply.equals(ZERO) ? ZERO : newPoolAmounts[i].times(outputTokenBalance).div(simplePool.totalSupply);
    inputTokenBalances.push(new TokenBalance(simplePool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(simplePool.tokens[i], receipt.receiverId, newPoolAmounts[i]));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, simplePool.totalSupply);

  redeemFromMarket(
    receipt,
    outcome,
    block,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )
}

export function transferSimplePoolShares(
  simplePool: SimplePool,
  from: string,
  to: string,
  shares: BigInt,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const market = Market.load(simplePool.id) as Market;

  const tokensLength = simplePool.tokens.length;
  const poolAmounts = simplePool.amounts;

  // Redeem from sender account
  const fromAccount = getOrCreateAccount(from);
  const fromAccountShare = getOrCreateShare(fromAccount.id, market.id);
  fromAccountShare.amount = fromAccountShare.amount.minus(shares);
  fromAccountShare.save();

  const fromOutputTokenAmount = shares;
  const fromOutputTokenBalance = fromAccountShare.amount;
  const fromInputTokenAmounts: TokenBalance[] = [];
  const fromInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    fromInputTokenAmounts.push(new TokenBalance(simplePool.tokens[i], fromAccount.id, ZERO));
    let inputTokenBalance = simplePool.totalSupply.equals(ZERO) ? ZERO : poolAmounts[i].times(fromOutputTokenBalance).div(simplePool.totalSupply);
    fromInputTokenBalances.push(new TokenBalance(simplePool.tokens[i], fromAccount.id, inputTokenBalance));
  }

  redeemFromMarket(
    receipt,
    outcome,
    block,
    fromAccount,
    market,
    fromOutputTokenAmount,
    fromInputTokenAmounts,
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to
  )

  // Invest to receiver account
  const toAccount = getOrCreateAccount(to);
  const toAccountShare = getOrCreateShare(toAccount.id, market.id);
  toAccountShare.amount = toAccountShare.amount.plus(shares);
  toAccountShare.save();

  const toOutputTokenAmount = shares;
  const toOutputTokenBalance = toAccountShare.amount;
  const toInputTokenAmounts: TokenBalance[] = [];
  const toInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    toInputTokenAmounts.push(new TokenBalance(simplePool.tokens[i], toAccount.id, ZERO));
    let inputTokenBalance = simplePool.totalSupply.equals(ZERO) ? ZERO : poolAmounts[i].times(toOutputTokenBalance).div(simplePool.totalSupply);
    toInputTokenBalances.push(new TokenBalance(simplePool.tokens[i], toAccount.id, inputTokenBalance));
  }

  investInMarket(
    receipt,
    outcome,
    block,
    toAccount,
    market,
    toOutputTokenAmount,
    toInputTokenAmounts,
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from
  )
}

function amountToCAmount(stableSwapPool: StableSwapPool, amount: BigInt, index: i32): BigInt {
  const decimal = stableSwapPool.decimals[index];
  if (decimal.toU32() < TARGET_DECIMAL) {
    const factor = BigInt.fromI32(10).pow(u8(TARGET_DECIMAL - decimal.toU32()));
    return amount.times(factor);
  } else {
    const factor = BigInt.fromI32(10).pow(u8(decimal.toU32() - TARGET_DECIMAL));
    return amount.div(factor);
  }
}

function cAmountToAmount(stableSwapPool: StableSwapPool, cAmount: BigInt, index: i32): BigInt {
  const decimal = stableSwapPool.decimals[index];
  if (decimal.toU32() < TARGET_DECIMAL) {
    const factor = BigInt.fromI32(10).pow(u8(TARGET_DECIMAL - decimal.toU32()));
    return cAmount.div(factor);
  } else {
    const factor = BigInt.fromI32(10).pow(u8(decimal.toU32() - TARGET_DECIMAL));
    return cAmount.times(factor);
  }
}

export function mintStableSwapPoolShares(
  stableSwapPool: StableSwapPool,
  market: Market,
  accountId: string,
  shares: BigInt,
  cAmounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = stableSwapPool.tokens.length;
  const oldPoolCAmounts = stableSwapPool.cAmounts;
  const newPoolCAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolCAmounts.push(oldPoolCAmounts[i].plus(cAmounts[i]));
  }

  stableSwapPool.totalSupply = stableSwapPool.totalSupply.plus(shares);
  stableSwapPool.cAmounts = newPoolCAmounts;
  stableSwapPool.save();

  const account = getOrCreateAccount(accountId);
  const accountShare = getOrCreateShare(account.id, market.id);
  accountShare.amount = accountShare.amount.plus(shares);
  accountShare.save();

  const outputTokenAmount = shares;
  const outputTokenBalance = accountShare.amount;
  const inputTokenAmounts: TokenBalance[] = [];
  const inputTokenBalances: TokenBalance[] = [];
  const marketInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    const amount = cAmountToAmount(stableSwapPool, cAmounts[i], i);
    const newPoolAmount = cAmountToAmount(stableSwapPool, newPoolCAmounts[i], i);
    inputTokenAmounts.push(new TokenBalance(stableSwapPool.tokens[i], account.id, amount));
    let inputTokenBalance = stableSwapPool.totalSupply.equals(ZERO) ? ZERO : newPoolCAmounts[i].times(outputTokenBalance).div(stableSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(stableSwapPool, inputTokenBalance, i);
    inputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, stableSwapPool.totalSupply);

  investInMarket(
    receipt,
    outcome,
    block,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )
}

export function redeemStablePoolShares(
  stableSwapPool: StableSwapPool,
  market: Market,
  accountId: string,
  shares: BigInt,
  cAmounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = stableSwapPool.tokens.length;
  const oldPoolCAmounts = stableSwapPool.cAmounts;
  const newPoolCAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolCAmounts.push(oldPoolCAmounts[i].minus(cAmounts[i]));
  }

  stableSwapPool.totalSupply = stableSwapPool.totalSupply.minus(shares);
  stableSwapPool.cAmounts = newPoolCAmounts;
  stableSwapPool.save();

  const account = getOrCreateAccount(accountId);
  const accountShare = getOrCreateShare(account.id, market.id);
  accountShare.amount = accountShare.amount.minus(shares);
  accountShare.save();

  const outputTokenAmount = shares;
  const outputTokenBalance = accountShare.amount;
  const inputTokenAmounts: TokenBalance[] = [];
  const inputTokenBalances: TokenBalance[] = [];
  const marketInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    const amount = cAmountToAmount(stableSwapPool, cAmounts[i], i);
    const newPoolAmount = cAmountToAmount(stableSwapPool, newPoolCAmounts[i], i);
    inputTokenAmounts.push(new TokenBalance(stableSwapPool.tokens[i], account.id, amount));
    let inputTokenBalance = stableSwapPool.totalSupply.equals(ZERO) ? ZERO : newPoolCAmounts[i].times(outputTokenBalance).div(stableSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(stableSwapPool, inputTokenBalance, i);
    inputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, stableSwapPool.totalSupply);

  redeemFromMarket(
    receipt,
    outcome,
    block,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )
}

export function transferStablePoolShares(
  stableSwapPool: StableSwapPool,
  from: string,
  to: string,
  shares: BigInt,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const market = Market.load(stableSwapPool.id) as Market;

  const tokensLength = stableSwapPool.tokens.length;
  const poolCAmounts = stableSwapPool.cAmounts;

  // Redeem from sender account
  const fromAccount = getOrCreateAccount(from);
  const fromAccountShare = getOrCreateShare(fromAccount.id, market.id);
  fromAccountShare.amount = fromAccountShare.amount.minus(shares);
  fromAccountShare.save();

  const fromOutputTokenAmount = shares;
  const fromOutputTokenBalance = fromAccountShare.amount;
  const fromInputTokenAmounts: TokenBalance[] = [];
  const fromInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    fromInputTokenAmounts.push(new TokenBalance(stableSwapPool.tokens[i], fromAccount.id, ZERO));
    let inputTokenBalance = stableSwapPool.totalSupply.equals(ZERO) ? ZERO : poolCAmounts[i].times(fromOutputTokenBalance).div(stableSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(stableSwapPool, inputTokenBalance, i);
    fromInputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], fromAccount.id, inputTokenBalance));
  }

  redeemFromMarket(
    receipt,
    outcome,
    block,
    fromAccount,
    market,
    fromOutputTokenAmount,
    fromInputTokenAmounts,
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to
  )

  // Invest to receiver account
  const toAccount = getOrCreateAccount(to);
  const toAccountShare = getOrCreateShare(toAccount.id, market.id);
  toAccountShare.amount = toAccountShare.amount.plus(shares);
  toAccountShare.save();

  const toOutputTokenAmount = shares;
  const toOutputTokenBalance = toAccountShare.amount;
  const toInputTokenAmounts: TokenBalance[] = [];
  const toInputTokenBalances: TokenBalance[] = [];

  for (let i = 0; i < tokensLength; i++) {
    toInputTokenAmounts.push(new TokenBalance(stableSwapPool.tokens[i], toAccount.id, ZERO));
    let inputTokenBalance = stableSwapPool.totalSupply.equals(ZERO) ? ZERO : poolCAmounts[i].times(toOutputTokenBalance).div(stableSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(stableSwapPool, inputTokenBalance, i);
    toInputTokenBalances.push(new TokenBalance(stableSwapPool.tokens[i], toAccount.id, inputTokenBalance));
  }

  investInMarket(
    receipt,
    outcome,
    block,
    toAccount,
    market,
    toOutputTokenAmount,
    toInputTokenAmounts,
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from
  )
}