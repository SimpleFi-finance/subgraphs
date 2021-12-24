import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts"
import {
  AccountLiquidityFP as AccountLiquidityEntity,
  FeederPool as FeederPoolEntity,
  FPSwap as FPSwapEntity,
  FPTransferToZero as FPLastTransferToZeroEntity,
  Market as MarketEntity
} from "../generated/schema"
import {
  Minted,
  MintedMulti,
  Redeemed,
  RedeemedMulti,
  SwapCall,
  Swapped,
  Transfer
} from "../generated/templates/FeederPool/FeederPool"
import {
  ADDRESS_ZERO,
  getOrCreateAccount, investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common"


function getOrCreateLiquidity(feederPool: FeederPoolEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = feederPool.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.mAsset = feederPool.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function updateMAsset(
  event: ethereum.Event,
  feederPool: FeederPoolEntity,
  mAssetBalance: BigInt,
  fAssetBalance: BigInt,
  totalSupply: BigInt
): FeederPoolEntity {
  feederPool.mAssetBalance = mAssetBalance
  feederPool.fAssetBalance = fAssetBalance
  feederPool.totalSupply = totalSupply
  feederPool.save()

  let market = MarketEntity.load(feederPool.id) as MarketEntity

  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(feederPool.mAsset, feederPool.id, mAssetBalance))
  inputTokenBalances.push(new TokenBalance(feederPool.fAsset, feederPool.id, fAssetBalance))

  updateMarket(
    event,
    market,
    inputTokenBalances,
    totalSupply
  )

  return feederPool
}

function handleMint(
  event: ethereum.Event,
  feederPool: FeederPoolEntity,
  minter: string,
  recipient: Address,
  fpAssetQuantity: BigInt,
  mAssetQuantity: BigInt,
  fAssetQuantity: BigInt
): void {
  // update mAsset and market
  let oldTotalSupply = feederPool.totalSupply
  let newTotalSupply = oldTotalSupply.plus(fpAssetQuantity)

  let newMAssetBalance = feederPool.mAssetBalance.plus(mAssetQuantity)
  let newFAssetBalance = feederPool.fAssetBalance.plus(fAssetQuantity)

  feederPool = updateMAsset(
    event,
    feederPool,
    newMAssetBalance,
    newFAssetBalance,
    newTotalSupply
  )

  let account = getOrCreateAccount(recipient)

  // Update account liquidity
  let accountLiquidity = getOrCreateLiquidity(feederPool, recipient)
  accountLiquidity.balance = accountLiquidity.balance.plus(fpAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let amAssetBalance = newMAssetBalance
  let afAssetBalance = newFAssetBalance
  if (feederPool.totalSupply != BigInt.fromI32(0)) {
    amAssetBalance = newMAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
    afAssetBalance = newFAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
  }
  inputTokenBalances.push(new TokenBalance(feederPool.mAsset, account.id, amAssetBalance))
  inputTokenBalances.push(new TokenBalance(feederPool.fAsset, account.id, afAssetBalance))

  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(feederPool.mAsset, minter, mAssetQuantity))
  inputTokenAmounts.push(new TokenBalance(feederPool.fAsset, minter, fpAssetQuantity))

  let market = MarketEntity.load(feederPool.id) as MarketEntity

  investInMarket(
    event,
    account,
    market,
    fpAssetQuantity,
    inputTokenAmounts,
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

function handleRedeem(
  event: ethereum.Event,
  feederPool: FeederPoolEntity,
  redeemer: Address,
  recipient: string,
  fpAssetQuantity: BigInt,
  mAssetQuantity: BigInt,
  fAssetQuantity: BigInt
): void {
  // update mAsset and market
  let oldTotalSupply = feederPool.totalSupply
  let newTotalSupply = oldTotalSupply.minus(fpAssetQuantity)

  let newMAssetBalance = feederPool.mAssetBalance.minus(mAssetQuantity)
  let newFAssetBalance = feederPool.fAssetBalance.minus(fAssetQuantity)

  feederPool = updateMAsset(
    event,
    feederPool,
    newMAssetBalance,
    newFAssetBalance,
    newTotalSupply
  )

  let account = getOrCreateAccount(redeemer)

  // Update account liquidity
  let accountLiquidity = getOrCreateLiquidity(feederPool, redeemer)
  accountLiquidity.balance = accountLiquidity.balance.minus(fpAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let amAssetBalance = newMAssetBalance
  let afAssetBalance = newFAssetBalance
  if (feederPool.totalSupply != BigInt.fromI32(0)) {
    amAssetBalance = newMAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
    afAssetBalance = newFAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
  }
  inputTokenBalances.push(new TokenBalance(feederPool.mAsset, account.id, amAssetBalance))
  inputTokenBalances.push(new TokenBalance(feederPool.fAsset, account.id, afAssetBalance))

  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(feederPool.mAsset, recipient, mAssetQuantity))
  inputTokenAmounts.push(new TokenBalance(feederPool.fAsset, recipient, fpAssetQuantity))

  let market = MarketEntity.load(feederPool.id) as MarketEntity

  redeemFromMarket(
    event,
    account,
    market,
    fpAssetQuantity,
    inputTokenAmounts,
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

function handleUpdateSwap(event: ethereum.Event, feederPool: FeederPoolEntity, swap: FPSwapEntity): void {
  // Check if it's compelte
  if (!swap.swapEventApplied || !swap.swapCallApplied) {
    return
  }

  let newMAssetBalance = feederPool.mAssetBalance
  let newFAssetBalance = feederPool.fAssetBalance

  if (swap.inputBAsset == feederPool.fAsset) {
    newMAssetBalance = newMAssetBalance.minus(swap.outputAmount as BigInt)
    newFAssetBalance = newFAssetBalance.plus(swap.inputAmount as BigInt)
  } else {
    newMAssetBalance = newMAssetBalance.plus(swap.inputAmount as BigInt)
    newFAssetBalance = newFAssetBalance.minus(swap.outputAmount as BigInt)
  }

  feederPool = updateMAsset(
    event,
    feederPool,
    newMAssetBalance,
    newFAssetBalance,
    feederPool.totalSupply
  )

  // Delete swap entity to avoid multiple invocations
  store.remove('FPSwap', swap.id)
}

function handleMintMultiFromCollectInterest(event: MintedMulti, feederPool: FeederPoolEntity): void {
  let mAssetQuantity = BigInt.fromI32(0)
  let fAssetQuantity = BigInt.fromI32(0)
  let inputQuantities = event.params.inputQuantities
  if (inputQuantities.length > 0) {
    mAssetQuantity = inputQuantities[0]
    fAssetQuantity = inputQuantities[1]
  }

  // update mAsset and market
  let oldTotalSupply = feederPool.totalSupply
  let newTotalSupply = oldTotalSupply.plus(event.params.output)

  let newMAssetBalance = feederPool.mAssetBalance.plus(mAssetQuantity)
  let newFAssetBalance = feederPool.mAssetBalance.plus(fAssetQuantity)

  feederPool = updateMAsset(
    event,
    feederPool,
    newMAssetBalance,
    newFAssetBalance,
    newTotalSupply
  )
}

function checkLastTransferToZero(event: ethereum.Event, feederPool: FeederPoolEntity): void {
  if (feederPool.lastTransferToZero == null) {
    return
  }

  if (feederPool.lastTransferToZero == event.transaction.hash.toHexString()) {
    return
  }

  // Redeem from from user
  let id = feederPool.id.concat("-").concat(feederPool.lastTransferToZero)
  let redeem = FPLastTransferToZeroEntity.load(id) as FPLastTransferToZeroEntity
  let user = Address.fromString(redeem.redeemer as string)
  let mAssetQuantity = redeem.mAssetQuantity as BigInt

  let market = MarketEntity.load(feederPool.id) as MarketEntity

  let account = getOrCreateAccount(user)
  let accountLiquidity = getOrCreateLiquidity(feederPool, user)
  accountLiquidity.balance = accountLiquidity.balance.minus(mAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let amAssetBalance = feederPool.mAssetBalance
  let afAssetBalance = feederPool.fAssetBalance
  if (feederPool.totalSupply != BigInt.fromI32(0)) {
    amAssetBalance = feederPool.mAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
    afAssetBalance = feederPool.fAssetBalance.times(accountLiquidity.balance).div(feederPool.totalSupply)
  }
  inputTokenBalances.push(new TokenBalance(feederPool.mAsset, account.id, amAssetBalance))
  inputTokenBalances.push(new TokenBalance(feederPool.fAsset, account.id, afAssetBalance))

  redeemFromMarket(
    event,
    account,
    market,
    mAssetQuantity,
    [],
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )

  // Clear temporary state
  feederPool.lastTransferToZero = null
  feederPool.save()

  store.remove('FPLastTransferToZero', id)
}

export function handleMinted(event: Minted): void {
  let feederPool = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, feederPool)

  let minter = event.params.minter.toHexString()
  let recipient = event.params.recipient
  let fpAssetQuantity = event.params.output
  let mAssetQuantity = BigInt.fromI32(0)
  let fAssetQuantity = BigInt.fromI32(0)

  if (event.params.input.toHexString() == feederPool.fAsset) {
    fAssetQuantity = event.params.inputQuantity
  } else {
    mAssetQuantity = event.params.inputQuantity
  }

  handleMint(
    event,
    feederPool,
    minter,
    recipient,
    fpAssetQuantity,
    mAssetQuantity,
    fAssetQuantity
  )
}

export function handleMintedMulti(event: MintedMulti): void {
  let feederPool = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, feederPool)

  // Triggered from collectInterest and only updates market
  if (event.params.minter == event.address) {
    handleMintMultiFromCollectInterest(event, feederPool)
    return
  }

  let minter = event.params.minter.toHexString()
  let recipient = event.params.recipient
  let fpAssetQuantity = event.params.output
  let mAssetQuantity = BigInt.fromI32(0)
  let fAssetQuantity = BigInt.fromI32(0)

  let inputs = event.params.inputs
  let inputQuantities = event.params.inputQuantities

  for (let i = 0; i < inputs.length; i++) {
    if (inputs[i].toHexString() == feederPool.fAsset) {
      fAssetQuantity = inputQuantities[i]
    } else {
      mAssetQuantity = mAssetQuantity.plus(inputQuantities[i])
    }
  }

  handleMint(
    event,
    feederPool,
    minter,
    recipient,
    fpAssetQuantity,
    mAssetQuantity,
    fAssetQuantity
  )
}

export function handleRedeemed(event: Redeemed): void {
  let feederPool = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, feederPool)

  // Remove lastTransferToZero attribute
  feederPool.lastTransferToZero = null
  feederPool.save()

  let redeemer = event.params.redeemer
  let recipient = event.params.recipient.toHexString()
  let fpAssetQuantity = event.params.mAssetQuantity
  let mAssetQuantity = BigInt.fromI32(0)
  let fAssetQuantity = BigInt.fromI32(0)

  if (event.params.outputQuantity.toHexString() == feederPool.fAsset) {
    fAssetQuantity = event.params.outputQuantity
  } else {
    mAssetQuantity = event.params.outputQuantity
  }

  handleRedeem(
    event,
    feederPool,
    redeemer,
    recipient,
    fpAssetQuantity,
    mAssetQuantity,
    fAssetQuantity
  )
}

export function handleRedeemedMulti(event: RedeemedMulti): void {
  let feederPool = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, feederPool)

  // Remove lastTransferToZero attribute
  feederPool.lastTransferToZero = null
  feederPool.save()

  let redeemer = event.params.redeemer
  let recipient = event.params.recipient.toHexString()
  let fpAssetQuantity = event.params.mAssetQuantity
  let mAssetQuantity = BigInt.fromI32(0)
  let fAssetQuantity = BigInt.fromI32(0)

  let outputs = event.params.outputs
  let outputQuantity = event.params.outputQuantity

  for (let i = 0; i < outputs.length; i++) {
    if (outputs[i].toHexString() == feederPool.fAsset) {
      fAssetQuantity = outputQuantity[i]
    } else {
      mAssetQuantity = mAssetQuantity.plus(outputQuantity[i])
    }
  }

  handleRedeem(
    event,
    feederPool,
    redeemer,
    recipient,
    fpAssetQuantity,
    mAssetQuantity,
    fAssetQuantity
  )
}

export function handleSwapped(event: Swapped): void {
  let mAsset = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, mAsset)

  let id = mAsset.id.concat("-").concat(event.transaction.hash.toHexString())
  let swap = FPSwapEntity.load(id) as FPSwapEntity
  if (swap == null) {
    swap = new FPSwapEntity(id)
    swap.mAsset = mAsset.id
    swap.swapCallApplied = false
  }
  swap.swapEventApplied = true
  swap.inputBAsset = event.params.input.toHexString()
  swap.outputBAsset = event.params.output.toHexString()
  swap.outputAmount = event.params.outputAmount
  swap.eventLogIndex = event.logIndex
  swap.transactionLogIndex = event.transactionLogIndex
  swap.save()

  handleUpdateSwap(event, mAsset, swap)
}

export function handleSwapCall(call: SwapCall): void {
  let mAsset = FeederPoolEntity.load(call.to.toHexString()) as FeederPoolEntity

  let event = new ethereum.Event()
  event.block = call.block
  event.transaction = call.transaction

  checkLastTransferToZero(event, mAsset)

  let id = mAsset.id.concat("-").concat(call.transaction.hash.toHexString())
  let swap = FPSwapEntity.load(id) as FPSwapEntity
  if (swap == null) {
    swap = new FPSwapEntity(id)
    swap.mAsset = mAsset.id
    swap.swapEventApplied = false
  }
  swap.swapCallApplied = true
  swap.inputAmount = call.inputs._inputQuantity
  swap.save()

  if (swap.eventLogIndex != null && swap.transactionLogIndex != null) {
    event.logIndex = swap.eventLogIndex as BigInt
    event.transactionLogIndex = swap.transactionLogIndex as BigInt
  }

  handleUpdateSwap(event, mAsset, swap)
}

export function handleTransfer(event: Transfer): void {
  let feederPool = FeederPoolEntity.load(event.address.toHexString()) as FeederPoolEntity

  checkLastTransferToZero(event, feederPool)

  // if from is zero then ingore it's handled in mint and mintMulti
  if (event.params.from.toHexString() == ADDRESS_ZERO) {
    return
  }

  // if to is zero then it could be part of an incomplete withdraw
  if (event.params.to.toHexString() == ADDRESS_ZERO) {
    let id = feederPool.id.concat("-").concat(event.transaction.hash.toHexString())
    let redeem = FPLastTransferToZeroEntity.load(id) as FPLastTransferToZeroEntity
    if (redeem == null) {
      redeem = new FPLastTransferToZeroEntity(id)
      redeem.mAsset = feederPool.id
    }
    redeem.mAssetQuantity = event.params.value
    redeem.redeemer = event.params.from.toHexString()
    redeem.eventLogIndex = event.logIndex
    redeem.transactionLogIndex = event.transactionLogIndex
    redeem.save()

    feederPool.lastTransferToZero = event.transaction.hash.toHexString()
    feederPool.save()
    return
  }

  // Transfer LP tokens
  let market = MarketEntity.load(feederPool.id) as MarketEntity

  let fromAccount = getOrCreateAccount(event.params.from)
  let fromAccountLiquidity = getOrCreateLiquidity(feederPool, event.params.from)
  fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(event.params.value)
  fromAccountLiquidity.save()
  let fromInputTokenBalances: TokenBalance[] = []
  let fromAMAssetBalance = feederPool.mAssetBalance
  let fromAFAssetBalance = feederPool.fAssetBalance
  if (feederPool.totalSupply != BigInt.fromI32(0)) {
    fromAMAssetBalance = feederPool.mAssetBalance.times(fromAccountLiquidity.balance).div(feederPool.totalSupply)
    fromAFAssetBalance = feederPool.fAssetBalance.times(fromAccountLiquidity.balance).div(feederPool.totalSupply)
  }
  fromInputTokenBalances.push(new TokenBalance(feederPool.mAsset, fromAccount.id, fromAMAssetBalance))
  fromInputTokenBalances.push(new TokenBalance(feederPool.fAsset, fromAccount.id, fromAFAssetBalance))

  redeemFromMarket(
    event,
    fromAccount,
    market,
    event.params.value,
    [],
    [],
    fromAccountLiquidity.balance,
    fromInputTokenBalances,
    [],
    null
  )

  let toAccount = getOrCreateAccount(event.params.to)
  let toAccountLiquidity = getOrCreateLiquidity(feederPool, event.params.to)
  toAccountLiquidity.balance = toAccountLiquidity.balance.plus(event.params.value)
  toAccountLiquidity.save()
  let toInputTokenBalances: TokenBalance[] = []
  let toAMAssetBalance = feederPool.mAssetBalance
  let toAFAssetBalance = feederPool.fAssetBalance
  if (feederPool.totalSupply != BigInt.fromI32(0)) {
    toAMAssetBalance = feederPool.mAssetBalance.times(toAccountLiquidity.balance).div(feederPool.totalSupply)
    toAFAssetBalance = feederPool.fAssetBalance.times(toAccountLiquidity.balance).div(feederPool.totalSupply)
  }
  toInputTokenBalances.push(new TokenBalance(feederPool.mAsset, toAccount.id, toAMAssetBalance))
  toInputTokenBalances.push(new TokenBalance(feederPool.fAsset, toAccount.id, toAFAssetBalance))

  investInMarket(
    event,
    toAccount,
    market,
    event.params.value,
    [],
    [],
    toAccountLiquidity.balance,
    toInputTokenBalances,
    [],
    null
  )
}
