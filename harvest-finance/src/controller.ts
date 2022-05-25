import {
  AddVaultAndStrategyCall,
  SetFeeRewardForwarderCall,
  SharePriceChangeLog,
} from "../generated/HarvestEthController1/HarvestEthController";
import { Market } from "../generated/schema";
import { TokenBalance, updateMarket } from "./common";
import {
  createFakeEventFromCall,
  getOrCreateFeeRewardForwarder,
  getOrCreateHarvestController,
  getOrCreateVault,
} from "./harvestUtils";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";

/**
 * Call handler used to listen for new vaults
 * @param call
 */
export function addVaultAndStrategy(call: AddVaultAndStrategyCall): void {
  getOrCreateHarvestController(createFakeEventFromCall(call), call.to.toHexString());

  let vaultAddress = call.inputs._vault;

  // quick check if contract implements IVault interface
  let vaultContract = VaultContract.bind(vaultAddress);
  if (
    vaultContract.try_getPricePerFullShare().reverted ||
    vaultContract.try_underlyingUnit().reverted
  ) {
    return;
  }

  // create new vault
  getOrCreateVault(createFakeEventFromCall(call), vaultAddress);
}

/**
 * Call handler used to track fee reward forwarder
 * @param call
 */
export function setFeeRewardForwarder(call: SetFeeRewardForwarderCall): void {
  let controller = getOrCreateHarvestController(
    createFakeEventFromCall(call),
    call.to.toHexString()
  );

  let forwarderAddress = call.inputs._feeRewardForwarder;
  let forwarder = getOrCreateFeeRewardForwarder(
    createFakeEventFromCall(call),
    forwarderAddress.toHexString()
  );

  controller.feeRewardForwarder = forwarder.id;
  controller.save();
}

/**
 * Update vault's input token balances when share price is changed
 * @param event
 */
export function handleSharePriceChangeLog(event: SharePriceChangeLog): void {
  getOrCreateHarvestController(event, event.address.toHexString());

  // quick check if contract implements IVault interface
  let vaultContract = VaultContract.bind(event.params.vault);
  if (
    vaultContract.try_getPricePerFullShare().reverted ||
    vaultContract.try_underlyingUnit().reverted
  ) {
    return;
  }

  // update vault's pricePerShare
  let vault = getOrCreateVault(event, event.params.vault);
  vault.pricePerShare = event.params.newSharePrice;
  vault.save();

  // update market state
  let market = Market.load(event.params.vault.toHexString()) as Market;
  let outputTokenBalance = market.outputTokenTotalSupply;
  let inputTokenBalance = outputTokenBalance.times(vault.pricePerShare).div(vault.underlyingUnit);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken, event.params.vault.toHexString(), inputTokenBalance),
  ];

  updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
}
