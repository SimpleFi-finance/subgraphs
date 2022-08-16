import { Market, RewardClaim } from "../generated/schema";
import {
  RewardPaid,
  Staked,
  Withdrawn,
} from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";
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

  //// update market state
  let market = Market.load(profitSharingPool.id);
  profitSharingPool.totalSupply = profitSharingPool.totalSupply.plus(stakedAmount);
  profitSharingPool.save();
  let marketInputTokeneBalances = [
    new TokenBalance(
      profitSharingPool.lpToken,
      profitSharingPool.id,
      profitSharingPool.totalSupply
    ),
  ];
  updateMarket(event, market!, marketInputTokeneBalances, profitSharingPool.totalSupply);

  // update staked balance tracker
  let position = getOrCreatePositionInProfitSharingPool(user, profitSharingPool);
  position.stakedBalance = position.stakedBalance.plus(stakedAmount);
  position.save();

  // update position by calling invest in market
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
  let profitSharingPool = getOrCreateProfitSharingPool(event, event.address.toHexString());
  let amountWithdrawn = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  //// update market state
  let market = Market.load(profitSharingPool.id);
  profitSharingPool.totalSupply = profitSharingPool.totalSupply.minus(amountWithdrawn);
  profitSharingPool.save();
  let marketInputTokeneBalances = [
    new TokenBalance(
      profitSharingPool.lpToken,
      profitSharingPool.id,
      profitSharingPool.totalSupply
    ),
  ];
  updateMarket(event, market!, marketInputTokeneBalances, profitSharingPool.totalSupply);

  // update balance tracker
  let position = getOrCreatePositionInProfitSharingPool(user, profitSharingPool);
  position.stakedBalance = position.stakedBalance.minus(amountWithdrawn);
  position.save();

  // update position by calling redeem from market
  let outputTokenAmount = amountWithdrawn;
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(profitSharingPool.lpToken, user.id, amountWithdrawn),
  ];
  let rewardTokenAmounts: TokenBalance[] = [];
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
 * Update user's position when reward is paid out.
 * @param event
 */
export function handleRewardPaid(event: RewardPaid): void {
  let profitSharingPool = getOrCreateProfitSharingPool(event, event.address.toHexString());
  let rewardAmount = event.params.reward;
  let user = getOrCreateAccount(event.params.user);

  let position = getOrCreatePositionInProfitSharingPool(user, profitSharingPool);

  //// create RewardClaim entity
  let tx = event.transaction.hash.toHexString();
  let claim = new RewardClaim(tx + "-" + event.transaction.index.toString());
  claim.user = user.id;
  claim.transactionHash = tx;
  claim.amount = rewardAmount;
  claim.rewardSource = profitSharingPool.id;
  claim.save();

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
