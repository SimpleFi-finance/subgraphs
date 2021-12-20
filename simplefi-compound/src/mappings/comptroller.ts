import { Address, log } from "@graphprotocol/graph-ts";

import {
  DistributedBorrowerComp,
  DistributedSupplierComp,
  MarketListed,
} from "../../generated/Comptroller/Comptroller";

import { Token } from "../../generated/schema";

import { ProtocolName, ProtocolType } from "../library/constants";

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
} from "../library/common";
import {
  getOrCreateCompRewarder,
  getOrCreateCToken,
  getOrCreateUserRewardBalance,
} from "../library/cTokenUtils";

import { Transfer } from "../../generated/templates/Comp/IERC20";

const ADDRESS_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const cETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";

export function handleMarketListed(event: MarketListed): void {
  let cTokenAddress = event.params.cToken;
  let cToken = getOrCreateCToken(cTokenAddress.toHexString(), event.address.toHexString(), event);

  let underlying: Token;
  if (cTokenAddress.toHexString() == cETH) {
    underlying = getOrCreateERC20Token(event, Address.fromString(ADDRESS_ETH));
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

  // create borrow market
  marketId = cToken.id + "-BORROW";
  protocolType = ProtocolType.DEBT;
  inputTokens = [getOrCreateERC20Token(event, Address.fromString(ADDRESS_ETH))];
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

export function handleDistributedSupplierComp(event: DistributedSupplierComp): void {
  let user = getOrCreateAccount(event.params.supplier);
  let accuredRewardsAmount = event.params.compDelta;

  let rewardBalance = getOrCreateUserRewardBalance(user.id);
  rewardBalance.unclaimedRewards = rewardBalance.unclaimedRewards.plus(accuredRewardsAmount);
  rewardBalance.lifetimeRewards = rewardBalance.lifetimeRewards.plus(accuredRewardsAmount);
  rewardBalance.save();
}

export function handleDistributedBorrowerComp(event: DistributedBorrowerComp): void {
  let user = getOrCreateAccount(event.params.borrower);
  let accuredRewardsAmount = event.params.compDelta;

  let rewardBalance = getOrCreateUserRewardBalance(user.id);
  rewardBalance.unclaimedRewards = rewardBalance.unclaimedRewards.plus(accuredRewardsAmount);
  rewardBalance.lifetimeRewards = rewardBalance.lifetimeRewards.plus(accuredRewardsAmount);
  rewardBalance.save();
}

export function handleCompTransfer(event: Transfer): void {
  let comptroller = event.address;

  // don't handle COMP transfers which are not originated from comptroller
  if (event.params.from != comptroller) {
    return;
  }

  let user = getOrCreateAccount(event.params.to);
  let rewardBalance = getOrCreateUserRewardBalance(user.id);

  let claimedAmount = event.params.value;
  rewardBalance.claimedRewards = rewardBalance.claimedRewards.plus(claimedAmount);
  rewardBalance.unclaimedRewards = rewardBalance.unclaimedRewards.minus(claimedAmount);
  rewardBalance.save();
}
