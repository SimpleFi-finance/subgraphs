import { Address, BigInt, ethereum, store, log, dataSource } from "@graphprotocol/graph-ts";

import {
  RewardsClaimed,
  RewardsAccrued,
} from "../../generated/templates/IncentivesController/AaveIncentivesController";
import {
  RewardsClaim,
  RewardsAccrue,
  Market,
  IncentivesController,
  UserAccountData,
} from "../../generated/schema";

import { getOrCreateUserRewardBalance } from "../library/lendingPoolUtils";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "../library/common";

export function handleRewardsClaimed(event: RewardsClaimed): void {
  let userAddress = event.params.user.toHexString();

  // create entity
  let claim = new RewardsClaim(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  claim.user = event.params.user.toHexString();
  claim.to = event.params.to.toHexString();
  claim.claimer = event.params.claimer.toHexString();
  claim.amount = event.params.amount;
  claim.save();

  // keep track of total rewards
  let user = getOrCreateUserRewardBalance(userAddress);
  user.claimedRewards = user.claimedRewards.plus(claim.amount);
  user.unclaimedRewards = user.unclaimedRewards.minus(claim.amount);
  user.save();

  ////// update user's position

  // staking market which controlls rewards
  let incentivesController = IncentivesController.load(event.address.toHexString());
  let marketId = incentivesController.lendingPool + "-" + event.address.toHexString();
  let market = Market.load(marketId) as Market;

  // user whose position is updated
  let account = getOrCreateAccount(Address.fromString(claim.user));

  // no change as only rewards are claimed
  let outputTokenAmount = BigInt.fromI32(0);

  // no change as only rewards are claimed
  let inputTokensAmount: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenAmounts: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], claim.to, claim.amount),
  ];

  // TODO - for now there is no definition of output token for incentive controlelr
  let outputTokenBalance = BigInt.fromI32(0);

  // TODO - for now there is no definition of input token for incentive controlelr
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], claim.user, user.unclaimedRewards),
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

  // create reward accrual entity so it can be processed by upcoming lendingPool events
  let accrue = new RewardsAccrue(event.transaction.hash.toHexString() + "-" + userAddress);
  accrue.user = userAddress;
  accrue.amount = event.params.amount;
  accrue.save();

  // keep track of total rewards
  let user = getOrCreateUserRewardBalance(userAddress);
  user.lifetimeRewards = user.lifetimeRewards.plus(accrue.amount);
  user.unclaimedRewards = user.unclaimedRewards.plus(accrue.amount);
  user.save();

  ////// update user's position

  // staking market which controlls rewards
  let incentivesController = IncentivesController.load(event.address.toHexString());
  let marketId = incentivesController.lendingPool + "-" + event.address.toHexString();
  let market = Market.load(marketId) as Market;

  // user whose position is updated
  let account = getOrCreateAccount(Address.fromString(accrue.user));

  // no change
  let outputTokenAmount = BigInt.fromI32(0);

  // no change
  let inputTokensAmount: TokenBalance[] = [];

  // no change
  let rewardTokenAmounts: TokenBalance[] = [];

  // TODO - for now there is no definition of output token for incentive controller
  let outputTokenBalance = BigInt.fromI32(0);

  // TODO - for now there is no definition of input token for incentive controller
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], accrue.user, user.unclaimedRewards),
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
