import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

import { ProtocolName, ProtocolType } from "../library/constants";
import {
  Token,
  LendingPool,
  LendingPoolAddressesProvider,
  Reserve,
  UserInvestmentBalance,
  UserDebtBalance,
  Account,
  UserAccountData,
  IncentivesController,
  UserRewardBalance,
  AToken,
  VariableDebtToken,
  StableDebtToken,
} from "../../generated/schema";

import { IPriceOracleGetter } from "../../generated/templates/LendingPool/IPriceOracleGetter";

import { LendingPool as LendingPoolContract } from "../../generated/templates/LendingPool/LendingPool";

import {
  IncentivesController as IncentivesControllerTemplate,
  AToken as ATokenTemplate,
  VariableDebtToken as VariableDebtTokenTemplate,
  StableDebtToken as StableDebtTokenTemplate,
} from "../../generated/templates";

import { AaveIncentivesController as IncentivesControllerContract } from "../../generated/templates/IncentivesController/AaveIncentivesController";

import { ADDRESS_ZERO } from "./common";

import { calculateCompoundedInterest, calculateLinearInterest, rayMul } from "./math";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
let RAY: BigInt = BigInt.fromI32(10).pow(27);

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
    userInvestmentBalance.aTokenBalance = BigInt.fromI32(0);
    userInvestmentBalance.scaledATokenBalance = BigInt.fromI32(0);
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
  reserveId: string,
  marketId: string,
  rateMode: i32
): UserDebtBalance {
  let id = user + "-" + marketId;
  let userDebtBalance = UserDebtBalance.load(id) as UserDebtBalance;

  if (userDebtBalance == null) {
    userDebtBalance = new UserDebtBalance(id);
    userDebtBalance.user = user;
    userDebtBalance.reserve = reserveId;
    userDebtBalance.scaledDebtTokenBalance = BigInt.fromI32(0);
    userDebtBalance.amountBorrowedBalance = BigInt.fromI32(0);
    userDebtBalance.rateMode = rateMode;
    userDebtBalance.save();
  }

  return userDebtBalance;
}

/**
 * Get balance multiplier for aTokens.
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

/**
 * Get balance multiplier for variable debt tokens.
 * @param reserve
 * @param event
 * @returns
 */
export function getReserveNormalizedVariableDebt(reserve: Reserve, event: ethereum.Event): BigInt {
  let timestamp = reserve.lastUpdateTimestamp;

  if (timestamp.equals(event.block.timestamp)) {
    //if the index was updated in the same block, no need to perform any calculation
    return reserve.variableBorrowIndex;
  }

  let cumulated = calculateCompoundedInterest(
    reserve.variableBorrowRate,
    timestamp,
    event.block.timestamp
  );
  let result = rayMul(cumulated, reserve.variableBorrowIndex);

  return result;
}

/**
 * Get balance multiplier for stable debt tokens based on market average borrow rate.
 * @param reserve
 * @param event
 * @returns
 */
export function getAvgCumulatedInterest(reserve: Reserve, event: ethereum.Event): BigInt {
  let timestamp = reserve.lastUpdateTimestamp;

  if (timestamp.equals(event.block.timestamp)) {
    //if the index was updated in the same block return 1e27
    return RAY;
  }

  let cumulatedInterest = calculateCompoundedInterest(
    reserve.stableBorrowRate,
    timestamp,
    event.block.timestamp
  );

  return cumulatedInterest;
}

/**
 * Get price oracle contract by querying address provider contract.
 * @param lendingPoolId
 * @returns
 */
export function getPriceOracle(lendingPoolId: string): IPriceOracleGetter {
  let lendingPool = LendingPool.load(lendingPoolId) as LendingPool;
  let addressProvider = LendingPoolAddressesProvider.load(lendingPool.addressProvider);

  return IPriceOracleGetter.bind(Address.fromString(addressProvider.priceOracle));
}

/**
 * Get asset price in ETH using a call to the price oracle. Use cached value if available.
 * @param reserve
 * @param block
 * @returns
 */
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

/**
 * Calculate amount of collateral locked based on user's average LTV in this block.
 * @param user
 * @param reserve
 * @param borrowedAmount
 * @param block
 * @returns
 */
