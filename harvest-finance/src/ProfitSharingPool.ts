import { Market } from "../generated/schema";
import {
  RewardPaid,
  Staked,
  Withdrawn,
} from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance } from "./common";
import {
  getOrCreatePositionInProfitSharingPool,
  getOrCreateProfitSharingPool,
} from "./harvestUtils";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { ProfitSharingPool as ProfitSharingPoolContract } from "../generated/templates/ProfitSharingPool/ProfitSharingPool";

/**
 * Handle staking of FARM tokens
 * @param event
 */
export function handleStaked(event: Staked): void {
  let profitSharingPool = getOrCreateProfitSharingPool(event, event.address.toHexString());
  let stakedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  // update staked balance tracker
  let position = getOrCreatePositionInProfitSharingPool(user, profitSharingPool);
  position.stakedBalance = position.stakedBalance.plus(stakedAmount);
  position.save();

  // update position by calling invest in market
  let market = Market.load(profitSharingPool.lpToken);
  let outputTokenAmount = stakedAmount;
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(profitSharingPool.lpToken, user.id, stakedAmount),
  ];
  let rewardTokenAmounts: TokenBalance[] = [];
  let outputTokenBalance = position.stakedBalance;
  let inputTokeneBalances = [
    new TokenBalance(profitSharingPool.lpToken, user.id, position.stakedBalance),
  ];
  let rewardTokenBalances = [
    new TokenBalance(profitSharingPool.rewardToken, user.id, earned(user.id, profitSharingPool.id)),
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
 * Handle user withdrawing FARM tokens from ProfitSharingPool
 * @param event
 */
export function handleWithdrawn(event: Withdrawn): void {
  let ProfitSharingPool = getOrCreateProfitSharingPool(event, event.address.toHexString());
  let amountWithdrawn = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  // update balance tracker
  let position = getOrCreatePositionInProfitSharingPool(user, ProfitSharingPool);
  position.stakedBalance = position.stakedBalance.minus(amountWithdrawn);
  position.save();

  // update position by calling redeem from market
  let market = Market.load(ProfitSharingPool.id);
  let outputTokenAmount = amountWithdrawn;
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(ProfitSharingPool.lpToken, user.id, amountWithdrawn),
  ];
  let rewardTokenAmounts: TokenBalance[] = [];
  let outputTokenBalance = position.stakedBalance;
  let inputTokeneBalances = [
    new TokenBalance(ProfitSharingPool.lpToken, user.id, position.stakedBalance),
  ];
  let rewardTokenBalances = [
    new TokenBalance(ProfitSharingPool.rewardToken, user.id, earned(user.id, ProfitSharingPool.id)),
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
  let profitSharingPool = getOrCreateProfitSharingPool(event, event.address.toHexString());
  let rewardAmount = event.params.reward;
  let user = getOrCreateAccount(event.params.user);

  let position = getOrCreatePositionInProfitSharingPool(user, profitSharingPool);

  // update position by calling redeem from market
  let market = Market.load(profitSharingPool.id);
  let outputTokenAmount = BigInt.fromI32(0);
  let inputTokenAmounts: TokenBalance[] = [];
  let rewardTokenAmounts = [new TokenBalance(profitSharingPool.rewardToken, user.id, rewardAmount)];
  let outputTokenBalance = position.stakedBalance;
  let inputTokeneBalances = [
    new TokenBalance(profitSharingPool.lpToken, user.id, position.stakedBalance),
  ];
  let rewardTokenBalances = [
    new TokenBalance(profitSharingPool.rewardToken, user.id, earned(user.id, profitSharingPool.id)),
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
 * @param ProfitSharingPool
 * @returns
 */
function earned(user: string, ProfitSharingPool: string): BigInt {
  let profitSharingPoolContract = ProfitSharingPoolContract.bind(
    Address.fromString(ProfitSharingPool)
  );
  return profitSharingPoolContract.earned(Address.fromString(user));
}
