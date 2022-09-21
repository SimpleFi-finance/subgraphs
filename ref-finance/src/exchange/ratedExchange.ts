import { BigInt, json, near } from "@graphprotocol/graph-ts";
import { Market, Pool, RatedSwapPool, RefAccount, Share, TokenRate } from "../../generated/schema";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance, updateMarket } from "../common";
import { getOrCreateShare, SwapAction } from "./commonExchange";
import { RatedSwap } from "./ratedSwap";
import { Fees } from "./stableSwap";


const ZERO = BigInt.fromI32(0);
const FEE_DEVISOR = BigInt.fromI32(10000);
const TARGET_DECIMAL = u32(24);
const ONE_E_24 = BigInt.fromString("1000000000000000000000000");

export function addRatedSwapLiquidity(
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
  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const market = Market.load(marketId) as Market;

  const cAmounts: BigInt[] = [];
  for (let i = 0; i < amounts.length; i++) {
    cAmounts.push(amountToCAmount(ratedSwapPool, amounts[i], i));
  }
  const fees = new Fees(ratedSwapPool.totalFee, refAccount.exchangeFee, ZERO);

  if (ratedSwapPool.totalSupply == ZERO) {
    mintRatedSwapPoolShares(
      ratedSwapPool,
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

  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const sharesAndFee = ratedSwap.computeLPAmountForDeposit(
    cAmounts,
    ratedSwapPool.cAmounts,
    ratedSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }
  const newSharesCalculated = sharesAndFee[0];
  const feePart = sharesAndFee[1];

  mintRatedSwapPoolShares(
    ratedSwapPool,
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
  mintRatedSwapPoolShares(
    ratedSwapPool,
    market,
    receipt.receiverId,
    exchangeFee,
    cAmounts,
    receipt,
    outcome,
    block
  );
}

export function removeRatedLiquidityByShares(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  shares: BigInt
): void {
  const marketId = pool.id;

  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const oldPoolCAmounts = ratedSwapPool.cAmounts;
  const cAmounts: BigInt[] = [];
  for (let i = 0; i < oldPoolCAmounts.length; i++) {
    const cAmount = oldPoolCAmounts[i].times(shares).div(ratedSwapPool.totalSupply);
    cAmounts.push(cAmount);
  }

  let market = Market.load(marketId) as Market;
  redeemRatedPoolShares(
    ratedSwapPool,
    market,
    receipt.predecessorId,
    shares,
    cAmounts,
    receipt,
    outcome,
    block
  );
}

export function removeRatedLiquidityByTokens(
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
  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const market = Market.load(marketId) as Market;

  const cAmounts: BigInt[] = [];
  for (let i = 0; i < amounts.length; i++) {
    cAmounts.push(amountToCAmount(ratedSwapPool, amounts[i], i));
  }
  const fees = new Fees(ratedSwapPool.totalFee, refAccount.exchangeFee, ZERO);

  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const sharesAndFee = ratedSwap.computeLPAmountForWithdraw(
    cAmounts,
    ratedSwapPool.cAmounts,
    ratedSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }
  const burnSharesCalculated = sharesAndFee[0];
  const feePart = sharesAndFee[1];

  redeemRatedPoolShares(
    ratedSwapPool,
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
  mintRatedSwapPoolShares(
    ratedSwapPool,
    market,
    receipt.receiverId,
    exchangeFee,
    cAmounts,
    receipt,
    outcome,
    block
  );
}

export function executeRatedSwapAction(
  swapAction: SwapAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): BigInt {
  const amountIn = swapAction.amountIn as BigInt;
  const marketId = receipt.receiverId.concat("-").concat(swapAction.poolId.toString());
  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const refAccount = RefAccount.load(receipt.receiverId) as RefAccount;

  const tokens = ratedSwapPool.tokens;
  const oldPoolCAmounts = ratedSwapPool.cAmounts;

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

  const cAmountIn = amountToCAmount(ratedSwapPool, amountIn, tokenInIndex);
  const fees = new Fees(ratedSwapPool.totalFee, refAccount.exchangeFee, refAccount.referralFee);
  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const swapResult = ratedSwap.swapTo(
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
  ratedSwapPool.cAmounts = newPoolCAmounts;
  ratedSwapPool.save();

  let market = Market.load(marketId) as Market;
  const marketInputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const newPoolAmount = cAmountToAmount(ratedSwapPool, newPoolCAmounts[i], i);
    marketInputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }
  market = updateMarket(receipt, block, market, marketInputTokenBalances, ratedSwapPool.totalSupply);

  const amountSwapped = cAmountToAmount(ratedSwapPool, swapResult.amountSwapped, tokenOutIndex);

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
          ratedSwapPool,
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
      ratedSwapPool,
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

/** Internal helper functions **/

function adminFeeToLiquidity(
  ratedSwapPool: RatedSwapPool,
  market: Market,
  accountId: string,
  tokenIndex: i32,
  cAmount: BigInt,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const cAmounts: BigInt[] = [];
  for (let i = 0; i < ratedSwapPool.tokens.length; i++) {
    cAmounts.push(BigInt.fromI32(0));
  }
  cAmounts[tokenIndex] = cAmount;

  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const fees = new Fees(ZERO, ZERO, ZERO);
  const sharesAndFee = ratedSwap.computeLPAmountForDeposit(
    cAmounts,
    ratedSwapPool.cAmounts,
    ratedSwapPool.totalSupply,
    fees
  );

  if (sharesAndFee == null) {
    return;
  }

  const newShares = sharesAndFee[0];
  cAmounts[tokenIndex] = ZERO;

  mintRatedSwapPoolShares(
    ratedSwapPool,
    market,
    accountId,
    newShares,
    cAmounts,
    receipt,
    outcome,
    block
  );
}

function amountToCAmount(ratedSwapPool: RatedSwapPool, amount: BigInt, index: i32): BigInt {
  const decimal = ratedSwapPool.decimals[index];
  if (decimal.toU32() < TARGET_DECIMAL) {
    const factor = BigInt.fromI32(10).pow(u8(TARGET_DECIMAL - decimal.toU32()));
    return amount.times(factor);
  } else {
    const factor = BigInt.fromI32(10).pow(u8(decimal.toU32() - TARGET_DECIMAL));
    return amount.div(factor);
  }
}

function cAmountToAmount(ratedSwapPool: RatedSwapPool, cAmount: BigInt, index: i32): BigInt {
  const decimal = ratedSwapPool.decimals[index];
  if (decimal.toU32() < TARGET_DECIMAL) {
    const factor = BigInt.fromI32(10).pow(u8(TARGET_DECIMAL - decimal.toU32()));
    return cAmount.div(factor);
  } else {
    const factor = BigInt.fromI32(10).pow(u8(decimal.toU32() - TARGET_DECIMAL));
    return cAmount.times(factor);
  }
}

export function mintRatedSwapPoolShares(
  ratedSwapPool: RatedSwapPool,
  market: Market,
  accountId: string,
  shares: BigInt,
  cAmounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = ratedSwapPool.tokens.length;
  const oldPoolCAmounts = ratedSwapPool.cAmounts;
  const newPoolCAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolCAmounts.push(oldPoolCAmounts[i].plus(cAmounts[i]));
  }

  ratedSwapPool.totalSupply = ratedSwapPool.totalSupply.plus(shares);
  ratedSwapPool.cAmounts = newPoolCAmounts;
  ratedSwapPool.save();

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
    const amount = cAmountToAmount(ratedSwapPool, cAmounts[i], i);
    const newPoolAmount = cAmountToAmount(ratedSwapPool, newPoolCAmounts[i], i);
    inputTokenAmounts.push(new TokenBalance(ratedSwapPool.tokens[i], account.id, amount));
    let inputTokenBalance = ratedSwapPool.totalSupply.equals(ZERO) ? ZERO : newPoolCAmounts[i].times(outputTokenBalance).div(ratedSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(ratedSwapPool, inputTokenBalance, i);
    inputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, ratedSwapPool.totalSupply);

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

export function redeemRatedPoolShares(
  ratedSwapPool: RatedSwapPool,
  market: Market,
  accountId: string,
  shares: BigInt,
  cAmounts: BigInt[],
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const tokensLength = ratedSwapPool.tokens.length;
  const oldPoolCAmounts = ratedSwapPool.cAmounts;
  const newPoolCAmounts: BigInt[] = [];

  for (let i = 0; i < tokensLength; i++) {
    newPoolCAmounts.push(oldPoolCAmounts[i].minus(cAmounts[i]));
  }

  ratedSwapPool.totalSupply = ratedSwapPool.totalSupply.minus(shares);
  ratedSwapPool.cAmounts = newPoolCAmounts;
  ratedSwapPool.save();

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
    const amount = cAmountToAmount(ratedSwapPool, cAmounts[i], i);
    const newPoolAmount = cAmountToAmount(ratedSwapPool, newPoolCAmounts[i], i);
    inputTokenAmounts.push(new TokenBalance(ratedSwapPool.tokens[i], account.id, amount));
    let inputTokenBalance = ratedSwapPool.totalSupply.equals(ZERO) ? ZERO : newPoolCAmounts[i].times(outputTokenBalance).div(ratedSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(ratedSwapPool, inputTokenBalance, i);
    inputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], account.id, inputTokenBalance));
    marketInputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], receipt.receiverId, newPoolAmount));
  }

  market = updateMarket(receipt, block, market, marketInputTokenBalances, ratedSwapPool.totalSupply);

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

