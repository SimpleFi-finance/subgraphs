import { Burn, Mint, Initialized, BalanceTransfer } from "../../generated/templates/AToken/AToken";

import { Market } from "../../generated/schema";

import {
  updateMarket,
  TokenBalance,
  ADDRESS_ZERO,
  getOrCreateAccount,
  redeemFromMarket,
  investInMarket,
} from "../library/common";

import {
  getOrCreateAToken,
  getOrCreateIncentivesController,
  getOrCreateUserInvestmentBalance,
} from "../library/lendingPoolUtils";
import { rayDiv, rayMul } from "../library/math";

/**
 * Update market and user position after deposit is made.
 * @param event
 */
export function handleATokenMint(event: Mint): void {
  let aToken = getOrCreateAToken(event.address.toHexString());
  let market = Market.load(aToken.lendingPool + "-" + aToken.underlyingAsset) as Market;

  let mintedAmount = event.params.value;
  let liquidityIndex = event.params.index;
  let scaledMintedAmount = rayDiv(mintedAmount, liquidityIndex);

  // update market total supply
  let prevScaledTotalSupply = market.outputTokenTotalSupply;
  let newScaledTotalSupply = prevScaledTotalSupply.plus(scaledMintedAmount);

  let inputTokens = market.inputTokens as string[];
  let newTotalATokenSupply = rayMul(newScaledTotalSupply, liquidityIndex);
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalATokenSupply),
  ];

  updateMarket(event, market, newInputTokenBalances, newScaledTotalSupply);

  /// increase user's investment balance
  let user = getOrCreateAccount(event.params.from);
  let investmentBalance = getOrCreateUserInvestmentBalance(user.id, market.id);
  investmentBalance.scaledATokenBalance = investmentBalance.scaledATokenBalance.plus(
    scaledMintedAmount
  );
  investmentBalance.aTokenBalance = rayMul(investmentBalance.scaledATokenBalance, liquidityIndex);
  investmentBalance.save();

  //// update user's  position

  // user's scaled balance is decreased by this amount
  let outputTokenAmount = scaledMintedAmount;

  // user sent `mintedAmount` of underlying tokens
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, user.id, mintedAmount),
  ];

  // user's total scaled balance of aTokens
  let outputTokenBalance = investmentBalance.scaledATokenBalance;

  // number of tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, user.id, investmentBalance.aTokenBalance),
  ];

  investInMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    user.id
  );
}

/**
 * Update market and user position after withdrawal is made.
 * @param event
 */
export function handleATokenBurn(event: Burn): void {
  let aToken = getOrCreateAToken(event.address.toHexString());
  let market = Market.load(aToken.lendingPool + "-" + aToken.underlyingAsset) as Market;

  let burnedAmount = event.params.value;
  let liquidityIndex = event.params.index;
  let scaledBurnedAmount = rayDiv(burnedAmount, liquidityIndex);

  // update market total supply
  let prevScaledTotalSupply = market.outputTokenTotalSupply;
  let newScaledTotalSupply = prevScaledTotalSupply.minus(scaledBurnedAmount);

  let inputTokens = market.inputTokens as string[];
  let newTotalATokenSupply = rayMul(newScaledTotalSupply, liquidityIndex);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newScaledTotalSupply),
  ];
  updateMarket(event, market, inputTokenBalances, newTotalATokenSupply);

  /// decrease user's investment balance
  let user = getOrCreateAccount(event.params.from);
  let investmentBalance = getOrCreateUserInvestmentBalance(user.id, market.id);
  investmentBalance.scaledATokenBalance = investmentBalance.scaledATokenBalance.minus(
    scaledBurnedAmount
  );
  investmentBalance.aTokenBalance = rayMul(investmentBalance.scaledATokenBalance, liquidityIndex);
  investmentBalance.save();

  //// update user's  position

  // user's scaled balance is decreased by this amount
  let outputTokenAmount = scaledBurnedAmount;

  // user received `burnedAmount` of underlying asset
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, user.id, burnedAmount),
  ];

  // user's total scaled balance of aTokens
  let outputTokenBalance = investmentBalance.scaledATokenBalance;

  // number of tokens that can be redeemed by user
  let toInputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, user.id, investmentBalance.aTokenBalance),
  ];

  redeemFromMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    toInputTokenBalances,
    [],
    user.id
  );
}

