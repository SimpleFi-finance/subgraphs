import { Address, dataSource } from "@graphprotocol/graph-ts";

import {
  ATokenUpgraded,
  CollateralConfigurationChanged,
  ReserveInitialized,
  StableDebtTokenUpgraded,
  VariableDebtTokenUpgraded,
} from "../../generated/templates/LendingPoolConfigurator/LendingPoolConfigurator";

import { Token } from "../../generated/schema";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

import { ProtocolName, ProtocolType } from "../library/constants";
import {
  getOrCreateAToken,
  getOrCreateStableDebtToken,
  getOrCreateVariableDebtToken,
  getOrInitReserve,
} from "../library/lendingPoolUtils";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

/**
 * Create Reserve entity, along with a/v/s tokens. Start indexing them.
 * Create deposit market, and 2 debt markets (variable and stable rate).
 * @param event
 */
export function handleReserveInitialized(event: ReserveInitialized): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let asset = getOrCreateERC20Token(event, event.params.asset);
  let aTokenERC20 = getOrCreateERC20Token(event, event.params.aToken);
  let stableDebtToken = getOrCreateERC20Token(event, event.params.stableDebtToken);
  let variableDebtToken = getOrCreateERC20Token(event, event.params.variableDebtToken);
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));

  // store reserve data
  let reserve = getOrInitReserve(event.params.asset.toHexString(), lendingPool, event);
  reserve.asset = asset.id;
  reserve.assetDecimals = asset.decimals;
  reserve.lendingPool = lendingPool;
  reserve.aToken = aTokenERC20.id;
  reserve.stableDebtToken = stableDebtToken.id;
  reserve.variableDebtToken = variableDebtToken.id;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.save();

  // store basic aToken info
  let aToken = getOrCreateAToken(aTokenERC20.id);
  aToken.underlyingAsset = reserve.asset;
  aToken.lendingPool = reserve.lendingPool;
  aToken.save();

  // store basic vToken info
  let vToken = getOrCreateVariableDebtToken(event.params.variableDebtToken.toHexString());
  vToken.underlyingAsset = reserve.asset;
  vToken.lendingPool = reserve.lendingPool;
  vToken.save();

  // store basic sToken info
  let sToken = getOrCreateStableDebtToken(event.params.stableDebtToken.toHexString());
  sToken.underlyingAsset = reserve.asset;
  sToken.lendingPool = reserve.lendingPool;
  sToken.save();

  // create investment market representing the token-aToken pair
  let marketId = lendingPool + "-" + reserve.asset;
  let marketAddress = Address.fromString(lendingPool);
  let protocolName = ProtocolName.AAVE_POOL;
  let protocolType = ProtocolType.LENDING;
  let inputTokens: Token[] = [asset];
  let outputToken = aTokenERC20;
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
  aTokenERC20.mintedByMarket = marketId;
  aTokenERC20.save();

  // create stable debt market representing the debt taken in reserve asset
  marketId = lendingPool + "-" + stableDebtToken.id;
  protocolType = ProtocolType.DEBT;
  inputTokens = [weth];
  outputToken = stableDebtToken;

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
  stableDebtToken.mintedByMarket = marketId;
  stableDebtToken.save();

  // create variable debt market representing the debt taken in reserve asset
  marketId = lendingPool + "-" + variableDebtToken.id;
  protocolType = ProtocolType.DEBT;
  inputTokens = [weth];
  outputToken = variableDebtToken;

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
  variableDebtToken.mintedByMarket = marketId;
  variableDebtToken.save();
}

/**
 * Update reserve LTV value
 * @param event
 */
export function handleCollateralConfigurationChanged(event: CollateralConfigurationChanged): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let reserve = getOrInitReserve(event.params.asset.toHexString(), lendingPool, event);
  reserve.ltv = event.params.ltv;
  reserve.save();
}

/**
 * Create new aToken and start indexing it.
 * @param event
 */
export function handleATokenUpgraded(event: ATokenUpgraded): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let reserve = getOrInitReserve(event.params.asset.toHexString(), lendingPool, event);
  reserve.aToken = event.params.proxy.toHexString();
  reserve.save();

  // store basic aToken info
  let aToken = getOrCreateAToken(event.params.proxy.toHexString());
  aToken.underlyingAsset = reserve.asset;
  aToken.lendingPool = reserve.lendingPool;
  aToken.save();
}

/**
 * Create new sToken and start indexing it.
 * @param event
 */
export function handleStableDebtTokenUpgraded(event: StableDebtTokenUpgraded): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let reserve = getOrInitReserve(event.params.asset.toHexString(), lendingPool, event);
  reserve.stableDebtToken = event.params.proxy.toHexString();
  reserve.save();

  // store basic sToken info
  let sToken = getOrCreateStableDebtToken(event.params.proxy.toHexString());
  sToken.underlyingAsset = reserve.asset;
  sToken.lendingPool = reserve.lendingPool;
  sToken.save();
}

/**
 * Create new VToken and start indexing it.
 * @param event
 */
export function handleVariableDebtTokenUpgraded(event: VariableDebtTokenUpgraded): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let reserve = getOrInitReserve(event.params.asset.toHexString(), lendingPool, event);
  reserve.variableDebtToken = event.params.proxy.toHexString();
  reserve.save();

  // store basic vToken info
  let vToken = getOrCreateVariableDebtToken(event.params.proxy.toHexString());
  vToken.underlyingAsset = reserve.asset;
  vToken.lendingPool = reserve.lendingPool;
  vToken.save();
}