export function getCollateralAmountLocked(
  user: Account,
  reserve: Reserve,
  borrowedAmount: BigInt,
  block: ethereum.Block
): BigInt {
  let assetUnitPriceInEth = getAssetUnitPriceInEth(reserve, block);
  let borrowAmountInEth = assetUnitPriceInEth
    .times(borrowedAmount)
    .div(BigInt.fromI32(10).pow(<u8>reserve.assetDecimals));

  let userAccountData = getOrInitUserAccountData(user, reserve.lendingPool, block);
  if (userAccountData.ltv == BigInt.fromI32(0)) {
    return BigInt.fromI32(0);
  }

  let collateralLocked = borrowAmountInEth.div(userAccountData.ltv);

  return collateralLocked;
}

/**
 * Init reserve entity.
 * @param asset
 * @param lendingPool
 * @param event
 * @returns
 */
export function getOrInitReserve(
  asset: string,
  lendingPool: string,
  event: ethereum.Event
): Reserve {
  let reserveId = lendingPool + "-" + asset;
  let reserve = Reserve.load(reserveId);
  if (reserve != null) {
    return reserve as Reserve;
  }

  reserve = new Reserve(reserveId);
  reserve.asset = asset;
  reserve.assetDecimals = 0;
  reserve.lendingPool = ADDRESS_ZERO;
  reserve.aToken = ADDRESS_ZERO;
  reserve.stableDebtToken = ADDRESS_ZERO;
  reserve.variableDebtToken = ADDRESS_ZERO;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.liquidityIndex = BigInt.fromI32(0);
  reserve.liquidityRate = BigInt.fromI32(0);
  reserve.variableBorrowIndex = BigInt.fromI32(0);
  reserve.variableBorrowRate = BigInt.fromI32(0);
  reserve.stableBorrowRate = BigInt.fromI32(0);
  reserve.ltv = BigInt.fromI32(0);
  reserve.assetUnitPriceInEth = BigInt.fromI32(0);
  reserve.lastUpdateTimestamp = BigInt.fromI32(0);
  reserve.save();

  return reserve as Reserve;
}

/**
 * Get user account data using contract call to lending pool. Use cached values if available.
 * @param user
 * @param lendingPoolId
 * @param block
 * @returns
 */
export function getOrInitUserAccountData(
  user: Account,
  lendingPoolId: string,
  block: ethereum.Block
): UserAccountData {
  let userAccountData = UserAccountData.load(user.id);
  if (userAccountData == null) {
    userAccountData = new UserAccountData(user.id);
    userAccountData.user = user.id;
    userAccountData.totalCollateralEth = BigInt.fromI32(0);
    userAccountData.totalDebtETH = BigInt.fromI32(0);
    userAccountData.availableBorrowsETH = BigInt.fromI32(0);
    userAccountData.currentLiquidationThreshold = BigInt.fromI32(0);
    userAccountData.healthFactor = BigInt.fromI32(0);
    userAccountData.lastUpdateTimestamp = BigInt.fromI32(0);
  }

  if (block.timestamp == userAccountData.lastUpdateTimestamp) {
    return userAccountData as UserAccountData;
  }

  let lendingPool = LendingPoolContract.bind(Address.fromString(lendingPoolId));
  let accountData = lendingPool.getUserAccountData(Address.fromString(user.id));
  let totalCollateralEth = accountData.value0;
  let totalDebtETH = accountData.value1;
  let availableBorrowsETH = accountData.value2;
  let currentLiquidationThreshold = accountData.value3;
  let ltv = accountData.value4;
  let healthFactor = accountData.value5;

  userAccountData.ltv = ltv;
  userAccountData.totalCollateralEth = totalCollateralEth;
  userAccountData.totalDebtETH = totalDebtETH;
  userAccountData.availableBorrowsETH = availableBorrowsETH;
  userAccountData.currentLiquidationThreshold = currentLiquidationThreshold;
  userAccountData.healthFactor = healthFactor;
  userAccountData.lastUpdateTimestamp = block.timestamp;
  userAccountData.save();

  return userAccountData as UserAccountData;
}

