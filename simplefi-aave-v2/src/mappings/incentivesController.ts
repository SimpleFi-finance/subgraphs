import { Address, BigInt } from "@graphprotocol/graph-ts";

import {
  RewardsClaimed,
  RewardsAccrued,
} from "../../generated/templates/IncentivesController/AaveIncentivesController";
import { Market, IncentivesController } from "../../generated/schema";

import { getOrCreateUserRewardBalance } from "../library/lendingPoolUtils";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "../library/common";

export function handleRewardsClaimed(event: RewardsClaimed): void {
  let userAddress = event.params.user.toHexString();
  let amount = event.params.amount;
  let to = event.params.to.toHexString();

  // keep track of total rewards
  let user = getOrCreateUserRewardBalance(userAddress);
  user.claimedRewards = user.claimedRewards.plus(amount);
  user.unclaimedRewards = user.unclaimedRewards.minus(amount);
  user.save();

  ////// update user's position

  // staking market which controlls rewards
  let incentivesController = IncentivesController.load(event.address.toHexString());
  let marketId = incentivesController.lendingPool + "-" + event.address.toHexString();
  let market = Market.load(marketId) as Market;

  // user whose position is updated
  let account = getOrCreateAccount(Address.fromString(userAddress));

  // no change as only rewards are claimed
  let outputTokenAmount = BigInt.fromI32(0);

  // no change as only rewards are claimed
  let inputTokensAmount: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenAmounts: TokenBalance[] = [new TokenBalance(rewardTokens[0], to, amount)];

  // TODO - for now there is no definition of output token for incentive controller
  // use 1 instead of 0 in order to keep reward position open at all times
  let outputTokenBalance = BigInt.fromI32(1);

  // TODO - for now there is no definition of input token for incentive controlelr
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, user.unclaimedRewards),
  ];

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokensAmount,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

export function handleRewardsAccrued(event: RewardsAccrued): void {
  let userAddress = event.params.user.toHexString();
  let amount = event.params.amount;

  // keep track of total rewards
  let user = getOrCreateUserRewardBalance(userAddress);
  user.lifetimeRewards = user.lifetimeRewards.plus(amount);
  user.unclaimedRewards = user.unclaimedRewards.plus(amount);
  user.save();

  ////// update user's position

  // staking market which controlls rewards
  let incentivesController = IncentivesController.load(event.address.toHexString());
  let marketId = incentivesController.lendingPool + "-" + event.address.toHexString();
  let market = Market.load(marketId) as Market;

  // user whose position is updated
  let account = getOrCreateAccount(Address.fromString(userAddress));

  // no change
  let outputTokenAmount = BigInt.fromI32(0);

  // no change
  let inputTokensAmount: TokenBalance[] = [];

  // no change
  let rewardTokenAmounts: TokenBalance[] = [];

  // TODO - for now there is no definition of output token for incentive controller
  // use 1 instead of 0 in order to keep reward position open at all times
  let outputTokenBalance = BigInt.fromI32(1);

  // TODO - for now there is no definition of input token for incentive controller
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, user.unclaimedRewards),
  ];

  // use common function to update position and store transaction
  investInMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokensAmount,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}
