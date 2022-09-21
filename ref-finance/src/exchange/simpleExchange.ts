import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Market, Pool, RefAccount, Share, SimplePool } from "../../generated/schema";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance, updateMarket } from "../common";
import { getOrCreateShare, SwapAction } from "./commonExchange";


const ZERO = BigInt.fromI32(0);
const ONE_E_24 = BigInt.fromString("1000000000000000000000000");
const UINT_256_MAX = BigInt.fromString("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const FEE_DEVISOR = BigInt.fromI32(10000);
const ADMIN_FEE_UPGRADE_BLOCK: u64 = 55263102;

export function addSimpleLiquidity(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  amounts: BigInt[]
): void {
  const marketId = pool.id;

  const simplePool = SimplePool.load(marketId) as SimplePool;
  const tokensLength = simplePool.tokens.length;
  const oldPoolAmounts = simplePool.amounts;
  let shares = UINT_256_MAX;

  if (simplePool.totalSupply == BigInt.fromI32(0)) {
    shares = ONE_E_24;
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

export function removeSimpleLiquidity(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  pool: Pool,
  shares: BigInt
): void {
  const marketId = pool.id;

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
}

// min function as implemented in Rust std::cmp::min
function min(a: BigInt, b: BigInt): BigInt {
  if (a.le(b)) {
    return a;
  } else {
    return b;
  }
}

export function executeSimpleSwapAction(
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