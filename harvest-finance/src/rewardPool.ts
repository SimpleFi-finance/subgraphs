import { Market } from "../generated/schema";
import {
  RewardPaid,
  Staked,
  Withdrawn,
} from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance } from "./common";
import { getOrCreatePositionInRewardPool, getOrCreateRewardPool } from "./harvestUtils";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { RewardPool as RewardPoolContract } from "../generated/templates/RewardPool/RewardPool";

/**
 * Handle user staking fTokens to RewardPool
 * @param event
 */
export function handleStaked(event: Staked): void {
  let rewardPool = getOrCreateRewardPool(event, event.address.toHexString());
  let stakedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  // update fToken balance tracker
  let position = getOrCreatePositionInRewardPool(user, rewardPool);
  position.fTokenBalance = position.fTokenBalance.plus(stakedAmount);
  position.save();

  // update position by calling invest in market
  let market = Market.load(rewardPool.lpToken);
  let outputTokenAmount = stakedAmount;
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(rewardPool.lpToken, user.id, stakedAmount),
  ];
  let rewardTokenAmounts: TokenBalance[] = [];
  let outputTokenBalance = position.fTokenBalance;
  let inputTokeneBalances = [new TokenBalance(rewardPool.lpToken, user.id, position.fTokenBalance)];
  let rewardTokenBalances = [
    new TokenBalance(rewardPool.rewardToken, user.id, earned(user.id, rewardPool.id)),
  ];

  investInMarket(
    event,
    user,
    market!,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokeneBalances,
    rewardTokenBalances,
    null
  );
}

/**
 * Handle user withdrawing fTokens from RewardPool
 * @param event
 */
export function handleWithdrawn(event: Withdrawn): void {
  let rewardPool = getOrCreateRewardPool(event, event.address.toHexString());
  let amountWithdrawn = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  // update fToken balance tracker
  let position = getOrCreatePositionInRewardPool(user, rewardPool);
  position.fTokenBalance = position.fTokenBalance.minus(amountWithdrawn);
  position.save();

  // update position by calling redeem from market
  let market = Market.load(rewardPool.lpToken);
  let outputTokenAmount = amountWithdrawn;
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(rewardPool.lpToken, user.id, amountWithdrawn),
  ];
  let rewardTokenAmounts: TokenBalance[] = [];
  let outputTokenBalance = position.fTokenBalance;
  let inputTokeneBalances = [new TokenBalance(rewardPool.lpToken, user.id, position.fTokenBalance)];
  let rewardTokenBalances = [
    new TokenBalance(rewardPool.rewardToken, user.id, earned(user.id, rewardPool.id)),
  ];

  redeemFromMarket(
    event,
    user,
    market!,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokeneBalances,
    rewardTokenBalances,
    null
  );
}

/**
 * Update user's position when reward is paid out.
 * @param event
 */
export function handleRewardPaid(event: RewardPaid): void {
  let rewardPool = getOrCreateRewardPool(event, event.address.toHexString());
  let rewardAmount = event.params.reward;
  let user = getOrCreateAccount(event.params.user);

  let position = getOrCreatePositionInRewardPool(user, rewardPool);

  // update position by calling redeem from market
  let market = Market.load(rewardPool.lpToken);
  let outputTokenAmount = BigInt.fromI32(0);
  let inputTokenAmounts: TokenBalance[] = [];
  let rewardTokenAmounts = [new TokenBalance(rewardPool.rewardToken, user.id, rewardAmount)];
  let outputTokenBalance = position.fTokenBalance;
  let inputTokeneBalances = [new TokenBalance(rewardPool.lpToken, user.id, position.fTokenBalance)];
  let rewardTokenBalances = [
    new TokenBalance(rewardPool.rewardToken, user.id, earned(user.id, rewardPool.id)),
  ];

  redeemFromMarket(
    event,
    user,
    market!,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokeneBalances,
    rewardTokenBalances,
    null
  );
}

/**
 * Return amount of reward tokens user can claim
 * @param user
 * @param rewardPool
 * @returns
 */
function earned(user: string, rewardPool: string): BigInt {
  let rewardPoolContract = RewardPoolContract.bind(Address.fromString(rewardPool));
  return rewardPoolContract.earned(Address.fromString(user));
}
