import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  DistributedBorrowerComp,
  DistributedSupplierComp,
  MarketListed,
  NewCompRate,
} from "../../generated/Comptroller/Comptroller";

import { CompRewarder, Market, Token } from "../../generated/schema";

import { ProtocolName, ProtocolType } from "../library/constants";

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "../library/common";

import {
  getOrCreateCompRewarder,
  getOrCreateCToken,
  getOrCreateUserRewardBalance,
} from "../library/cTokenUtils";

import { Transfer } from "../../generated/templates/Comp/IERC20";

const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const cETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";

/**
 * Create deposit, borrow and reward markets, and start indexing new CToken.
 *
 * @param event
 */
export function handleMarketListed(event: MarketListed): void {
  let cTokenAddress = event.params.cToken;
  let cToken = getOrCreateCToken(cTokenAddress.toHexString(), event.address.toHexString(), event);

  let underlying: Token;
  if (cTokenAddress.toHexString() == cETH) {
    underlying = getOrCreateERC20Token(event, Address.fromString(ETH));
  } else {
    underlying = getOrCreateERC20Token(event, Address.fromString(cToken.underlying));
  }

  // create deposit market
  let marketId = cToken.id;
  let marketAddress = cTokenAddress;
  let protocolName = ProtocolName.COMPOUND;
  let protocolType = ProtocolType.LENDING;
  let inputTokens: Token[] = [underlying];
  let outputToken = getOrCreateERC20Token(event, cTokenAddress);
  let rewardTokens: Token[] = [];

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

  outputToken.mintedByMarket = marketId;
  outputToken.save();

  // create borrow market
  marketId = cToken.id + "-BORROW";
  protocolType = ProtocolType.DEBT;
  inputTokens = [getOrCreateERC20Token(event, Address.fromString(ETH))];
  outputToken = getOrCreateERC20Token(event, Address.fromString(underlying.id));
  rewardTokens = [];

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

  // create rewarder market (only once, first time this handler is executed)
  getOrCreateCompRewarder(event.address.toHexString(), event);
}

/**
 * Keep track of accured rewards for user
 *
 * @param event
 */
export function handleDistributedSupplierComp(event: DistributedSupplierComp): void {
  accrueRewards(event.params.supplier, event.params.compDelta, event);
}

/**
 * Keep track of accured rewards for user
 *
 * @param event
 */
export function handleDistributedBorrowerComp(event: DistributedBorrowerComp): void {
  accrueRewards(event.params.borrower, event.params.compDelta, event);
}

/**
 * Keep track of claimed rewards by tracking COMP transfers where sender is Comptroller.
 *
 * @param event
 * @returns
 */
export function handleCompTransfer(event: Transfer): void {
  let sender = event.params.from.toHexString();

  // don't handle COMP transfers which are not originated from comptroller
  if (CompRewarder.load(sender) == null) {
    return;
  }

  let user = getOrCreateAccount(event.params.to);
  let rewardBalance = getOrCreateUserRewardBalance(user.id);

  let claimedAmount = event.params.value;
  rewardBalance.claimedRewards = rewardBalance.claimedRewards.plus(claimedAmount);
  rewardBalance.unclaimedRewards = rewardBalance.unclaimedRewards.minus(claimedAmount);
  rewardBalance.save();

  ////// update user's position

  // staking market which controlls rewards
  let market = Market.load(event.address.toHexString()) as Market;

  // no change as only rewards are claimed
  let outputTokenAmount = BigInt.fromI32(0);

  // no change as only rewards are claimed
  let inputTokensAmount: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenAmounts: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, claimedAmount),
  ];

  // TODO - for now there is no definition of output token for incentive controller
  // use 1 instead of 0 in order to keep reward position open at all times
  let outputTokenBalance = BigInt.fromI32(1);

  // TODO - for now there is no definition of input token for incentive controlelr
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, rewardBalance.unclaimedRewards),
  ];

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    user,
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

/**
 * Update user position on reward accrual.
 *
 * @param userAddress
 * @param accuredRewardsAmount
 * @param event
 */
function accrueRewards(
  userAddress: Address,
  accuredRewardsAmount: BigInt,
  event: ethereum.Event
): void {
  let user = getOrCreateAccount(userAddress);

  let rewardBalance = getOrCreateUserRewardBalance(user.id);
  rewardBalance.unclaimedRewards = rewardBalance.unclaimedRewards.plus(accuredRewardsAmount);
  rewardBalance.lifetimeRewards = rewardBalance.lifetimeRewards.plus(accuredRewardsAmount);
  rewardBalance.save();

  ////// update user's position

  // staking market which controlls rewards
  let id = event.address.toHexString();
  let market = Market.load(id) as Market;

  // no change as only rewards are claimed
  let outputTokenAmount = BigInt.fromI32(0);

  // no change as only rewards are claimed
  let inputTokensAmount: TokenBalance[] = [];

  // no change
  let rewardTokenAmounts: TokenBalance[] = [];

  // TODO - for now there is no definition of output token for rewarder
  // use 1 instead of 0 in order to keep reward position open at all times
  let outputTokenBalance = BigInt.fromI32(1);

  // TODO - for now there is no definition of input token for rewarder
  let inputTokenBalances: TokenBalance[] = [];

  // reward token amounts claimable by user
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, rewardBalance.unclaimedRewards),
  ];

  // use common function to update position and store transaction
  investInMarket(
    event,
    user,
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

/**
 * Update market's COMP reward rate
 *
 * @param event
 */
export function handleNewCompRate(event: NewCompRate): void {
  let id = event.address.toHexString();
  let rewarder = CompRewarder.load(id) as CompRewarder;

  rewarder.compRate = event.params.newCompRate;
  rewarder.save();

  let market = Market.load(id) as Market;
  market.rewardRate = event.params.newCompRate;
  market.save();
}
