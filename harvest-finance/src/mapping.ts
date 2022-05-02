import {
  AddVaultAndStrategyCall,
  SharePriceChangeLog,
} from "../generated/HarvestEthController/HarvestEthController";
import { Deposit, Market, Token } from "../generated/schema";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";
import { Deposit as DepositEvent, Transfer, Withdraw } from "../generated/templates/Vault/Vault";
import { Vault } from "../generated/templates";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { getOrCreatePositionInVault, getOrCreateVault } from "./harvestUtils";

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
 * Handle user deposits to vault
 * @param event
 */
export function handleDeposit(event: DepositEvent): void {
  let depositedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.beneficiary);

  // update vault state
  let vault = getOrCreateVault(event.block, event.address);
  let mintedAmount = depositedAmount.times(vault.underlyingUnit).div(vault.pricePerShare);
  vault.totalSupply = vault.totalSupply.plus(mintedAmount);
  vault.save();

  // update market state
  let market = Market.load(vault.id) as Market;
  let inputTokenBalance = vault.totalSupply.times(vault.pricePerShare).div(vault.underlyingUnit);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken, vault.id, inputTokenBalance),
  ];
  updateMarket(event, market, inputTokenBalances, vault.totalSupply);

  //// update user position
  let outputTokenAmount = mintedAmount;
  let inputTokenAmounts = [new TokenBalance(vault.underlyingToken, user.id, depositedAmount)];
  let rewardTokensAmounts: TokenBalance[] = [];

  let position = getOrCreatePositionInVault(user, vault);
  position.fTokenBalance = position.fTokenBalance.plus(mintedAmount);
  position.save();

  let outputTokenBalance = position.fTokenBalance;
  let userInputTokenBalance = position.fTokenBalance
    .times(vault.pricePerShare)
    .div(vault.underlyingUnit);
  let userInputTokenBalances = [
    new TokenBalance(vault.underlyingToken, user.id, userInputTokenBalance),
  ];
  let rewardTokensBalance: TokenBalance[] = [];

  investInMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokensAmounts,
    outputTokenBalance,
    userInputTokenBalances,
    rewardTokensBalance,
    null
  );
}

/**
 * Handle user withdrawals from vault.
 * @param event
 */
export function handleWithdraw(event: Withdraw): void {
  let withdrawnAmountOfUnderlying = event.params.amount;
  let receiver = getOrCreateAccount(event.params.beneficiary);

  // update vault state
  let vault = getOrCreateVault(event.block, event.address);
  let burndedAmountOfFTokens = withdrawnAmountOfUnderlying
    .times(vault.underlyingUnit)
    .div(vault.pricePerShare);
  vault.totalSupply = vault.totalSupply.minus(burndedAmountOfFTokens);
  vault.save();

  // update market state
  let market = Market.load(vault.id) as Market;
  let inputTokenBalance = vault.totalSupply.times(vault.pricePerShare).div(vault.underlyingUnit);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken, vault.id, inputTokenBalance),
  ];
  updateMarket(event, market, inputTokenBalances, vault.totalSupply);

  //// update user position
  let outputTokenAmount = burndedAmountOfFTokens;
  let inputTokenAmounts = [
    new TokenBalance(vault.underlyingToken, receiver.id, withdrawnAmountOfUnderlying),
  ];
  let rewardTokensAmounts: TokenBalance[] = [];

  let position = getOrCreatePositionInVault(receiver, vault);
  position.fTokenBalance = position.fTokenBalance.minus(burndedAmountOfFTokens);
  position.save();

  let outputTokenBalance = position.fTokenBalance;
  let userInputTokenBalance = position.fTokenBalance
    .times(vault.pricePerShare)
    .div(vault.underlyingUnit);
  let userInputTokenBalances = [
    new TokenBalance(vault.underlyingToken, receiver.id, userInputTokenBalance),
  ];
  let rewardTokensBalance: TokenBalance[] = [];

  redeemFromMarket(
    event,
    receiver,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokensAmounts,
    outputTokenBalance,
    userInputTokenBalances,
    rewardTokensBalance,
    null
  );
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
