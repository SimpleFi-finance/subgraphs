import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  CompRewarder,
  CToken,
  Token,
  UserBorrowBalance,
  UserDepositBalance,
  UserRewardBalance,
} from "../../generated/schema";

import { CToken as CTokenContract } from "../../generated/templates/CToken/CToken";

import { CToken as CTokenTemplate, Comp } from "../../generated/templates";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

import { ProtocolName, ProtocolType } from "./constants";

const cETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";
const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const COMP = "0xc00e94Cb662C3520282E6f5717214004A7f26888";

/**
 * Create CToken entity and generic Market representing it.
 *
 * @param address
 * @param comptroller
 * @param event
 * @returns
 */
export function getOrCreateCToken(
  address: string,
  comptroller: string,
  event: ethereum.Event
): CToken {
  let cToken = CToken.load(address);
  if (cToken != null) {
    return cToken as CToken;
  }

  let cTokenContract = CTokenContract.bind(Address.fromString(address));

  // in case of cETH underlying asset is not ERC20
  let underlyingAsset: string;
  if (address == cETH) {
    underlyingAsset = ETH;
  } else {
    underlyingAsset = getOrCreateERC20Token(event, cTokenContract.underlying()).id;
  }

  cToken = new CToken(address);
  cToken.comptroller = comptroller;
  cToken.underlying = underlyingAsset;
  cToken.cTokenName = cTokenContract.name();
  cToken.cTokenSymbol = cTokenContract.symbol();
  cToken.cTokenDecimals = cTokenContract.decimals();
  cToken.totalReserves = BigInt.fromI32(0);
  cToken.totalSupply = BigInt.fromI32(0);
  cToken.borrowIndex = BigInt.fromI32(0);
  cToken.cash = BigInt.fromI32(0);
  cToken.totalBorrows = BigInt.fromI32(0);
  cToken.transactionHash = event.transaction.hash.toHexString();
  cToken.save();

  // start indexing cToken
  CTokenTemplate.create(Address.fromString(address));

  return cToken as CToken;
}

/**
 * Create tracker for user's deposits
 *
 * @param user
 * @param cToken
 * @returns
 */
export function getOrCreateUserDepositBalance(user: string, cToken: string): UserDepositBalance {
  let id = user + "-" + cToken;
  let userDepositBalance = UserDepositBalance.load(id);

  if (userDepositBalance != null) {
    return userDepositBalance as UserDepositBalance;
  }

  userDepositBalance = new UserDepositBalance(id);
  userDepositBalance.user = user;
  userDepositBalance.cToken = cToken;
  userDepositBalance.cTokenBalance = BigInt.fromI32(0);
  userDepositBalance.redeemableTokensBalance = BigInt.fromI32(0);
  userDepositBalance.save();

  return userDepositBalance as UserDepositBalance;
}

/**
 * Return cToken exchange rate using contract call.
 *
 * @param cToken
 * @returns
 */
export function getExchangeRate(cToken: string): BigInt {
  let cTokenContract = CTokenContract.bind(Address.fromString(cToken));
  return cTokenContract.exchangeRateCurrent();
}

/**
 * Not implemented at the moment
 *
 * @param cToken
 * @param amount
 * @returns
 */
export function getCollateralAmountLocked(cToken: string, amount: BigInt): BigInt {
  // TODO implement once we decide how to track collateral
  return BigInt.fromI32(0);
}

/**
 * Create tracker for user's debt in particular market
 *
 * @param user
 * @param cToken
 * @returns
 */
export function getOrCreateUserBorrowBalance(user: string, cToken: string): UserBorrowBalance {
  let id = user + "-" + cToken;
  let userBorrowBalance = UserBorrowBalance.load(id);

  if (userBorrowBalance != null) {
    return userBorrowBalance as UserBorrowBalance;
  }

  userBorrowBalance = new UserBorrowBalance(id);
  userBorrowBalance.user = user;
  userBorrowBalance.cToken = cToken;
  userBorrowBalance.principal = BigInt.fromI32(0);
  userBorrowBalance.interestIndex = BigInt.fromI32(0);

  return userBorrowBalance as UserBorrowBalance;
}

/**
 * Init entity for tracking user's reward balances.
 *
 * @param userAddress
 * @returns
 */
export function getOrCreateUserRewardBalance(userAddress: string): UserRewardBalance {
  let user = UserRewardBalance.load(userAddress);
  if (user != null) {
    return user as UserRewardBalance;
  }

  user = new UserRewardBalance(userAddress);
  user.lifetimeRewards = BigInt.fromI32(0);
  user.claimedRewards = BigInt.fromI32(0);
  user.unclaimedRewards = BigInt.fromI32(0);
  user.save();

  return user as UserRewardBalance;
}

/**
 * Create rewarder market and start indexing COMP transfers.
 * Rewarder market is Comptroller contract itself.
 *
 * @param comptrollerAddress
 * @param event
 * @returns
 */
export function getOrCreateCompRewarder(
  comptrollerAddress: string,
  event: ethereum.Event
): CompRewarder {
  let compRewarder = CompRewarder.load(comptrollerAddress);
  if (compRewarder != null) {
    return compRewarder as CompRewarder;
  }

  compRewarder = new CompRewarder(comptrollerAddress);
  compRewarder.compRate = BigInt.fromI32(0);
  compRewarder.save();

  let comp = getOrCreateERC20Token(event, Address.fromString(COMP));
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));

  // create staking market
  let marketId = comptrollerAddress;
  let marketAddress = Address.fromString(comptrollerAddress);
  let protocolName = ProtocolName.COMPOUND;
  let protocolType = ProtocolType.STAKING;
  let inputTokens: Token[] = [weth];
  let outputToken = weth;
  let rewardTokens: Token[] = [comp];

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

  // Index COMP events to catch reward transfers
  Comp.create(Address.fromString(comp.id));

  return compRewarder as CompRewarder;
}
