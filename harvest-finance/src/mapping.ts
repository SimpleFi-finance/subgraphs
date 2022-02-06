import {AddVaultAndStrategyCall, DoHardWorkCall, SharePriceChangeLog} from "../generated/HarvestEthController/HarvestEthController";
import { Market } from "../generated/schema";
import { ADDRESS_ZERO, deposit, getOrCreateAccount, getOrCreateERC20Token, getOrCreateMarket, getOrCreateVault, investInMarket, redeemFromMarket, TokenBalance, updateMarket, withdraw } from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";
import { Transfer } from "../generated/templates/Vault/Vault";
import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";

import { Vault } from '../generated/templates'
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";


export function addVaultAndStrategy(add: AddVaultAndStrategyCall): void {
  
  let fAssetToken = VaultContract.bind(add.inputs._vault);
  let underlying = fAssetToken.try_underlying();
  if(underlying.reverted) {
    return;
  }

  let underlyingUnit = fAssetToken.try_underlyingUnit();
  if(underlyingUnit.reverted) {
    return;
  }

  let pricePerShare = fAssetToken.try_getPricePerFullShare();
  if(pricePerShare.reverted) {
    return;
  }

  // output
  let fAssetTokenERC20 = getOrCreateERC20Token(add.block, add.inputs._vault);

  // input
  let assetERC20 = getOrCreateERC20Token(add.block, underlying.value);

  // reward
  let farmERC20 = getOrCreateERC20Token(add.block, FARM_TOKEN_ADDRESS);
  
  let vault = getOrCreateVault(add.inputs._vault);
  vault.underlyingToken = underlying.value.toHexString();
  vault.underlyingUnit = underlyingUnit.value;
  vault.pricePerShare = pricePerShare.value;
  vault.save();
  

  getOrCreateMarket(
    add.block,
    add.inputs._vault,
    ProtocolName.HARVEST_FINANCE,
    ProtocolType.LP_FARMING,
    [assetERC20], // Asset
    fAssetTokenERC20, // fAsset
    [farmERC20], // FARM
  )

  Vault.create(add.inputs._vault);
}

// update fAsset - mint/burn/transfer of users
export function handleTransfer(event: Transfer): void {
  if(event.params.from.toHexString() == ADDRESS_ZERO) {
    deposit(event);
  } else if(event.params.to.toHexString() == ADDRESS_ZERO) {
    withdraw(event);
  } else {
    deposit(event);
    withdraw(event);
  }
}

export function updateSharePrice(event: SharePriceChangeLog): void {
  let market = Market.load(event.params.vault.toHexString()) as Market;
  let vault = getOrCreateVault(event.params.vault);
  vault.pricePerShare = event.params.newSharePrice;
  vault.save();
  
  let outputTokenBalance = market.outputTokenTotalSupply;
  let inputTokenBalance = outputTokenBalance.div(vault.pricePerShare!).times(vault.underlyingUnit!);

  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken!, event.params.vault.toHexString(), inputTokenBalance)
  ];

  updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
}
