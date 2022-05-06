import {
  AddVaultAndStrategyCall,
  SetFeeRewardForwarderCall,
  SharePriceChangeLog,
} from "../generated/HarvestEthController1/HarvestEthController";
import { Market } from "../generated/schema";
import { TokenBalance, updateMarket } from "./common";
import {
  getOrCreateFeeRewardForwarder,
  getOrCreateHarvestController,
  getOrCreateVault,
} from "./harvestUtils";

/**
 * Call handler used to listen for new vaults
 * @param call
 */
export function addVaultAndStrategy(call: AddVaultAndStrategyCall): void {
  getOrCreateHarvestController(call.to.toHexString());

  getOrCreateVault(call.block, call.inputs._vault);
}

/**
 * Call handler used to track fee reward forwarder
 * @param call
 */
export function setFeeRewardForwarder(call: SetFeeRewardForwarderCall): void {
  getOrCreateHarvestController(call.to.toHexString());

  let feeRewardForwarder = call.inputs._feeRewardForwarder;
  getOrCreateFeeRewardForwarder(feeRewardForwarder.toHexString());
}

/**
 * Update vault's input token balances when share price is changed
 * @param event
 */
export function handleSharePriceChangeLog(event: SharePriceChangeLog): void {
  getOrCreateHarvestController(event.address.toHexString());

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
