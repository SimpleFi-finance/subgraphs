import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Deposit as DepositEntity,
  Market as MarketEntity,
  Vault as VaultEntity,
  VaultInputToken as VaultInputTokenEntity,
  Withdraw as WithdrawEntity
} from "../generated/schema";
import { Transfer as InputTokenTransfer } from "../generated/templates/StakeDAOVault/ERC20";
import { SetControllerCall, StakeDAOVault, Transfer as LPTokenTransfer } from "../generated/templates/StakeDAOVault/StakeDAOVault";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common";

export function handleSetController(call: SetControllerCall): void {
  let vault = VaultEntity.load(call.to.toHexString()) as VaultEntity
  vault.controller = call.inputs._controller.toHexString()
  vault.save()
}

export function handleTransfer(event: LPTokenTransfer): void {
  let vault = VaultEntity.load(event.address.toHexString()) as VaultEntity
  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  // mint
  if (fromHex == ADDRESS_ZERO) {
    let deposit = getOrCreateDeposit(event, vault, fromHex)
    deposit.lpTokenAmount = event.params.value
    deposit.lpTokenTransferEventApplied = true
    deposit.save()
    handleDeposit(event, deposit)
    return
  }

  // burn
  if (toHex == ADDRESS_ZERO) {
    let withdraw = getOrCreateWithdraw(event, vault, toHex)
    withdraw.lpTokenAmount = event.params.value
    withdraw.lpTokenTransferEventApplied = true
    withdraw.save()
    handleWithdraw(event, withdraw)
    return
  }

  transferOutpuToken(
    event,
    vault,
    event.params.from,
    event.params.to,
    event.params.value
  )
}

export function handleInputTokenTransfer(event: InputTokenTransfer): void {
  let vaultInputToken = VaultInputTokenEntity.load(event.address.toHexString()) as VaultInputTokenEntity
  let vault = VaultEntity.load(vaultInputToken.vault) as VaultEntity
  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  // Deposit
  if (toHex == vault.id) {
    let deposit = getOrCreateDeposit(event, vault, fromHex)
    deposit.inputTokenAmount = event.params.value
    deposit.inputTokenTransferEventApplied = true
    deposit.save()
    handleDeposit(event, deposit)
    return
  }

  // Withdraw
  if (fromHex == vault.id && toHex != vault.controller) {
    let withdraw = getOrCreateWithdraw(event, vault, toHex)
    withdraw.inputTokenAmount = event.params.value
    withdraw.inputTokenTransferEventApplied = true
    withdraw.save()
    handleWithdraw(event, withdraw)
    return
  }
}

function getOrCreateDeposit(event: ethereum.Event, vault: VaultEntity, account: string): DepositEntity {
  let id = event.transaction.hash.toHexString()
  let deposit = DepositEntity.load(id)
  if (deposit != null) {
    return deposit as DepositEntity
  }

  deposit = new DepositEntity(id)
  deposit.vault = vault.id
  deposit.account = account
  deposit.inputTokenTransferEventApplied = false
  deposit.lpTokenTransferEventApplied = false
  deposit.save()
  return deposit as DepositEntity
}

function getOrCreateWithdraw(event: ethereum.Event, vault: VaultEntity, account: string): WithdrawEntity {
  let id = event.transaction.hash.toHexString()
  let withdraw = WithdrawEntity.load(id)
  if (withdraw != null) {
    return withdraw as WithdrawEntity
  }

  withdraw = new WithdrawEntity(id)
  withdraw.vault = vault.id
  withdraw.account = account
  withdraw.inputTokenTransferEventApplied = false
  withdraw.lpTokenTransferEventApplied = false
  withdraw.save()
  return withdraw as WithdrawEntity
}

