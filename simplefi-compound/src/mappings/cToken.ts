import { BigInt, ethereum } from "@graphprotocol/graph-ts";

import { CToken, Market } from "../../generated/schema";

import {
  AccrueInterest,
  AccrueInterest1,
  Borrow,
  Mint,
  Redeem,
  RepayBorrow,
  ReservesAdded,
  ReservesReduced,
  Transfer,
} from "../../generated/templates/CToken/CToken";

import {
  borrowFromMarket,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  repayToMarket,
  TokenBalance,
  updateMarket,
} from "../library/common";

import {
  getCollateralAmountLocked,
  getExchangeRate,
  getOrCreateUserBorrowBalance,
  getOrCreateUserDepositBalance,
} from "../library/cTokenUtils";

/**
 * Handle user's deposit to CToken market - update user's position and market state.
 *
 * @param event
 */
export function handleMint(event: Mint): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let underlyingTokensProvided = event.params.mintAmount;
  let cTokensMinted = event.params.mintTokens;
  let minter = getOrCreateAccount(event.params.minter);

  // update cToken state
  cToken.totalSupply = cToken.totalSupply.plus(cTokensMinted);
  cToken.save();

  // update market total supply
  let market = Market.load(cToken.id) as Market;
  let newTotalSupply = cToken.totalSupply;

  let inputTokens = market.inputTokens as string[];
  let newInputBalance = newTotalSupply.times(getExchangeRate(cToken.id));
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newInputBalance),
  ];

  updateMarket(event, market, newInputTokenBalances, newTotalSupply);

  // update balance tracker
  let userBalance = getOrCreateUserDepositBalance(minter.id, cToken.id);
  userBalance.cTokenBalance = userBalance.cTokenBalance.plus(cTokensMinted);
  userBalance.redeemableTokensBalance = userBalance.cTokenBalance.times(getExchangeRate(cToken.id));
  userBalance.save();

  //// update user's  position

  // user's cToken is increased by this amount
  let outputTokenAmount = cTokensMinted;

  // user sent `underlyingTokensProvided` of underlying tokens
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(cToken.underlying, minter.id, underlyingTokensProvided),
  ];

  // user's total balance of cTokens
  let outputTokenBalance = userBalance.cTokenBalance;

  // number of tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(cToken.underlying, minter.id, userBalance.redeemableTokensBalance),
  ];

  investInMarket(
    event,
    minter,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  );
}

/**
 * Handle user's withdrawal from CToken market - update user's position and market state.
 *
 * @param event
 */
export function handleRedeem(event: Redeem): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let underlyingTokensRedeemed = event.params.redeemAmount;
  let cTokensBurned = event.params.redeemTokens;
  let redeemer = getOrCreateAccount(event.params.redeemer);

  // update cToken state
  cToken.totalSupply = cToken.totalSupply.minus(cTokensBurned);
  cToken.save();

  // update market total supply
  let market = Market.load(cToken.id) as Market;
  let newTotalSupply = cToken.totalSupply;

  let inputTokens = market.inputTokens as string[];
  let newInputBalance = newTotalSupply.times(getExchangeRate(cToken.id));
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newInputBalance),
  ];

  updateMarket(event, market, newInputTokenBalances, newTotalSupply);

  // update balance tracker
  let userBalance = getOrCreateUserDepositBalance(redeemer.id, cToken.id);
  userBalance.cTokenBalance = userBalance.cTokenBalance.minus(cTokensBurned);
  userBalance.redeemableTokensBalance = userBalance.cTokenBalance.times(getExchangeRate(cToken.id));
  userBalance.save();

  //// update user's  position

  // user's cToken is decreased by this amount
  let outputTokenAmount = cTokensBurned;

  // user received `underlyingTokensRedeemed` of underlying tokens
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(cToken.underlying, redeemer.id, underlyingTokensRedeemed),
  ];

  // user's total balance of cTokens
  let outputTokenBalance = userBalance.cTokenBalance;

  // number of tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(cToken.underlying, redeemer.id, userBalance.redeemableTokensBalance),
  ];

  redeemFromMarket(
    event,
    redeemer,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  );
}

