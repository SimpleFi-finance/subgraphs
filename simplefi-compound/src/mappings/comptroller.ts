import { Address } from "@graphprotocol/graph-ts";

import { MarketListed } from "../../generated/Comptroller/Comptroller";

import { Token } from "../../generated/schema";

import { ProtocolName, ProtocolType } from "../library/constants";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";
import { getOrCreateCToken } from "../library/cTokenUtils";

export function handleMarketListed(event: MarketListed): void {
  let cTokenAddress = event.params.cToken;

  let cToken = getOrCreateCToken(cTokenAddress.toHexString(), event.address.toHexString(), event);
  let underlying = getOrCreateERC20Token(event, Address.fromString(cToken.underlying));

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
  inputTokens = [underlying];
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
}
