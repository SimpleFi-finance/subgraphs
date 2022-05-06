import {
  AddVaultAndStrategyCall,
  SetFeeRewardForwarderCall,
  SharePriceChangeLog,
} from "../generated/HarvestEthController1/HarvestEthController";
import { Vault, LPTokenTransferToZero, Market, Account } from "../generated/schema";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";
import {
  Deposit as DepositEvent,
  Transfer,
  Withdraw,
  Vault as VaultContract,
} from "../generated/templates/Vault/Vault";
import {
  getOrCreateFeeRewardForwarder,
  getOrCreateHarvestController,
  getOrCreatePositionInVault,
  getOrCreateVault,
} from "./harvestUtils";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

export function addVaultAndStrategy(call: AddVaultAndStrategyCall): void {
  getOrCreateHarvestController(call.to.toHexString());

  getOrCreateVault(call.block, call.inputs._vault);
}

export function setFeeRewardForwarder(call: SetFeeRewardForwarderCall): void {
  getOrCreateHarvestController(call.to.toHexString());

  let feeRewardForwarder = call.inputs._feeRewardForwarder;
  getOrCreateFeeRewardForwarder(feeRewardForwarder.toHexString());
}

/**
 * Handle user deposits to vault
 * @param event
 */
export function handleDeposit(event: DepositEvent): void {
  let depositedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.beneficiary);

  // check if there's a pending tx to zero
  let vault = getOrCreateVault(event.block, event.address);
  checkForUnprocessedTransferToZero(event, vault);

  // update vault state
  if (vault.pricePerShare == BigInt.fromI32(0)) {
    vault.pricePerShare = VaultContract.bind(event.address).getPricePerFullShare();
  }
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

  // check if there's a pending tx to zero
  let vault = getOrCreateVault(event.block, event.address);
  checkForUnprocessedTransferToZero(event, vault);
  vault.lastTransferToZero = null;

  // update vault state
  if (vault.pricePerShare == BigInt.fromI32(0)) {
    vault.pricePerShare = VaultContract.bind(event.address).getPricePerFullShare();
  }
  let burnedAmountOfFTokens = withdrawnAmountOfUnderlying
    .times(vault.underlyingUnit)
    .div(vault.pricePerShare);
  vault.totalSupply = vault.totalSupply.minus(burnedAmountOfFTokens);
  vault.save();

  // update market state
  let market = Market.load(vault.id) as Market;
  let inputTokenBalance = vault.totalSupply.times(vault.pricePerShare).div(vault.underlyingUnit);
  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(vault.underlyingToken, vault.id, inputTokenBalance),
  ];
  updateMarket(event, market, inputTokenBalances, vault.totalSupply);

  //// update user position
  let outputTokenAmount = burnedAmountOfFTokens;
  let inputTokenAmounts = [
    new TokenBalance(vault.underlyingToken, receiver.id, withdrawnAmountOfUnderlying),
  ];
  let rewardTokensAmounts: TokenBalance[] = [];

  let position = getOrCreatePositionInVault(receiver, vault);
  position.fTokenBalance = position.fTokenBalance.minus(burnedAmountOfFTokens);
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

/**
 * Handle vault (LP) token transfers
 * @param event
 * @returns
 */
export function handleTransfer(event: Transfer): void {
  if (event.params.from.toHexString() == ADDRESS_ZERO) {
    // minting, processed in handleDeposit
    return;
  } else if (event.params.from.toHexString() == ADDRESS_ZERO) {
    // store txToZero entity. later we check if it's part of burn event, or manual transfer to zero
    let txToZero = new LPTokenTransferToZero(event.transaction.hash.toHexString());
    txToZero.from = event.params.from;
    txToZero.to = event.params.to;
    txToZero.value = event.params.value;
    txToZero.save();

    let vault = getOrCreateVault(event.block, event.address);
    vault.lastTransferToZero = txToZero.id;
    vault.save();

    return;
  }

  let vault = getOrCreateVault(event.block, event.address);
  let fTokensTransferredAmount = event.params.value;

  let sender = getOrCreateAccount(event.params.from);
  let receiver = getOrCreateAccount(event.params.to);

  transferLPToken(sender, receiver, vault, fTokensTransferredAmount, event);
}

/**
 * Update vault state and user positions.
 * @param sender
 * @param receiver
 * @param vault
 * @param fTokensTransferredAmount
 * @param event
 */
function transferLPToken(
  sender: Account,
  receiver: Account,
  vault: Vault,
  fTokensTransferredAmount: BigInt,
  event: ethereum.Event
): void {
  //// update sender's position trackers
  let senderPosition = getOrCreatePositionInVault(sender, vault);
  senderPosition.fTokenBalance = senderPosition.fTokenBalance.minus(fTokensTransferredAmount);
  senderPosition.save();

  if (vault.pricePerShare == BigInt.fromI32(0)) {
    vault.pricePerShare = VaultContract.bind(event.address).getPricePerFullShare();
  }

  let market = Market.load(vault.id) as Market;
  let outputTokenAmount = fTokensTransferredAmount;
  let inputTokenAmounts: TokenBalance[] = [];
  let rewardTokenAmounts: TokenBalance[] = [];
  let outputTokenBalance = senderPosition.fTokenBalance;
  let inputTokenBalance = senderPosition.fTokenBalance
    .times(vault.pricePerShare)
    .div(vault.underlyingUnit);
  let inputTokenBalances = [new TokenBalance(vault.underlyingToken, sender.id, inputTokenBalance)];
  let rewardTokenBalances: TokenBalance[] = [];
  let transferredTo = receiver.id;

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
    transferredTo
  );

  //// update receiver's position trackers
  let receiverPosition = getOrCreatePositionInVault(receiver, vault);
  receiverPosition.fTokenBalance = receiverPosition.fTokenBalance.plus(fTokensTransferredAmount);
  receiverPosition.save();

  inputTokenAmounts = [];
  rewardTokenAmounts = [];
  outputTokenBalance = receiverPosition.fTokenBalance;
  inputTokenBalance = receiverPosition.fTokenBalance
    .times(vault.pricePerShare)
    .div(vault.underlyingUnit);
  inputTokenBalances = [new TokenBalance(vault.underlyingToken, receiver.id, inputTokenBalance)];
  rewardTokenBalances = [];
  let transferredFrom = sender.id;

  investInMarket(
    event,
    sender,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    transferredFrom
  );
}

/**
 * Check if there is a pending transfer of LP tokens to zero address.
 * If yes, and it is not part of add/remove liquidity events, then update sender's position
 * Otherwise positions will be updated in add/remove liquidity handlers
 * @param event
 * @param pool
 * @returns
 */
function checkForUnprocessedTransferToZero(event: ethereum.Event, vault: Vault): void {
  // This no unprocessed LP token transfer to zero address
  if (vault.lastTransferToZero == null) {
    return;
  }

  // This LP token transfer to zero address is part of burn event, don't handle it here
  if (vault.lastTransferToZero == event.transaction.hash.toHexString()) {
    return;
  }

  // It's a manual transfer to zero address, not part of burn event
  // use standard LP token transfer processing
  let txToZero = LPTokenTransferToZero.load(
    vault.lastTransferToZero as string
  ) as LPTokenTransferToZero;
  transferLPToken(
    getOrCreateAccount(txToZero.from as Address),
    getOrCreateAccount(txToZero.to as Address),
    vault,
    txToZero.value,
    event
  );

  vault.lastTransferToZero = null;
  vault.save();
}
