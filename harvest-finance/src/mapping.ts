import {
  AddVaultAndStrategyCall,
  SharePriceChangeLog,
} from "../generated/HarvestEthController/HarvestEthController";
import { Market } from "../generated/schema";
import {
  ADDRESS_ZERO,
  getOrCreateERC20Token,
  getOrCreateMarket,
  TokenBalance,
  updateMarket,
} from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";
import { Transfer } from "../generated/templates/Vault/Vault";
import { Vault } from "../generated/templates";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { getOrCreateVault } from "./harvestUtils";

export function addVaultAndStrategy(call: AddVaultAndStrategyCall): void {
  getOrCreateVault(call.block, call.inputs._vault);
}

// update fAsset - mint/burn/transfer of users
export function handleTransfer(event: Transfer): void {
  // if (event.params.from.toHexString() == ADDRESS_ZERO) {
  //   deposit(event);
  // } else if (event.params.to.toHexString() == ADDRESS_ZERO) {
  //   withdraw(event);
  // } else {
  //   deposit(event);
  //   withdraw(event);
  // }
}

/**
 * Update vault's input token balances when share price is changed
 * @param event
 */
export function handleSharePriceChangeLog(event: SharePriceChangeLog): void {
  let market = Market.load(event.params.vault.toHexString()) as Market;

  let vault = getOrCreateVault(event.block, event.params.vault);
  vault.pricePerShare = event.params.newSharePrice;
  vault.save();

  let outputTokenBalance = market.outputTokenTotalSupply;
  let inputTokenBalance = outputTokenBalance.times(vault.pricePerShare).div(vault.underlyingUnit);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken, event.params.vault.toHexString(), inputTokenBalance),
  ];

  updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
}