function handleDeposit(event: ethereum.Event, deposit: DepositEntity): void {
  if (!deposit.inputTokenTransferEventApplied || !deposit.lpTokenTransferEventApplied) {
    return
  }

  let vault = VaultEntity.load(deposit.vault) as VaultEntity
  vault.totalSupply = vault.totalSupply.plus(deposit.lpTokenAmount as BigInt)
  vault.balance = StakeDAOVault.bind(Address.fromString(deposit.vault)).balance()
  vault.save()

  let market = MarketEntity.load(deposit.vault) as MarketEntity
  updateMarket(
    event, 
    market,
    [new TokenBalance(vault.token, deposit.account, vault.balance)],
    vault.totalSupply
  )
  
  let account = getOrCreateAccount(Address.fromString(deposit.account))
  let accountLiquidity = getOrCreateLiquidity(vault, Address.fromString(deposit.account))
  accountLiquidity.balance = accountLiquidity.balance.plus(deposit.lpTokenAmount as BigInt)
  accountLiquidity.save()
  
  let inputTokenAmounts: TokenBalance[] = []
  let inputTokenBalances: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(vault.token, deposit.account, deposit.inputTokenAmount as BigInt))
  inputTokenBalances.push(new TokenBalance(vault.token, deposit.account, accountLiquidity.balance.times(vault.balance).div(vault.totalSupply)))

  investInMarket(
    event,
    account,
    market,
    deposit.lpTokenAmount as BigInt,
    inputTokenAmounts,
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

function handleWithdraw(event: ethereum.Event, withdraw: WithdrawEntity): void {
  if (!withdraw.inputTokenTransferEventApplied || !withdraw.lpTokenTransferEventApplied) {
    return
  }

  let vault = VaultEntity.load(withdraw.vault) as VaultEntity
  vault.totalSupply = vault.totalSupply.minus(withdraw.lpTokenAmount as BigInt)
  vault.balance = StakeDAOVault.bind(Address.fromString(withdraw.vault)).balance()
  vault.save()

  let market = MarketEntity.load(withdraw.vault) as MarketEntity
  updateMarket(
    event,
    market,
    [new TokenBalance(vault.token, withdraw.account, vault.balance)],
    vault.totalSupply
  )
  
  let account = getOrCreateAccount(Address.fromString(withdraw.account))
  let accountLiquidity = getOrCreateLiquidity(vault, Address.fromString(withdraw.account))
  accountLiquidity.balance = accountLiquidity.balance.minus(withdraw.lpTokenAmount as BigInt)
  accountLiquidity.save()
  
  let inputTokenAmounts: TokenBalance[] = []
  let inputTokenBalances: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(vault.token, withdraw.account, withdraw.inputTokenAmount as BigInt))
  inputTokenBalances.push(new TokenBalance(vault.token, withdraw.account, accountLiquidity.balance.times(vault.balance).div(vault.totalSupply)))

  redeemFromMarket(
    event,
    account,
    market,
    withdraw.lpTokenAmount as BigInt,
    inputTokenAmounts,
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

function getOrCreateLiquidity(vault: VaultEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = vault.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.vault = vault.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function transferOutpuToken(event: ethereum.Event, vault: VaultEntity, from: Address, to: Address, value: BigInt): void {
  let market = new MarketEntity(vault.id)

  let fromAccount = getOrCreateAccount(from)
  let fromAccountLiquidity = getOrCreateLiquidity(vault, from)
  fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(value)
  fromAccountLiquidity.save()

  let fromOutputTokenBalance = fromAccountLiquidity.balance
  let fromInputTokenBalances: TokenBalance[] = []
  let fromTokenBalance = fromOutputTokenBalance.times(vault.balance).div(vault.totalSupply)
  fromInputTokenBalances.push(new TokenBalance(vault.token, fromAccount.id, fromTokenBalance))
  redeemFromMarket(
    event,
    fromAccount,
    market,
    value,
    [],
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to.toHexString()
  )

  let toAccount = getOrCreateAccount(to)
  let toAccountLiquidity = getOrCreateLiquidity(vault, to)
  toAccountLiquidity.balance = toAccountLiquidity.balance.plus(value)
  toAccountLiquidity.save()

  let toOutputTokenBalance = toAccountLiquidity.balance
  let toInputTokenBalances: TokenBalance[] = []
  let toTokenBalance = toOutputTokenBalance.times(vault.balance).div(vault.totalSupply)
  toInputTokenBalances.push(new TokenBalance(vault.token, toAccount.id, toTokenBalance))

  investInMarket(
    event,
    toAccount,
    market,
    value,
    [],
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from.toHexString()
  )
}