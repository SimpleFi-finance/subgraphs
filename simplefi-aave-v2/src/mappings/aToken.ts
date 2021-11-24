import { Address, BigInt, ethereum, log, dataSource } from "@graphprotocol/graph-ts";

import { Burn, Mint, Initialized } from "../../generated/templates/AToken/AToken";

import { Market, AToken } from "../../generated/schema";

import { updateMarket, TokenBalance, ADDRESS_ZERO } from "../library/common";

import {
  aTokenScaledTotalSupply,
  getOrCreateIncentivesController,
} from "../library/lendingPoolUtils";

export function handleATokenMint(event: Mint): void {
  let mintedAmount = event.params.value;

  //fetch lending pool and base asset address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");
  let baseAsset = context.getString("baseAsset");

  let market = Market.load(lendingPool + "-" + baseAsset) as Market;

  // update market total supply
  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.plus(mintedAmount);

  let inputTokens = market.inputTokens as string[];
  let scaledATokens = aTokenScaledTotalSupply(market, event);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, scaledATokens),
  ];
  updateMarket(event, market, inputTokenBalances, newTotalSupply);
}

export function handleATokenBurn(event: Burn): void {
  let burnedAmount = event.params.value;

  //fetch lending pool and base asset address from context
  let context = dataSource.context();
  let lendingPool = context.getString("lendingPool");
  let baseAsset = context.getString("baseAsset");

  let market = Market.load(lendingPool + "-" + baseAsset) as Market;

  // update market total supply
  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.minus(burnedAmount);

  let inputTokens = market.inputTokens as string[];
  let scaledATokens = aTokenScaledTotalSupply(market, event);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, scaledATokens),
  ];
  updateMarket(event, market, inputTokenBalances, newTotalSupply);
}

export function handleATokenInitialized(event: Initialized): void {
  let aTokenAdress = event.address.toHexString();

  let aToken = AToken.load(aTokenAdress);
  if (aToken == null) {
    aToken = new AToken(aTokenAdress);
  }

  aToken.underlyingAsset = event.params.underlyingAsset.toHexString();
  aToken.treasury = event.params.treasury.toHexString();
  aToken.lendingPool = event.params.pool.toHexString();
  aToken.incentivesController = event.params.incentivesController.toHexString();
  aToken.aTokenName = event.params.aTokenName;
  aToken.aTokenSymbol = event.params.aTokenSymbol;
  aToken.aTokenDecimals = event.params.aTokenDecimals;
  aToken.save();

  if (aToken.incentivesController != ADDRESS_ZERO) {
    // create incentive controller if it's not already created
    getOrCreateIncentivesController(event, aToken.incentivesController, aToken.lendingPool);
  }
}
