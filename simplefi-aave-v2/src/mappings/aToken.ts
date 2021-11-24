import { Burn, Mint, Initialized, BalanceTransfer } from "../../generated/templates/AToken/AToken";

import { Market, AToken } from "../../generated/schema";

import {
  updateMarket,
  TokenBalance,
  ADDRESS_ZERO,
  getOrCreateAccount,
  redeemFromMarket,
  investInMarket,
} from "../library/common";

import {
  aTokenTotalSupply,
  getOrCreateIncentivesController,
  getOrCreateUserInvestmentBalance,
  getOrCreateUserRewardBalances,
  getRedeemeableAmountOfTokens,
} from "../library/lendingPoolUtils";

export function handleATokenMint(event: Mint): void {
  let mintedAmount = event.params.value;

  let aToken = AToken.load(event.address.toHexString());
  let market = Market.load(aToken.lendingPool + "-" + aToken.underlyingAsset) as Market;

  // update market total supply
  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.plus(mintedAmount);

  let inputTokens = market.inputTokens as string[];
  let scaledATokens = aTokenTotalSupply(market, event);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, scaledATokens),
  ];
  updateMarket(event, market, inputTokenBalances, newTotalSupply);
}

export function handleATokenBurn(event: Burn): void {
  let burnedAmount = event.params.value;

  let aToken = AToken.load(event.address.toHexString());
  let market = Market.load(aToken.lendingPool + "-" + aToken.underlyingAsset) as Market;

  // update market total supply
  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.minus(burnedAmount);

  let inputTokens = market.inputTokens as string[];
  let scaledATokens = aTokenTotalSupply(market, event);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, scaledATokens),
  ];
  updateMarket(event, market, inputTokenBalances, newTotalSupply);
}

export function handleATokenInitialized(event: Initialized): void {
  let aTokenAdress = event.address.toHexString();

  let aToken = AToken.load(aTokenAdress);
  if (aToken == null) {
    aToken = new AToken(aTokenAdress);
  }

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

export function handleATokenTransfer(event: BalanceTransfer): void {
  let from = getOrCreateAccount(event.params.from);
  let to = getOrCreateAccount(event.params.to);
  let amount = event.params.value;

  let aToken = AToken.load(event.address.toHexString());
  let marketId = aToken.lendingPool + "-" + aToken.underlyingAsset;

  // decrease from's balance of provided tokens
  let fromInvestmentBalance = getOrCreateUserInvestmentBalance(from.id, marketId);
  fromInvestmentBalance.underlyingTokenProvidedAmount = fromInvestmentBalance.underlyingTokenProvidedAmount.minus(
    amount
  );
  fromInvestmentBalance.save();

  // increase to's balance of provided tokens
  let toInvestmentBalance = getOrCreateUserInvestmentBalance(to.id, marketId);
  toInvestmentBalance.underlyingTokenProvidedAmount = toInvestmentBalance.underlyingTokenProvidedAmount.plus(
    amount
  );
  toInvestmentBalance.save();

  //// update sender's  position

  let market = Market.load(marketId) as Market;

  // sender sent `amount` of tokens
  let fromInputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, from.id, amount),
  ];

  // number of tokens that can be redeemed by sender
  let fromRedeemableAmount = getRedeemeableAmountOfTokens(fromInvestmentBalance, event);
  let fromInputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, from.id, fromRedeemableAmount),
  ];

  // reward token amounts claimable by user
  let rewardTokens = market.rewardTokens as string[];
  let fromUnclaimedRewards = getOrCreateUserRewardBalances(from.id).unclaimedRewards;
  let fromRewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], from.id, fromUnclaimedRewards),
  ];

  redeemFromMarket(
    event,
    from,
    market,
    amount,
    fromInputTokensAmount,
    [],
    fromInvestmentBalance.underlyingTokenProvidedAmount,
    fromInputTokenBalances,
    fromRewardTokenBalances,
    to.id
  );

  //// update receiver's position

  // receiver received `amount` of tokens
  let toInputTokensAmount: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, to.id, amount),
  ];

  // number of tokens that can be redeemed by receiver
  let toRedeemableAmount = getRedeemeableAmountOfTokens(toInvestmentBalance, event);
  let toInputTokenBalances: TokenBalance[] = [
    new TokenBalance(aToken.underlyingAsset, to.id, toRedeemableAmount),
  ];

  // reward token amounts claimable by user
  let toUnclaimedRewards = getOrCreateUserRewardBalances(to.id).unclaimedRewards;
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], to.id, toUnclaimedRewards),
  ];

  investInMarket(
    event,
    to,
    market,
    amount,
    toInputTokensAmount,
    [],
    fromInvestmentBalance.underlyingTokenProvidedAmount,
    toInputTokenBalances,
    rewardTokenBalances,
    from.id
  );
}
