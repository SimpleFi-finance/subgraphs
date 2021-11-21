import { Address, BigInt, ethereum, store, log } from "@graphprotocol/graph-ts";

import {
  RewardsClaimed,
  RewardsAccrued,
} from "../../generated/templates/IncentivesController/AaveIncentivesController";
import { RewardsClaim, RewardsAccrue, Market } from "../../generated/schema";

import { getOrCreateAaveUser, getOrInitReserve } from "../library/lendingPoolUtils";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
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
  let user = getOrCreateAaveUser(userAddress);
  user.claimedRewards = user.claimedRewards.plus(claim.amount);
  user.unclaimedRewards = user.unclaimedRewards.minus(claim.amount);
  user.save();

  ////// update user's position

  // staking market which controlls rewards
  let market = Market.load(event.address.toHexString()) as Market;

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

  /// TODO this should be collateral amount in ETH
  let outputTokenBalance = BigInt.fromI32(0);

  /// TODO this should be collateral amount in ETH
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
  let entity = new RewardsAccrue(event.transaction.hash.toHexString() + "-" + userAddress);
  entity.user = userAddress;
  entity.amount = event.params.amount;
  entity.save();

  // keep track of total rewards
  let user = getOrCreateAaveUser(userAddress);
  user.lifetimeRewards = user.lifetimeRewards.plus(entity.amount);
  user.unclaimedRewards = user.unclaimedRewards.plus(entity.amount);
  user.save();
}
