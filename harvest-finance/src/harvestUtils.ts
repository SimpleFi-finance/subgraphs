import { Address, BigInt, ethereum, ValueKind } from "@graphprotocol/graph-ts";
import { Account, Market, PositionInVault, Vault } from "../generated/schema";
import { Transfer } from "../generated/templates/Vault/Vault";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { Vault as VaultTemplate } from "../generated/templates";

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";

/**
 * Create new Vault and Market entities, and start indexing new vault contract.
 * @param block
 * @param vaultAddress
 * @returns
 */
export function getOrCreateVault(block: ethereum.Block, vaultAddress: Address): Vault {
  let vault = Vault.load(vaultAddress.toHexString());
  if (vault != null) {
    return vault as Vault;
  }

  // create Vault entity
  let fAssetToken = VaultContract.bind(vaultAddress);
  vault = new Vault(vaultAddress.toHexString());
  vault.name = fAssetToken.name();
  vault.totalSupply = fAssetToken.totalSupply();
  vault.strategy = fAssetToken.strategy().toHexString();
  vault.underlyingUnit = fAssetToken.underlyingUnit();
  let inputToken = getOrCreateERC20Token(block, fAssetToken.underlying());
  vault.underlyingToken = inputToken.id;
  vault.pricePerShare = fAssetToken.getPricePerFullShare();
  vault.save();

  // create Market entity
  let outputToken = getOrCreateERC20Token(block, vaultAddress);
  let farmToken = getOrCreateERC20Token(block, FARM_TOKEN_ADDRESS);
  getOrCreateMarket(
    block,
    vaultAddress,
    ProtocolName.HARVEST_FINANCE,
    ProtocolType.TOKEN_MANAGEMENT,
    [inputToken],
    outputToken,
    [farmToken]
  );

  // start indexing new vault
  VaultTemplate.create(vaultAddress);

  return vault;
}

/**
 * Create tracker for user's position in a vault.
 * @param user
 * @param vault
 * @returns
 */
export function getOrCreatePositionInVault(user: Account, vault: Vault): PositionInVault {
  let id = user.id + "-" + vault.id;
  let position = PositionInVault.load(id);
  if (position != null) {
    return position as PositionInVault;
  }

  position = new PositionInVault(id);
  position.user = user.id;
  position.vault = vault.id;
  position.fTokenBalance = BigInt.fromI32(0);
  position.save();

  return position;
}

// export function deposit(event: Transfer): void {
//   let vault = getOrCreateVault(event.block, event.address);
//   let market = Market.load(vault.id) as Market;
//   let receiver = getOrCreateAccount(event.params.to);
//   let balance = getOrCreateVaultBalance(event.params.to, vault);
//   balance.balance = balance.balance.plus(event.params.value);
//   balance.save();

//   let outputTokenBalance = balance.balance;

//   let inputTokenAmount = event.params.value.times(vault.pricePerShare!).div(vault.underlyingUnit!);
//   let inputTokenBalance = outputTokenBalance.div(vault.pricePerShare!).times(vault.underlyingUnit!);

//   let inputTokenAmounts = [
//     new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenAmount),
//   ];

//   // @todo
//   let rewardTokenAmounts: TokenBalance[] = [];
//   let rewardTokenBalances: TokenBalance[] = [];

//   let inputTokenBalances: TokenBalance[] = [
//     new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenBalance),
//   ];

//   let outputTokenAmount = event.params.value;

//   investInMarket(
//     event,
//     receiver,
//     market,
//     outputTokenAmount,
//     inputTokenAmounts,
//     rewardTokenAmounts,
//     outputTokenBalance,
//     inputTokenBalances,
//     rewardTokenBalances,
//     null
//   );

//   updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
// }

// export function withdraw(event: Transfer): void {
//   let vault = getOrCreateVault(event.address);
//   let market = Market.load(vault.id) as Market;
//   let sender = getOrCreateAccount(event.params.from);
//   let balance = getOrCreateVaultBalance(event.params.from, vault);
//   balance.balance = balance.balance.minus(event.params.value);
//   balance.save();

//   let outputTokenBalance = balance.balance;

//   let inputTokenAmount = event.params.value.times(vault.pricePerShare!).div(vault.underlyingUnit!);
//   let inputTokenBalance = outputTokenBalance.div(vault.pricePerShare!).times(vault.underlyingUnit!);

//   let inputTokenAmounts = [
//     new TokenBalance(market.inputTokens[0], event.params.from.toHexString(), inputTokenAmount),
//   ];

//   // @todo
//   let rewardTokenAmounts: TokenBalance[] = [];
//   let rewardTokenBalances: TokenBalance[] = [];

//   let inputTokenBalances: TokenBalance[] = [
//     new TokenBalance(market.inputTokens[0], event.params.from.toHexString(), inputTokenBalance),
//   ];

//   let outputTokenAmount = event.params.value;

//   redeemFromMarket(
//     event,
//     sender,
//     market,
//     outputTokenAmount,
//     inputTokenAmounts,
//     rewardTokenAmounts,
//     outputTokenBalance,
//     inputTokenBalances,
//     rewardTokenBalances,
//     null
//   );

//   updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
// }