/**
 * Handle user's borrowing from CToken market - update user's position and market state.
 *
 * @param event
 */
export function handleBorrow(event: Borrow): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let accountBorrows = event.params.accountBorrows;
  let totalBorrows = event.params.totalBorrows;
  let borrowAmount = event.params.borrowAmount;
  let borrower = getOrCreateAccount(event.params.borrower);

  // update debt balance tracker
  let userBalance = getOrCreateUserBorrowBalance(borrower.id, cToken.id);
  userBalance.principal = accountBorrows;
  userBalance.interestIndex = cToken.borrowIndex;
  userBalance.save();

  // update total amount borrowed
  cToken.totalBorrows = totalBorrows;
  cToken.save();

  // update market total supply
  let market = Market.load(cToken.id + "-BORROW") as Market;
  let inputTokens = market.inputTokens as string[];
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, getCollateralAmountLocked(cToken.id, totalBorrows)),
  ];

  updateMarket(event, market, newInputTokenBalances, totalBorrows);

  ////// update user's position

  // amount of debt taken
  let outputTokenAmount = borrowAmount;

  // amount of collateral locked because of debt taken in this TX
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(
      inputTokens[0],
      borrower.id,
      getCollateralAmountLocked(cToken.id, borrowAmount)
    ),
  ];

  // total balance of user's debt in this market
  let outputTokenBalance = accountBorrows;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(
      inputTokens[0],
      borrower.id,
      getCollateralAmountLocked(cToken.id, accountBorrows)
    )
  );

  borrowFromMarket(
    event,
    borrower,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    []
  );
}

/**
 * Handle user's debt repayment to CToken market - update user's position and market state.
 *
 * @param event
 */
export function handleRepayBorrow(event: RepayBorrow): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let accountBorrows = event.params.accountBorrows;
  let totalBorrows = event.params.totalBorrows;
  let repayAmount = event.params.repayAmount;
  let borrowPayer = getOrCreateAccount(event.params.payer);
  let borrower = getOrCreateAccount(event.params.borrower);

  // update debt balance tracker
  let userBalance = getOrCreateUserBorrowBalance(borrower.id, cToken.id);
  userBalance.principal = accountBorrows;
  userBalance.interestIndex = cToken.borrowIndex;
  userBalance.save();

  // update total amount borrowed
  cToken.totalBorrows = totalBorrows;
  cToken.save();

  // update market total supply
  let market = Market.load(cToken.id + "-BORROW") as Market;
  let inputTokens = market.inputTokens as string[];
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, getCollateralAmountLocked(cToken.id, totalBorrows)),
  ];

  updateMarket(event, market, newInputTokenBalances, totalBorrows);

  ////// update user's position

  // amount of debt repaid
  let outputTokenAmount = repayAmount;

  // amount of collateral locked after debt repaid in this TX
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(
      inputTokens[0],
      borrower.id,
      getCollateralAmountLocked(cToken.id, repayAmount)
    ),
  ];

  // total balance of user's debt in this market
  let outputTokenBalance = accountBorrows;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(
      inputTokens[0],
      borrower.id,
      getCollateralAmountLocked(cToken.id, accountBorrows)
    )
  );

  repayToMarket(
    event,
    borrower,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    []
  );
}

/**
 * Update market state when borrow interest is accrued
 * @param event
 */
export function handleAccrueInterest(event: AccrueInterest): void {
  accrueInterest(
    event,
    event.address.toHexString(),
    event.params.borrowIndex,
    event.params.totalBorrows,
    event.params.cashPrior
  );
}

/**
 * Update market state when borrow interest is accrued
 * @param event
 */
