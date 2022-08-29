import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import { Market, Account, Token, StakingPool, PositionInStakingPool } from "../generated/schema";

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./lib/common";

import { Staked, StakingRewards, Withdrawn } from "../generated/StakingRewards/StakingRewards";
import { ProtocolType } from "./lib/constants";

/**
 * Handle user staking his tokens in staking pool
 * @param event
 */
export function handleStaked(event: Staked): void {
  let stakingPoolAddress = event.address.toHexString();
  let depositedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  //// update StakingPool balance
  let stakingPool = getOrCreateStakingPool(event, stakingPoolAddress);
  stakingPool.totalSupply = stakingPool.totalSupply.plus(depositedAmount);
  stakingPool.save();

  //// update Market balance
  let market = Market.load(stakingPool.id) as Market;
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(stakingPool.stakingToken, stakingPoolAddress, stakingPool.totalSupply),
  ];
  updateMarket(event, market, inputTokenBalances, stakingPool.totalSupply);

  //// update user's balance tracker
  let position = getOrCreatePositionInStakingPool(user, stakingPoolAddress);
  position.stakedBalance = position.stakedBalance.plus(depositedAmount);
  position.save();

  //// update user's position
  let outputTokenAmount = depositedAmount;
  let inputTokenAmounts = [new TokenBalance(stakingPool.stakingToken, user.id, depositedAmount)];
  let rewardTokensAmounts: TokenBalance[] = [];

  let outputTokenBalance = position.stakedBalance;
  let userInputTokenBalances = [
    new TokenBalance(stakingPool.stakingToken, user.id, position.stakedBalance),
  ];
  let rewardTokensBalance: TokenBalance[] = getPendingRewards();

  investInMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokensAmounts,
    outputTokenBalance,
    userInputTokenBalances,
    rewardTokensBalance,
    null
  );
}

/**
 * Handle user withdrawing tokens from staking pool
 * @param event
 */
export function handleWithdrawn(event: Withdrawn): void {
  let stakingPoolAddress = event.address.toHexString();
  let withdrawnAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.user);

  //// update StakingPool balance
  let stakingPool = getOrCreateStakingPool(event, stakingPoolAddress);
  stakingPool.totalSupply = stakingPool.totalSupply.minus(withdrawnAmount);
  stakingPool.save();

  //// update Market balance
  let market = Market.load(stakingPool.id) as Market;
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(stakingPool.stakingToken, stakingPoolAddress, stakingPool.totalSupply),
  ];
  updateMarket(event, market, inputTokenBalances, stakingPool.totalSupply);

  //// update user's balance tracker
  let position = getOrCreatePositionInStakingPool(user, stakingPoolAddress);
  position.stakedBalance = position.stakedBalance.minus(withdrawnAmount);
  position.save();

  //// update user's position
  let outputTokenAmount = withdrawnAmount;
  let inputTokenAmounts = [new TokenBalance(stakingPool.stakingToken, user.id, withdrawnAmount)];
  let rewardTokensAmounts: TokenBalance[] = [];

  let outputTokenBalance = position.stakedBalance;
  let userInputTokenBalances = [
    new TokenBalance(stakingPool.stakingToken, user.id, position.stakedBalance),
  ];
  let rewardTokensBalance: TokenBalance[] = getPendingRewards();

  redeemFromMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokensAmounts,
    outputTokenBalance,
    userInputTokenBalances,
    rewardTokensBalance,
    null
  );
}

/**
 * Create StakingPool entity and the generic Market entity to represent it.
 * @param event
 * @param stakingPoolAddress
 * @returns
 */
export function getOrCreateStakingPool(
  event: ethereum.Event,
  stakingPoolAddress: string
): StakingPool {
  let stakingPool = StakingPool.load(stakingPoolAddress);

  if (stakingPool != null) {
    return stakingPool as StakingPool;
  }

  let contract = StakingRewards.bind(Address.fromHexString(stakingPoolAddress));
  let stakingToken = getOrCreateERC20Token(event, contract.stakingToken());
  let outputToken = getOrCreateERC20Token(event, contract._address);
  let rewardsToken = getOrCreateERC20Token(event, contract.rewardsToken());

  stakingPool = new StakingPool(stakingPoolAddress);
  stakingPool.stakingToken = stakingToken.id;
  stakingPool.rewardsToken = rewardsToken.id;
  stakingPool.save();

  //// create Market entity
  let marketId = stakingPool.id;
  let marketAddress = Address.fromHexString(stakingPoolAddress);
  // TODO - use proper protocol naming
  let protocolName = "StakingRewards";
  let protocolType = ProtocolType.STAKING;
  let inputTokens: Token[] = [stakingToken];
  let rewardTokens: Token[] = [rewardsToken];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );

  return stakingPool;
}

/**
 * Track user's balance in staking pool
 * @param user
 * @param stakingPoolAddress
 * @returns
 */
function getOrCreatePositionInStakingPool(
  user: Account,
  stakingPoolAddress: string
): PositionInStakingPool {
  let id = user.id + "-" + stakingPoolAddress;
  let userPosition = PositionInStakingPool.load(id);

  if (userPosition != null) {
    return userPosition as PositionInStakingPool;
  }

  userPosition = new PositionInStakingPool(id);
  userPosition.stakingPool = stakingPoolAddress;
  userPosition.user = user.id;
  userPosition.stakedBalance = BigInt.fromI32(0);
  userPosition.save();

  return userPosition;
}

/**
 * Get pending rewards
 * @returns
 */
function getPendingRewards(): TokenBalance[] {
  return [];
}
