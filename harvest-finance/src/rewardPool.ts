import { Market } from "../generated/schema";
import {
  RewardPaid,
  Staked,
  Withdrawn,
} from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import { getOrCreateAccount, redeemFromMarket, TokenBalance } from "./common";
import { getOrCreatePositionInRewardPool, getOrCreateRewardPool } from "./harvestUtils";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { RewardPool as RewardPoolContract } from "../generated/templates/RewardPool/RewardPool";

export function handleStaked(event: Staked): void {
  // to do
}

export function handleWithdrawn(event: Withdrawn): void {
  // to do
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

  // update position by doing redeem from market call
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
