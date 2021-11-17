import { Address, BigInt, ethereum, store, log } from "@graphprotocol/graph-ts";

import {
  LendingPool,
  LendingPoolAddressesProvider,
  Reserve,
  UserInvestmentBalance,
  UserDebtBalance,
  Market,
  Account,
  UserLtv,
  VariableDebtTokenBurn,
  StableDebtTokenBurn,
} from "../../generated/schema";

import { IPriceOracleGetter } from "../../generated/templates/LendingPool/IPriceOracleGetter";
import { LendingPool as LendingPoolContract } from "../../generated/templates/LendingPool/LendingPool";

import { ADDRESS_ZERO } from "./common";

import { calculateLinearInterest, rayMul } from "./math";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

/**
 * Create userInvestmentBalance entity which tracks how many tokens user provided
 * @param user
 * @param reserveId
 * @returns
 */
export function getOrCreateUserInvestmentBalance(
  user: string,
  reserveId: string
): UserInvestmentBalance {
  let id = user + "-" + reserveId;
  let userInvestmentBalance = UserInvestmentBalance.load(id) as UserInvestmentBalance;

  if (userInvestmentBalance == null) {
    userInvestmentBalance = new UserInvestmentBalance(id);
    userInvestmentBalance.user = user;
    userInvestmentBalance.reserve = reserveId;
    userInvestmentBalance.underlyingTokenProvidedAmount = BigInt.fromI32(0);
    userInvestmentBalance.save();
  }

  return userInvestmentBalance;
}

/**
 * Create userDebtBalance entity which tracks user's debt balance
 * @param user
 * @param reserveId
 * @returns
 */
export function getOrCreateUserDebtBalance(
  user: string,
  reserve: string,
  marketId: string,
  rateMode: i32
): UserDebtBalance {
  let id = user + "-" + marketId;
  let userDebtBalance = UserDebtBalance.load(id) as UserDebtBalance;

  if (userDebtBalance == null) {
    userDebtBalance = new UserDebtBalance(id);
    userDebtBalance.user = user;
    userDebtBalance.reserve = reserve;
    userDebtBalance.debtTakenAmount = BigInt.fromI32(0);
    userDebtBalance.rateMode = rateMode;
    userDebtBalance.save();
  }

  return userDebtBalance;
}

/**
 * Returns the ongoing normalized income for the reserve.
 * @param reserve
 * @param event
 * @returns
 */
export function getReserveNormalizedIncome(reserve: Reserve, event: ethereum.Event): BigInt {
  let timestamp = reserve.lastUpdateTimestamp;

  if (timestamp.equals(event.block.timestamp)) {
    //if the index was updated in the same block, no need to perform any calculation
    return reserve.liquidityIndex;
  }

  let cumulated = calculateLinearInterest(reserve.liquidityRate, timestamp, event.block.timestamp);
  let result = rayMul(cumulated, reserve.liquidityIndex);

  return result;
}

export function getUserATokenBalance(
  balance: UserInvestmentBalance,
  event: ethereum.Event
): BigInt {
  let reserve = Reserve.load(balance.reserve) as Reserve;
  let reserveNormalIncome = getReserveNormalizedIncome(reserve, event);

  return rayMul(balance.underlyingTokenProvidedAmount, reserveNormalIncome);
}

export function getMarketATokenSupply(
  market: Market,
  reserveId: string,
  event: ethereum.Event
): BigInt {
  let reserve = Reserve.load(reserveId) as Reserve;
  let reserveNormalIncome = getReserveNormalizedIncome(reserve, event);

  return rayMul(market.outputTokenTotalSupply, reserveNormalIncome);
}

export function getPriceOracle(lendingPoolId: string): IPriceOracleGetter {
  let lendingPool = LendingPool.load(lendingPoolId) as LendingPool;
  let addressProvider = LendingPoolAddressesProvider.load(lendingPool.addressProvider);

  return IPriceOracleGetter.bind(Address.fromString(addressProvider.priceOracle));
}

