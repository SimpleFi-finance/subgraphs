import { Address, BigInt, ethereum, log, dataSource } from "@graphprotocol/graph-ts";

import {
  CollateralConfigurationChanged,
  ReserveInitialized,
} from "../../generated/templates/LendingPoolConfigurator/LendingPoolConfigurator";

import { Reserve, Token } from "../../generated/schema";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

import { ProtocolName, ProtocolType } from "../library/constants";
import { getOrInitReserve } from "../library/lendingPoolUtils";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export function handleCollateralConfigurationChanged(event: CollateralConfigurationChanged): void {
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.ltv = event.params.ltv;
  reserve.save();
}

export function handleReserveInitialized(event: ReserveInitialized): void {
  //fetch lending pool address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");

  let asset = getOrCreateERC20Token(event, event.params.asset);
  let aToken = getOrCreateERC20Token(event, event.params.aToken);
  let stableDebtToken = getOrCreateERC20Token(event, event.params.stableDebtToken);
  let variableDebtToken = getOrCreateERC20Token(event, event.params.variableDebtToken);
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));

  // store reserve data
  let reserve = getOrInitReserve(event.params.asset, event);
  reserve.asset = asset.id;
  reserve.assetDecimals = asset.decimals;
  reserve.lendingPool = lendingPool;
  reserve.aToken = aToken.id;
  reserve.stableDebtToken = stableDebtToken.id;
  reserve.variableDebtToken = variableDebtToken.id;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.save();

  // create investment market representing the token-aToken pair
  let marketId = lendingPool + "-" + reserve.id;
  let marketAddress = Address.fromString(lendingPool);
  let protocolName = ProtocolName.AAVE_POOL;
  let protocolType = ProtocolType.LENDING;
  let inputTokens: Token[] = [asset];
  let outputToken = aToken;
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

  // create stable debt market representing the debt taken in reserve asset
  marketId = lendingPool + "-" + stableDebtToken.id;
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

  // create variable debt market representing the debt taken in reserve asset
  marketId = lendingPool + "-" + variableDebtToken.id;
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
}
