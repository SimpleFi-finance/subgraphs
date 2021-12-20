import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  CToken,
  UserBorrowBalance,
  UserDepositBalance,
  UserRewardBalance,
} from "../../generated/schema";

import { CToken as CTokenContract } from "../../generated/templates/CToken/CToken";

import { CToken as CTokenTemplate } from "../../generated/templates";

import { ADDRESS_ZERO, getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

const cETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";
const ADDRESS_ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

let mantissaOne = BigInt.fromI32(10).pow(27);

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
    underlyingAsset = ADDRESS_ETH;
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
  cToken.borrowIndex = mantissaOne;
  cToken.cash = BigInt.fromI32(0);
  cToken.totalBorrows = BigInt.fromI32(0);
  cToken.transactionHash = event.transaction.hash.toHexString();
  cToken.save();

  // start indexing cToken
  CTokenTemplate.create(Address.fromString(address));

  return cToken as CToken;
}

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

export function getExchangeRate(cToken: string): BigInt {
  let cTokenContract = CTokenContract.bind(Address.fromString(cToken));
  return cTokenContract.exchangeRateCurrent();
}

export function getCollateralAmountLocked(cToken: string, amount: BigInt): BigInt {
  // TODO implement once we decide hot to track collateral
  return BigInt.fromI32(0);
}

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
