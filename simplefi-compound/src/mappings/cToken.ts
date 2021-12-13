import { CToken, Market, UserDepositBalance } from "../../generated/schema";
import { Mint, Redeem } from "../../generated/templates/CToken/CToken";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "../library/common";
import { getOrCreateUserDepositBalance } from "../library/cTokenUtils";

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

  // update custom entity
  let userBalance = getOrCreateUserDepositBalance(minter.id, cToken.id);
  userBalance.cTokenBalance = userBalance.cTokenBalance.plus(cTokensMinted);
  // userBalance.redeemableTokensBalance = userBalance.cTokenBalance.mul(TODO - MULTIPLIER)
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

  // update custom entity
  let userBalance = getOrCreateUserDepositBalance(redeemer.id, cToken.id);
  userBalance.cTokenBalance = userBalance.cTokenBalance.minus(cTokensBurned);
  // userBalance.redeemableTokensBalance = userBalance.cTokenBalance.mul(TODO - MULTIPLIER)
  userBalance.save();

  //// update user's  position

  // user's cToken is decreased by this amount
  let outputTokenAmount = cTokensBurned;

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
