import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Market, Vault, VaultBalance } from "../generated/schema";
import { Transfer } from "../generated/templates/Vault/Vault";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";

export function getOrCreateVault(address: Address): Vault {
  let vault = Vault.load(address.toHexString());
  if (!vault) {
    vault = new Vault(address.toHexString());
  }

  return vault;
}

export function getOrCreateVaultBalance(address: Address, vault: Vault): VaultBalance {
  let id = vault.id + "-" + address.toHexString();
  let balance = VaultBalance.load(id);
  if (!balance) {
    balance = new VaultBalance(id);
    balance.balance = BigInt.fromI32(0);
    balance.vault = vault.id;
    balance.owner = address;
  }

  return balance;
}

export function deposit(event: Transfer): void {
  let vault = getOrCreateVault(event.address);
  let market = Market.load(vault.id) as Market;
  let receiver = getOrCreateAccount(event.params.to);
  let balance = getOrCreateVaultBalance(event.params.to, vault);
  balance.balance = balance.balance.plus(event.params.value);
  balance.save();

  let outputTokenBalance = balance.balance;

  let inputTokenAmount = event.params.value.times(vault.pricePerShare!).div(vault.underlyingUnit!);
  let inputTokenBalance = outputTokenBalance.div(vault.pricePerShare!).times(vault.underlyingUnit!);

  let inputTokenAmounts = [
    new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenAmount),
  ];

  // @todo
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokenBalances: TokenBalance[] = [];

  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenBalance),
  ];

  let outputTokenAmount = event.params.value;

  investInMarket(
    event,
    receiver,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );

  updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
}

export function withdraw(event: Transfer): void {
  let vault = getOrCreateVault(event.address);
  let market = Market.load(vault.id) as Market;
  let sender = getOrCreateAccount(event.params.from);
  let balance = getOrCreateVaultBalance(event.params.from, vault);
  balance.balance = balance.balance.minus(event.params.value);
  balance.save();

  let outputTokenBalance = balance.balance;

  let inputTokenAmount = event.params.value.times(vault.pricePerShare!).div(vault.underlyingUnit!);
  let inputTokenBalance = outputTokenBalance.div(vault.pricePerShare!).times(vault.underlyingUnit!);

  let inputTokenAmounts = [
    new TokenBalance(market.inputTokens[0], event.params.from.toHexString(), inputTokenAmount),
  ];

  // @todo
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokenBalances: TokenBalance[] = [];

  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(market.inputTokens[0], event.params.from.toHexString(), inputTokenBalance),
  ];

  let outputTokenAmount = event.params.value;

  redeemFromMarket(
    event,
    sender,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );

  updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
}