export function handleAccrueInterest1(event: AccrueInterest1): void {
  accrueInterest(
    event,
    event.address.toHexString(),
    event.params.borrowIndex,
    event.params.totalBorrows,
    BigInt.fromI32(0)
  );
}

/**
 * Handle transfer of CTokens - update sender's and receiver's position.
 *
 * @param event
 * @returns
 */
export function handleTransfer(event: Transfer): void {
  let cTokenAddress = event.address;

  // don't handle mint/redeem cases
  if (event.params.from == cTokenAddress || event.params.to == cTokenAddress) {
    return;
  }

  let cToken = CToken.load(event.address.toHexString()) as CToken;
  let amount = event.params.amount;
  let from = getOrCreateAccount(event.params.from);
  let to = getOrCreateAccount(event.params.to);

  let market = Market.load(cToken.id) as Market;

  // update positions for sender and receiver

  // update sender's balance tracker
  let senderBalance = getOrCreateUserDepositBalance(from.id, cToken.id);
  senderBalance.cTokenBalance = senderBalance.cTokenBalance.minus(amount);
  senderBalance.redeemableTokensBalance = senderBalance.cTokenBalance.times(
    getExchangeRate(cToken.id)
  );
  senderBalance.save();

  //// update user's  position

  // user's cToken is decreased by this amount
  let outputTokenAmount = amount;

  // no underlying tokens moved
  let inputTokensAmount: TokenBalance[] = [];

  // user's total balance of cTokens
  let outputTokenBalance = senderBalance.cTokenBalance;

  // number of tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(cToken.underlying, from.id, senderBalance.redeemableTokensBalance),
  ];

  redeemFromMarket(
    event,
    from,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    to.id
  );

  ////////////////////////////////////////////////////////////////////////////

  // update receiver's balance tracker
  let receiverBalance = getOrCreateUserDepositBalance(to.id, cToken.id);
  receiverBalance.cTokenBalance = receiverBalance.cTokenBalance.plus(amount);
  receiverBalance.redeemableTokensBalance = receiverBalance.cTokenBalance.times(
    getExchangeRate(cToken.id)
  );
  receiverBalance.save();

  //// update receiver's  position

  // user's total balance of cTokens
  outputTokenBalance = receiverBalance.cTokenBalance;

  // number of tokens that can be redeemed by user
  inputTokenBalances = [
    new TokenBalance(cToken.underlying, to.id, receiverBalance.redeemableTokensBalance),
  ];

  investInMarket(
    event,
    to,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    from.id
  );
}

/**
 * Update state of market reserves
 * @param event
 */
export function handleReservesAdded(event: ReservesAdded): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  cToken.totalReserves = event.params.newTotalReserves;
  cToken.save();
}

/**
 * Update state of market reserves
 * @param event
 */
export function handleReservesReduced(event: ReservesReduced): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  cToken.totalReserves = event.params.newTotalReserves;
  cToken.save();
}

/**
 * Update market state when borrow interest in accured.
 *
 * @param event
 * @param cTokenAddress
 * @param borrowIndex
 * @param totalBorrows
 * @param cashPrior
 */
function accrueInterest(
  event: ethereum.Event,
  cTokenAddress: string,
  borrowIndex: BigInt,
  totalBorrows: BigInt,
  cashPrior: BigInt
): void {
  let cToken = CToken.load(cTokenAddress) as CToken;

  // update cToken state
  cToken.borrowIndex = borrowIndex;
  cToken.totalBorrows = totalBorrows;
  if (cashPrior != BigInt.fromI32(0)) {
    cToken.cash = cashPrior;
  }
  cToken.save();

  // update market total supply
  let market = Market.load(cToken.id + "-BORROW") as Market;
  let inputTokens = market.inputTokens as string[];
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(
      inputTokens[0],
      market.id,
      getCollateralAmountLocked(cToken.id, cToken.totalBorrows)
    ),
  ];

  updateMarket(event, market, newInputTokenBalances, cToken.totalBorrows);
}
