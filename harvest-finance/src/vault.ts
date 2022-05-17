import {
  Vault,
  LPTokenTransferToZero,
  Market,
  Account,
  VaultDeposit,
  VaultWithdrawal,
  LPTokenTransferFromZero,
} from "../generated/schema";
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
import { getOrCreatePositionInVault, getOrCreateVault } from "./harvestUtils";
import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

/**
 * Handle user deposits to vault
 * @param event
 */
export function handleDeposit(event: DepositEvent): void {
  let depositedAmount = event.params.amount;
  let user = getOrCreateAccount(event.params.beneficiary);
  let tx = event.transaction.hash.toHexString();

  // check if there's a pending tx to zero
  let vault = getOrCreateVault(event, event.address);
  checkForUnprocessedTransferToZero(event, vault);

  //// update vault state

  // get amount of minted fTokens by fetching value of preceding Transfer event
  let precedingTransfer = LPTokenTransferFromZero.load(tx) as LPTokenTransferFromZero;
  let mintedAmount = precedingTransfer.value;
  vault.totalSupply = vault.totalSupply.plus(mintedAmount);
  vault.save();

  //// create deposit entity
  let deposit = new VaultDeposit(
    event.transaction.hash.toHexString() + "-" + event.transaction.index.toString()
  );
  deposit.user = user.id;
  deposit.vault = vault.id;
  deposit.transactionHash = event.transaction.hash.toHexString();
  deposit.depositAmount = depositedAmount;
  deposit.mintedAmount = mintedAmount;
  deposit.save();

  //// update market state
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

  // remove helper entity, so that more mint transfers can be createdin same TX
  store.remove("LPTokenTransferFromZero", tx);
}

/**
 * Handle user withdrawals from vault.
 * @param event
 */
export function handleWithdraw(event: Withdraw): void {
  let withdrawnAmountOfUnderlying = event.params.amount;
  let receiver = getOrCreateAccount(event.params.beneficiary);
  let tx = event.transaction.hash.toHexString();

  // check if there's a pending tx to zero
  let vault = getOrCreateVault(event, event.address);
  checkForUnprocessedTransferToZero(event, vault);
  vault.lastTransferToZero = null;

  //// update vault state

  // get amount of burned fTokens by fetching value of preceding Transfer event
  let precedingTransfer = LPTokenTransferToZero.load(tx) as LPTokenTransferToZero;
  let burnedAmountOfFTokens = precedingTransfer.value;
  vault.totalSupply = vault.totalSupply.minus(burnedAmountOfFTokens);
  vault.save();

  //// create withdrawal entity
  let withdrawal = new VaultWithdrawal(
    event.transaction.hash.toHexString() + "-" + event.transaction.index.toString()
  );
  withdrawal.user = receiver.id;
  withdrawal.vault = vault.id;
  withdrawal.transactionHash = event.transaction.hash.toHexString();
  withdrawal.withdrawnAmount = withdrawnAmountOfUnderlying;
  withdrawal.burnedAmount = burnedAmountOfFTokens;
  withdrawal.save();

  /// update market state
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

  // remove helper entity, so that more burn transfers can be created in same TX
  store.remove("LPTokenTransferToZero", tx);
}

/**
 * Handle vault (LP) token transfers
 * @param event
 * @returns
 */
export function handleTransfer(event: Transfer): void {
  if (event.params.from.toHexString() == ADDRESS_ZERO) {
    // minting, create LPTokenTransferFromZero which will be processed further in handleDeposit
    let transfer = new LPTokenTransferFromZero(event.transaction.hash.toHexString());
    transfer.from = event.params.from;
    transfer.to = event.params.to;
    transfer.value = event.params.value;
    transfer.save();
    return;
  } else if (event.params.to.toHexString() == ADDRESS_ZERO) {
    // store TransferToZero entity. later we check if it's part of Withdraw event, or manual transfer to zero
    let transfer = new LPTokenTransferToZero(event.transaction.hash.toHexString());
    transfer.from = event.params.from;
    transfer.to = event.params.to;
    transfer.value = event.params.value;
    transfer.save();

    let vault = getOrCreateVault(event, event.address);
    vault.lastTransferToZero = transfer.id;
    vault.save();

    return;
  }

  let vault = getOrCreateVault(event, event.address);
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
    receiver,
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