export function getCollateralAmountLocked(
  user: Account,
  reserve: Reserve,
  reserveAmount: BigInt,
  block: ethereum.Block
): BigInt {
  let assetUnitPriceInEth = getAssetUnitPriceInEth(reserve, block);
  let borrowAmountInEth = assetUnitPriceInEth
    .times(reserveAmount)
    .div(BigInt.fromI32(10).pow(<u8>reserve.assetDecimals));

  let userLtv = getOrInitUserLtv(user, reserve.lendingPool, block);
  if (userLtv == BigInt.fromI32(0)) {
    return BigInt.fromI32(0);
  }

  let collateralLocked = borrowAmountInEth.div(userLtv);

  return collateralLocked;
}

export function getAssetUnitPriceInEth(reserve: Reserve, block: ethereum.Block): BigInt {
  if (block.timestamp == reserve.lastUpdateTimestamp) {
    return reserve.assetUnitPriceInEth;
  }

  // make a contract call to price oracle
  let price = getPriceOracle(reserve.lendingPool).getAssetPrice(Address.fromString(reserve.asset));
  reserve.assetUnitPriceInEth = price;
  reserve.lastUpdateTimestamp = block.timestamp;
  reserve.save();

  return price;
}

export function getOrInitReserve(underlyingAsset: Address, event: ethereum.Event): Reserve {
  let reserveId = underlyingAsset.toHexString();
  let reserve = Reserve.load(reserveId);
  if (reserve != null) {
    return reserve as Reserve;
  }

  reserve = new Reserve(reserveId);
  reserve.asset = reserveId;
  reserve.assetDecimals = 0;
  reserve.lendingPool = ADDRESS_ZERO;
  reserve.aToken = ADDRESS_ZERO;
  reserve.stableDebtToken = ADDRESS_ZERO;
  reserve.variableDebtToken = ADDRESS_ZERO;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.liquidityIndex = BigInt.fromI32(0);
  reserve.liquidityRate = BigInt.fromI32(0);
  reserve.ltv = BigInt.fromI32(0);
  reserve.assetUnitPriceInEth = BigInt.fromI32(0);
  reserve.lastUpdateTimestamp = BigInt.fromI32(0);
  reserve.save();

  return reserve as Reserve;
}

export function getOrInitUserLtv(
  user: Account,
  lendingPoolId: string,
  block: ethereum.Block
): BigInt {
  let userLtv = UserLtv.load(user.id);
  if (userLtv == null) {
    userLtv = new UserLtv(user.id);
    userLtv.user = user.id;
    userLtv.lastUpdateTimestamp = BigInt.fromI32(0);
  }

  if (block.timestamp == userLtv.lastUpdateTimestamp) {
    return userLtv.ltv;
  }

  let lendingPool = LendingPoolContract.bind(Address.fromString(lendingPoolId));
  let accountData = lendingPool.getUserAccountData(Address.fromString(user.id));
  let ltv = accountData.value4;

  userLtv.ltv = ltv;
  userLtv.lastUpdateTimestamp = block.timestamp;
  userLtv.save();

  return ltv;
}

export function getRepaymentRateMode(event: ethereum.Event, reserve: Reserve): i32 {
  let borrowMode = -1;
  let tx = event.transaction.hash.toHexString();
  let variableId = tx + "-" + reserve.variableDebtToken;
  let stableId = tx + "-" + reserve.stableDebtToken;

  if (VariableDebtTokenBurn.load(variableId) != null) {
    borrowMode = BORROW_MODE_VARIABLE;
    // remove entity so that new one can be created in same transaction
    store.remove("VariableDebtTokenBurn", variableId);
  } else if (StableDebtTokenBurn.load(stableId) != null) {
    borrowMode = BORROW_MODE_STABLE;
    // remove entity so that new one can be created in same transaction
    store.remove("StableDebtTokenBurn", stableId);
  }

  return borrowMode;
}