export function transferRatedPoolShares(
  ratedSwapPool: RatedSwapPool,
  from: string,
  to: string,
  shares: BigInt,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const market = Market.load(ratedSwapPool.id) as Market;

  const tokensLength = ratedSwapPool.tokens.length;
  const poolCAmounts = ratedSwapPool.cAmounts;

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
    fromInputTokenAmounts.push(new TokenBalance(ratedSwapPool.tokens[i], fromAccount.id, ZERO));
    let inputTokenBalance = ratedSwapPool.totalSupply.equals(ZERO) ? ZERO : poolCAmounts[i].times(fromOutputTokenBalance).div(ratedSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(ratedSwapPool, inputTokenBalance, i);
    fromInputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], fromAccount.id, inputTokenBalance));
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
    toInputTokenAmounts.push(new TokenBalance(ratedSwapPool.tokens[i], toAccount.id, ZERO));
    let inputTokenBalance = ratedSwapPool.totalSupply.equals(ZERO) ? ZERO : poolCAmounts[i].times(toOutputTokenBalance).div(ratedSwapPool.totalSupply);
    inputTokenBalance = cAmountToAmount(ratedSwapPool, inputTokenBalance, i);
    toInputTokenBalances.push(new TokenBalance(ratedSwapPool.tokens[i], toAccount.id, inputTokenBalance));
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

