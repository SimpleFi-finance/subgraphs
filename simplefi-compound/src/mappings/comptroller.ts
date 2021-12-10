import { log } from "@graphprotocol/graph-ts";

import { MarketListed } from "../../generated/Comptroller/Comptroller";

import { CToken } from "../../generated/schema";

export function handleMarketListed(event: MarketListed): void {
  let cTokenAddress = event.params.cToken;

  let cToken = new CToken(cTokenAddress.toHexString());
  cToken.transactionHash = event.transaction.hash.toHexString();
  cToken.save();
}