/**
 * Update position of sender and receiver when aTokens are transferred.
 * @param event
 */
export function handleATokenTransfer(event: BalanceTransfer): void {
  let from = getOrCreateAccount(event.params.from);
  let to = getOrCreateAccount(event.params.to);

  let amountTransfered = event.params.value;
  let liquidityIndex = event.params.index;
  let scaledAmountTransfered = rayDiv(amountTransfered, liquidityIndex);

  let aToken = getOrCreateAToken(event.address.toHexString());
  let marketId = aToken.lendingPool + "-" + aToken.underlyingAsset;

  // decrease sender's balance of provided tokens
  let fromInvestmentBalance = getOrCreateUserInvestmentBalance(from.id, marketId);
  fromInvestmentBalance.scaledATokenBalance = fromInvestmentBalance.scaledATokenBalance.minus(
    scaledAmountTransfered
  );
  fromInvestmentBalance.aTokenBalance = rayMul(
    fromInvestmentBalance.scaledATokenBalance,
    liquidityIndex
  );
  fromInvestmentBalance.save();

  //// update sender's  position

  let market = Market.load(marketId) as Market;

  // sender's scaled balance is decreased by this amount
  let fromOutputTokenAmount = scaledAmountTransfered;

  // sender sent `amountTransfered` of aTokens
  let fromInputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, from.id, amountTransfered),
  ];

  // user's total scaled balance of aTokens
  let fromOutputTokenBalance = fromInvestmentBalance.scaledATokenBalance;

  // number of tokens that can be redeemed by sender
  let fromInputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, from.id, fromInvestmentBalance.aTokenBalance),
  ];

  redeemFromMarket(
    event,
    from,
    market,
    fromOutputTokenAmount,
    fromInputTokensAmount,
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to.id
  );

  //// update receiver's position

  // increase to's balance of provided tokens
  let toInvestmentBalance = getOrCreateUserInvestmentBalance(to.id, marketId);
  toInvestmentBalance.scaledATokenBalance = toInvestmentBalance.scaledATokenBalance.plus(
    scaledAmountTransfered
  );
  toInvestmentBalance.aTokenBalance = rayMul(
    toInvestmentBalance.scaledATokenBalance,
    liquidityIndex
  );
  toInvestmentBalance.save();

  // receiver's scaled balance is decreased by this amount
  let receiverOutputTokenAmount = scaledAmountTransfered;

  // receiver received `amountTransfered` of aTokens
  let toInputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, to.id, amountTransfered),
  ];

  // receiver's total scaled balance of aTokens
  let toOutputTokenBalance = toInvestmentBalance.scaledATokenBalance;

  // number of tokens that can be redeemed by receiver
  let toInputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, to.id, toInvestmentBalance.aTokenBalance),
  ];

  investInMarket(
    event,
    to,
    market,
    receiverOutputTokenAmount,
    toInputTokensAmount,
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from.id
  );
}

/**
 * Store aToken info when it is initialized.
 * @param event
 * @returns
 */
export function handleATokenInitialized(event: Initialized): void {
  let aTokenAdress = event.address.toHexString();
  let aToken = getOrCreateAToken(aTokenAdress);

  aToken.underlyingAsset = event.params.underlyingAsset.toHexString();
  aToken.treasury = event.params.treasury.toHexString();
  aToken.lendingPool = event.params.pool.toHexString();
  aToken.incentivesController = event.params.incentivesController.toHexString();
  aToken.aTokenName = event.params.aTokenName;
  aToken.aTokenSymbol = event.params.aTokenSymbol;
  aToken.aTokenDecimals = event.params.aTokenDecimals;
  aToken.save();

  if (aToken.incentivesController != ADDRESS_ZERO) {
    // create incentive controller if it's not already created
    getOrCreateIncentivesController(event, aToken.incentivesController, aToken.lendingPool);
  }
}
