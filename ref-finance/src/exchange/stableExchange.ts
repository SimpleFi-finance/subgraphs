import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Market, Pool, RefAccount, Share, StableSwapPool } from "../../generated/schema";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance, updateMarket } from "../common";
import { getOrCreateShare, SwapAction } from "./commonExchange";
import { Fees, StableSwap } from "./stableSwap";


const ZERO = BigInt.fromI32(0);
const FEE_DEVISOR = BigInt.fromI32(10000);
const TARGET_DECIMAL = u32(18);

export function addStableSwapLiquidity(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  amounts: BigInt[]
): void {
  const marketId = pool.id;

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

export function removeStableLiquidityByShares(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  shares: BigInt
): void {
  const marketId = pool.id;
  
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

export function removeStableLiquidityByTokens(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  amounts: BigInt[]
): void {
  const marketId = pool.id;
  
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

export function executeStableSwapAction(
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

export function stableRampAmp(
  block: near.Block,
  marketId: string,
  futureAmpFactor: BigInt,
  futureAmpTime: BigInt
): void {
  const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
  const stableSwap = new StableSwap(block, stableSwapPool);
  const ampFactor = stableSwap.computeAmpFactor();
  stableSwapPool.initAmpFactor = ampFactor;
  stableSwapPool.initAmpTime = BigInt.fromU64(block.header.timestampNanosec);
  stableSwapPool.targetAmpFactor = futureAmpFactor;
  stableSwapPool.stopAmpTime = futureAmpTime;
  stableSwapPool.save();
}

export function stableStopRampAmp(
  block: near.Block,
  marketId: string
): void {
  const stableSwapPool = StableSwapPool.load(marketId) as StableSwapPool;
  const stableSwap = new StableSwap(block, stableSwapPool);
  const ampFactor = stableSwap.computeAmpFactor();
  const currentTime = BigInt.fromU64(block.header.timestampNanosec);
  stableSwapPool.initAmpFactor = ampFactor;
  stableSwapPool.initAmpTime = currentTime;
  stableSwapPool.targetAmpFactor = ampFactor;
  stableSwapPool.stopAmpTime = currentTime;
  stableSwapPool.save();
}

/** Internal helper functions **/

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