function getRates(ratedSwapPool: RatedSwapPool): BigInt[] {
  const rates: BigInt[] = [];
  const tokensLength = ratedSwapPool.tokens.length;
  for (let i = 0; i < tokensLength; i++) {
    const rate = TokenRate.load(ratedSwapPool.tokens[i]);
    if (rate == null) {
      rates.push(ONE_E_24);
    } else {
      rates.push(rate.rate);
    }
  }
  return rates;
}

export function ratedRampAmp(
  block: near.Block,
  marketId: string,
  futureAmpFactor: BigInt,
  futureAmpTime: BigInt
): void {
  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const ampFactor = ratedSwap.computeAmpFactor();
  ratedSwapPool.initAmpFactor = ampFactor;
  ratedSwapPool.initAmpTime = BigInt.fromU64(block.header.timestampNanosec);
  ratedSwapPool.targetAmpFactor = futureAmpFactor;
  ratedSwapPool.stopAmpTime = futureAmpTime;
  ratedSwapPool.save();
}

export function ratedStopRampAmp(
  block: near.Block,
  marketId: string
): void {
  const ratedSwapPool = RatedSwapPool.load(marketId) as RatedSwapPool;
  const rates = getRates(ratedSwapPool);
  const ratedSwap = new RatedSwap(block, ratedSwapPool, rates);
  const ampFactor = ratedSwap.computeAmpFactor();
  const currentTime = BigInt.fromU64(block.header.timestampNanosec);
  ratedSwapPool.initAmpFactor = ampFactor;
  ratedSwapPool.initAmpTime = currentTime;
  ratedSwapPool.targetAmpFactor = ampFactor;
  ratedSwapPool.stopAmpTime = currentTime;
  ratedSwapPool.save();
}