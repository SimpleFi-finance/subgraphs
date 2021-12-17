import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Account, CToken, Market, UserDepositBalance } from "../../generated/schema";
import {
  AccrueInterest,
  Borrow,
  Mint,
  Redeem,
  RepayBorrow,
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

export function handleMint(event: Mint): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let underlyingTokensProvided = event.params.mintAmount;
  let cTokensMinted = event.params.mintTokens;
  let minter = getOrCreateAccount(event.params.minter);

  // update market total supply
  let market = Market.load(cToken.id) as Market;
  let inputTokens = market.inputTokens as string[];
  let prevInputTokenBalances = market.inputTokenTotalBalances as string[];
  let prevInputBalance = TokenBalance.fromString(prevInputTokenBalances[0]).balance;
  let newInputBalance = prevInputBalance.plus(underlyingTokensProvided);
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newInputBalance),
  ];

  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.plus(cTokensMinted);

  updateMarket(event, market, newInputTokenBalances, newTotalSupply);

  // update user position
  mint(minter, cToken, cTokensMinted, underlyingTokensProvided, event, market);
}

export function handleRedeem(event: Redeem): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  let underlyingTokensRedeemed = event.params.redeemAmount;
  let cTokensBurned = event.params.redeemTokens;
  let redeemer = getOrCreateAccount(event.params.redeemer);

  // update market total supply
  let market = Market.load(cToken.id) as Market;
  let inputTokens = market.inputTokens as string[];
  let prevInputTokenBalances = market.inputTokenTotalBalances as string[];
  let prevInputBalance = TokenBalance.fromString(prevInputTokenBalances[0]).balance;
  let newInputBalance = prevInputBalance.minus(underlyingTokensRedeemed);
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newInputBalance),
  ];

  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.minus(cTokensBurned);

  updateMarket(event, market, newInputTokenBalances, newTotalSupply);

  // update user position
  redeem(redeemer, cToken, cTokensBurned, underlyingTokensRedeemed, event, market);
}

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

export function handleAccrueInterest(event: AccrueInterest): void {
  let cToken = CToken.load(event.address.toHexString()) as CToken;

  // update cToken state
  cToken.borrowIndex = event.params.borrowIndex;
  cToken.totalBorrows = event.params.totalBorrows;
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
  let underlyingAmount = amount.times(getExchangeRate(cToken.id));

  // update positions for sender and receiver
  redeem(from, cToken, amount, underlyingAmount, event, market);
  mint(to, cToken, amount, underlyingAmount, event, market);
}

function mint(
  minter: Account,
  cToken: CToken,
  cTokensMinted: BigInt,
  underlyingTokensProvided: BigInt,
  event: ethereum.Event,
  market: Market
): void {
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
    minter.id
  );
}

function redeem(
  redeemer: Account,
  cToken: CToken,
  cTokensAmount: BigInt,
  underlyingTokensRedeemed: BigInt,
  event: ethereum.Event,
  market: Market
): void {
  // update balance tracker
  let userBalance = getOrCreateUserDepositBalance(redeemer.id, cToken.id);
  userBalance.cTokenBalance = userBalance.cTokenBalance.minus(cTokensAmount);
  userBalance.redeemableTokensBalance = userBalance.cTokenBalance.times(getExchangeRate(cToken.id));
  userBalance.save();

  //// update user's  position

  // user's cToken is decreased by this amount
  let outputTokenAmount = cTokensAmount;

  // user redeemed `underlyingTokensRedeemed` of underlying tokens
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
    redeemer.id
  );
}
