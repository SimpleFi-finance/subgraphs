import { Address, ethereum } from "@graphprotocol/graph-ts";

import { CToken } from "../../generated/schema";

import { CToken as CTokenContract } from "../../generated/templates/CToken/CToken";

import { getOrCreateERC20Token, getOrCreateMarketWithId } from "../library/common";

export function getOrCreateCToken(address: string, comptroller: string, event: ethereum.Event) {
  let cToken = CToken.load(address);
  if (cToken != null) {
    return cToken as CToken;
  }

  let cTokenContract = CTokenContract.bind(Address.fromString(address));
  let underlyingAsset = getOrCreateERC20Token(event, cTokenContract.underlying());

  cToken = new CToken(address);
  cToken.comptroller = comptroller;
  cToken.underlying = underlyingAsset.id;
  cToken.cTokenName = cTokenContract.name();
  cToken.cTokenSymbol = cTokenContract.symbol();
  cToken.cTokenDecimals = cTokenContract.decimals();
  cToken.transactionHash = event.transaction.hash.toHexString();
  cToken.save();

  return cToken as CToken;
}