/**
 * Create incentive controller entity. Create staking market for rewards. Start indexing the contract.
 * @param event
 * @param controllerAddress
 * @param lendingPool
 * @returns
 */
export function getOrCreateIncentivesController(
  event: ethereum.Event,
  controllerAddress: string,
  lendingPool: string
): IncentivesController {
  let incentivesController = IncentivesController.load(controllerAddress);
  if (incentivesController != null) {
    return incentivesController as IncentivesController;
  }

  // fetch data from contract
  let contract = IncentivesControllerContract.bind(Address.fromString(controllerAddress));
  let rewardToken = getOrCreateERC20Token(event, contract.REWARD_TOKEN());
  let emissionEndTimestamp = contract.DISTRIBUTION_END();

  // create entity
  incentivesController = new IncentivesController(controllerAddress);
  incentivesController.rewardToken = rewardToken.id;
  incentivesController.emissionEndTimestamp = emissionEndTimestamp;
  incentivesController.lendingPool = lendingPool;
  incentivesController.save();

  // create staking market
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));
  let marketId = lendingPool + "-" + controllerAddress;
  let marketAddress = Address.fromString(controllerAddress);
  let protocolName = ProtocolName.AAVE_POOL;
  let protocolType = ProtocolType.STAKING;
  let inputTokens: Token[] = [weth];
  let outputToken = weth;
  let rewardTokens: Token[] = [rewardToken];

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

  // start indexing incentive controller
  IncentivesControllerTemplate.create(Address.fromString(controllerAddress));

  return incentivesController as IncentivesController;
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

/**
 * Create aToken entity and start indexing the contract.
 * @param aTokenAdress
 * @returns
 */
export function getOrCreateAToken(aTokenAdress: string): AToken {
  let aToken = AToken.load(aTokenAdress);
  if (aToken != null) {
    return aToken as AToken;
  }

  aToken = new AToken(aTokenAdress);
  aToken.underlyingAsset = ADDRESS_ZERO;
  aToken.treasury = ADDRESS_ZERO;
  aToken.lendingPool = ADDRESS_ZERO;
  aToken.incentivesController = ADDRESS_ZERO;
  aToken.aTokenName = "";
  aToken.aTokenSymbol = "";
  aToken.aTokenDecimals = 18;
  aToken.save();

  // start indexing atoken
  ATokenTemplate.create(Address.fromString(aTokenAdress));

  return aToken as AToken;
}

/**
 * Create vToken entity and start indexing the contract.
 * @param vTokenAdress
 * @returns
 */
export function getOrCreateVariableDebtToken(vTokenAdress: string): VariableDebtToken {
  let vToken = VariableDebtToken.load(vTokenAdress);
  if (vToken != null) {
    return vToken as VariableDebtToken;
  }

  vToken = new VariableDebtToken(vTokenAdress);
  vToken.underlyingAsset = ADDRESS_ZERO;
  vToken.lendingPool = ADDRESS_ZERO;
  vToken.incentivesController = ADDRESS_ZERO;
  vToken.debtTokenName = "";
  vToken.debtTokenSymbol = "";
  vToken.debtTokenDecimals = 18;
  vToken.save();

  // start indexing variable debt token
  VariableDebtTokenTemplate.create(Address.fromString(vTokenAdress));

  return vToken as VariableDebtToken;
}

/**
 * Create sToken entity and start indexing the contract.
 * @param sTokenAdress
 * @returns
 */
export function getOrCreateStableDebtToken(sTokenAdress: string): StableDebtToken {
  let sToken = StableDebtToken.load(sTokenAdress);
  if (sToken != null) {
    return sToken as StableDebtToken;
  }

  sToken = new StableDebtToken(sTokenAdress);
  sToken.underlyingAsset = ADDRESS_ZERO;
  sToken.lendingPool = ADDRESS_ZERO;
  sToken.incentivesController = ADDRESS_ZERO;
  sToken.debtTokenName = "";
  sToken.debtTokenSymbol = "";
  sToken.debtTokenDecimals = 18;
  sToken.save();

  // start indexing stable debt token
  StableDebtTokenTemplate.create(Address.fromString(sTokenAdress));

  return sToken as StableDebtToken;
}
