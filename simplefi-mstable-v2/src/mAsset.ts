import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts"
import {
  AccountLiquidity as AccountLiquidityEntity,
  Market as MarketEntity,
  MAsset as MAssetEntity,
  Redeem as RedeemEntity,
  Swap as SwapEntity,
  Token as TokenEntity
} from "../generated/schema"
import {
  MAsset,
  Minted,
  MintedMulti,
  Redeemed,
  RedeemedMulti,
  SwapCall,
  Swapped,
  Transfer
} from "../generated/templates/MAsset/MAsset"
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  getOrCreateERC20Token,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common"


function getOrCreateLiquidity(mAsset: MAssetEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = mAsset.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.mAsset = mAsset.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function updateMAsset(event: ethereum.Event, mAsset: MAssetEntity, bAssetBalances: TokenBalance[], totalSupply: BigInt): MAssetEntity {
  mAsset.bAssetBalances = bAssetBalances.map<string>(tb => tb.toString())
  mAsset.totalSupply = totalSupply
  mAsset.save()

  let market = MarketEntity.load(mAsset.id) as MarketEntity

  updateMarket(
    event,
    market,
    bAssetBalances,
    totalSupply
  )

  return mAsset
}

function handleMint(
  event: ethereum.Event,
  mAsset: MAssetEntity,
  minter: string,
  recipient: Address,
  mAssetQuantity: BigInt,
  bAssets: string[],
  bAssetQuantities: BigInt[]
): void {
  // update mAsset and market
  let oldTotalSupply = mAsset.totalSupply
  let newTotalSupply = oldTotalSupply.plus(mAssetQuantity)

  let oldBAssetBalances: TokenBalance[] = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))
  let newBAssetBalances: TokenBalance[] = []
  for (let i = 0; i < oldBAssetBalances.length; i++) {
    let obb = oldBAssetBalances[i]
    let balance = obb.balance
    for (let j = 0; j < bAssets.length; j++) {
      if (bAssets[j] == obb.tokenAddress) {
        balance = balance.plus(bAssetQuantities[j])
      }
    }
    newBAssetBalances.push(new TokenBalance(obb.tokenAddress, mAsset.id, balance))
  }

  mAsset = updateMAsset(event, mAsset, newBAssetBalances, newTotalSupply)

  let account = getOrCreateAccount(recipient)

  // Update account liquidity
  let accountLiquidity = getOrCreateLiquidity(mAsset, recipient)
  accountLiquidity.balance = accountLiquidity.balance.plus(mAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  for (let i = 0; i < newBAssetBalances.length; i++) {
    let nbb = newBAssetBalances[i]
    let inputTokenBalance = BigInt.fromI32(0)
    if (mAsset.totalSupply == BigInt.fromI32(0)) {
      inputTokenBalance = nbb.balance
    } else {
      inputTokenBalance = nbb.balance.times(accountLiquidity.balance).div(mAsset.totalSupply)
    }
    inputTokenBalances.push(new TokenBalance(nbb.tokenAddress, account.id, inputTokenBalance))
  }

  let inputTokenAmounts: TokenBalance[] = []
  for (let i = 0; i < bAssets.length; i++) {
    inputTokenAmounts.push(new TokenBalance(bAssets[i], minter, bAssetQuantities[i]))
  }

  let market = MarketEntity.load(mAsset.id) as MarketEntity

  investInMarket(
    event,
    account,
    market,
    mAssetQuantity,
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
  mAsset: MAssetEntity,
  redeemer: Address,
  recipient: string,
  mAssetQuantity: BigInt,
  bAssets: string[],
  bAssetQuantities: BigInt[]
): void {
  // update mAsset and market
  let oldTotalSupply = mAsset.totalSupply
  let newTotalSupply = oldTotalSupply.minus(mAssetQuantity)

  let oldBAssetBalances: TokenBalance[] = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))
  let newBAssetBalances: TokenBalance[] = []
  for (let i = 0; i < oldBAssetBalances.length; i++) {
    let obb = oldBAssetBalances[i]
    let balance = obb.balance
    for (let j = 0; j < bAssets.length; j++) {
      if (bAssets[j] == obb.tokenAddress) {
        balance = balance.minus(bAssetQuantities[j])
      }
    }
    newBAssetBalances.push(new TokenBalance(obb.tokenAddress, mAsset.id, balance))
  }

  mAsset = updateMAsset(event, mAsset, newBAssetBalances, newTotalSupply)

  let account = getOrCreateAccount(redeemer)

  // Update account liquidity
  let accountLiquidity = getOrCreateLiquidity(mAsset, redeemer)
  accountLiquidity.balance = accountLiquidity.balance.minus(mAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  for (let i = 0; i < newBAssetBalances.length; i++) {
    let nbb = newBAssetBalances[i]
    let inputTokenBalance = BigInt.fromI32(0)
    if (mAsset.totalSupply == BigInt.fromI32(0)) {
      inputTokenBalance = nbb.balance
    } else {
      inputTokenBalance = nbb.balance.times(accountLiquidity.balance).div(mAsset.totalSupply)
    }
    inputTokenBalances.push(new TokenBalance(nbb.tokenAddress, recipient, inputTokenBalance))
  }

  let inputTokenAmounts: TokenBalance[] = []
  for (let i = 0; i < bAssets.length; i++) {
    inputTokenAmounts.push(new TokenBalance(bAssets[i], redeemer.toHexString(), bAssetQuantities[i]))
  }

  let market = MarketEntity.load(mAsset.id) as MarketEntity

  redeemFromMarket(
    event,
    account,
    market,
    mAssetQuantity,
    inputTokenAmounts,
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

function handleUpdateSwap(event: ethereum.Event, mAsset: MAssetEntity, swap: SwapEntity): void {
  // Check if it's compelte
  if (!swap.swapEventApplied || !swap.swapCallApplied) {
    return
  }

  // TODO convert it to non scaled fee
  let outputBAssetFee = swap.scaledFee as BigInt

  let oldBAssetBalances: TokenBalance[] = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))
  let newBAssetBalances: TokenBalance[] = []
  for (let i = 0; i < oldBAssetBalances.length; i++) {
    let obb = oldBAssetBalances[i]
    let balance = obb.balance
    if (obb.tokenAddress == swap.inputBAsset) {
      balance = balance.plus(swap.inputAmount as BigInt)
    }
    if (obb.tokenAddress == swap.outputBAsset) {
      balance = balance.minus(swap.outputAmount as BigInt).minus(outputBAssetFee)
    }
    newBAssetBalances.push(new TokenBalance(obb.tokenAddress, mAsset.id, balance))
  }

  updateMAsset(event, mAsset, newBAssetBalances, mAsset.totalSupply)

  // Delete swap entity to avoid multiple invocations
  store.remove('Swap', swap.id)
}

function handleMintMultiFromCollectInterest(event: MintedMulti, mAsset: MAssetEntity): void {
  let bAssets = mAsset.bAssets
  let bAssetQuantities = event.params.inputQuantities

  // update mAsset and market
  let oldTotalSupply = mAsset.totalSupply
  let newTotalSupply = oldTotalSupply.plus(event.params.mAssetQuantity)

  let oldBAssetBalances: TokenBalance[] = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))
  let newBAssetBalances: TokenBalance[] = []
  if (bAssetQuantities.length > 0) {
    for (let i = 0; i < oldBAssetBalances.length; i++) {
      let obb = oldBAssetBalances[i]
      let balance = obb.balance
      for (let j = 0; j < bAssets.length; j++) {
        if (bAssets[j] == obb.tokenAddress) {
          balance = balance.plus(bAssetQuantities[j])
        }
      }
      newBAssetBalances.push(new TokenBalance(obb.tokenAddress, mAsset.id, balance))
    }
  } else {
    newBAssetBalances = oldBAssetBalances
  }

  updateMAsset(event, mAsset, newBAssetBalances, newTotalSupply)
}

function checkLastTransferToZero(event: ethereum.Event, mAsset: MAssetEntity): void {
  if (mAsset.lastTransferToZero == null) {
    return
  }

  if (mAsset.lastTransferToZero == event.transaction.hash.toHexString()) {
    return
  }

  // Redeem from from user
  let id = mAsset.id.concat("-").concat(mAsset.lastTransferToZero)
  let redeem = RedeemEntity.load(id) as RedeemEntity
  let user = Address.fromString(redeem.redeemer as string)
  let mAssetQuantity = redeem.mAssetQuantity as BigInt

  let market = MarketEntity.load(mAsset.id) as MarketEntity

  let account = getOrCreateAccount(user)
  let accountLiquidity = getOrCreateLiquidity(mAsset, user)
  accountLiquidity.balance = accountLiquidity.balance.minus(mAssetQuantity)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let bAssetBalances: TokenBalance[] = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))

  for (let i = 0; i < bAssetBalances.length; i++) {
    let balance = BigInt.fromI32(0)
    if (mAsset.totalSupply == BigInt.fromI32(0)) {
      balance = bAssetBalances[i].balance
    } else {
      balance = bAssetBalances[i].balance.times(accountLiquidity.balance).div(mAsset.totalSupply)
    }
    inputTokenBalances.push(new TokenBalance(bAssetBalances[i].tokenAddress, account.id, balance))
  }

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
  mAsset.lastTransferToZero = null
  mAsset.save()

  store.remove('Redeem', id)
}

export function handleMinted(event: Minted): void {
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  let minter = event.params.minter.toHexString()
  let recipient = event.params.recipient
  let mAssetQuantity = event.params.mAssetQuantity
  let bAssets: string[] = []
  bAssets.push(event.params.input.toHexString())
  let bAssetQuantities: BigInt[] = []
  bAssetQuantities.push(event.params.inputQuantity)

  handleMint(
    event,
    mAsset,
    minter,
    recipient,
    mAssetQuantity,
    bAssets,
    bAssetQuantities
  )
}

export function handleMintedMulti(event: MintedMulti): void {
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  // Triggered from collectInterest and only updates market
  if (event.params.minter == event.address) {
    handleMintMultiFromCollectInterest(event, mAsset)
    return
  }

  let minter = event.params.minter.toHexString()
  let recipient = event.params.recipient
  let mAssetQuantity = event.params.mAssetQuantity
  let bAssets = event.params.inputs.map<string>(a => a.toHexString())
  let bAssetQuantities = event.params.inputQuantities

  handleMint(
    event,
    mAsset,
    minter,
    recipient,
    mAssetQuantity,
    bAssets,
    bAssetQuantities
  )
}

export function handleRedeemed(event: Redeemed): void {
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  // Remove lastTransferToZero attribute
  mAsset.lastTransferToZero = null
  mAsset.save()

  let redeemer = event.params.redeemer
  let recipient = event.params.recipient.toHexString()
  let mAssetQuantity = event.params.mAssetQuantity
  let bAssets: string[] = []
  bAssets.push(event.params.output.toHexString())
  let bAssetQuantities: BigInt[] = []
  bAssetQuantities.push(event.params.outputQuantity)

  handleRedeem(
    event,
    mAsset,
    redeemer,
    recipient,
    mAssetQuantity,
    bAssets,
    bAssetQuantities
  )
}

export function handleRedeemedMulti(event: RedeemedMulti): void {
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  // Remove lastTransferToZero attribute
  mAsset.lastTransferToZero = null
  mAsset.save()

  let redeemer = event.params.redeemer
  let recipient = event.params.recipient.toHexString()
  let mAssetQuantity = event.params.mAssetQuantity
  let bAssets = event.params.outputs.map<string>(a => a.toHexString())
  let bAssetQuantities = event.params.outputQuantity

  handleRedeem(
    event,
    mAsset,
    redeemer,
    recipient,
    mAssetQuantity,
    bAssets,
    bAssetQuantities
  )
}

export function handleSwapped(event: Swapped): void {
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  let id = mAsset.id.concat("-").concat(event.transaction.hash.toHexString())
  let swap = SwapEntity.load(id) as SwapEntity
  if (swap == null) {
    swap = new SwapEntity(id)
    swap.mAsset = mAsset.id
    swap.swapCallApplied = false
  }
  swap.swapEventApplied = true
  swap.inputBAsset = event.params.input.toHexString()
  swap.outputBAsset = event.params.output.toHexString()
  swap.outputAmount = event.params.outputAmount
  swap.scaledFee = event.params.scaledFee
  swap.eventLogIndex = event.logIndex
  swap.transactionLogIndex = event.transactionLogIndex
  swap.save()

  handleUpdateSwap(event, mAsset, swap)
}

export function handleSwapCall(call: SwapCall): void {
  let mAsset = MAssetEntity.load(call.to.toHexString()) as MAssetEntity

  let event = new ethereum.Event()
  event.block = call.block
  event.transaction = call.transaction

  checkLastTransferToZero(event, mAsset)

  let id = mAsset.id.concat("-").concat(call.transaction.hash.toHexString())
  let swap = SwapEntity.load(id) as SwapEntity
  if (swap == null) {
    swap = new SwapEntity(id)
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
  let mAsset = MAssetEntity.load(event.address.toHexString()) as MAssetEntity

  checkLastTransferToZero(event, mAsset)

  // if from is zero then ingore it's handled in mint and mintMulti
  if (event.params.from.toHexString() == ADDRESS_ZERO) {
    return
  }

  // if to is zero then it could be part of an incomplete withdraw
  if (event.params.to.toHexString() == ADDRESS_ZERO) {
    let id = mAsset.id.concat("-").concat(event.transaction.hash.toHexString())
    let redeem = RedeemEntity.load(id) as RedeemEntity
    if (redeem == null) {
      redeem = new RedeemEntity(id)
      redeem.mAsset = mAsset.id
      redeem.decreaseVaultCallApplied = false
      redeem.redeemEventApplied = false
      redeem.bAssets = []
      redeem.bAssetQuantities = []
    }
    redeem.mAssetQuantity = event.params.value
    redeem.redeemer = event.params.from.toHexString()
    redeem.eventLogIndex = event.logIndex
    redeem.transactionLogIndex = event.transactionLogIndex
    redeem.save()

    mAsset.lastTransferToZero = event.transaction.hash.toHexString()
    mAsset.save()
    return
  }

  // Transfer LP tokens
  let market = MarketEntity.load(mAsset.id) as MarketEntity

  let fromAccount = getOrCreateAccount(event.params.from)
  let fromAccountLiquidity = getOrCreateLiquidity(mAsset, event.params.from)
  fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(event.params.value)
  fromAccountLiquidity.save()
  let fromInputTokenBalances: TokenBalance[] = []

  let toAccount = getOrCreateAccount(event.params.to)
  let toAccountLiquidity = getOrCreateLiquidity(mAsset, event.params.to)
  toAccountLiquidity.balance = toAccountLiquidity.balance.plus(event.params.value)
  toAccountLiquidity.save()
  let toInputTokenBalances: TokenBalance[] = []

  let bAssetBalances = mAsset.bAssetBalances.map<TokenBalance>(tbs => TokenBalance.fromString(tbs))
  for (let i = 0; i < bAssetBalances.length; i++) {
    let fromBalance = BigInt.fromI32(0)
    let toBalance = BigInt.fromI32(0)
    if (mAsset.totalSupply == BigInt.fromI32(0)) {
      fromBalance = bAssetBalances[i].balance
      toBalance = bAssetBalances[i].balance
    } else {
      fromBalance = bAssetBalances[i].balance.times(fromAccountLiquidity.balance).div(mAsset.totalSupply)
      toBalance = bAssetBalances[i].balance.times(toAccountLiquidity.balance).div(mAsset.totalSupply)
    }
    fromInputTokenBalances.push(new TokenBalance(bAssetBalances[i].tokenAddress, fromAccount.id, fromBalance))
    toInputTokenBalances.push(new TokenBalance(bAssetBalances[i].tokenAddress, toAccount.id, toBalance))
  }

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

export function handleBAssetsUpdated(event: ethereum.Event): void {
  let mAssetId = event.address.toHexString()
  let mAsset = MAssetEntity.load(mAssetId) as MAssetEntity
  let market = MarketEntity.load(mAsset.id) as MarketEntity

  // BAssetAdded is triggered in initializer
  if (market == null) {
    return
  }

  let contract = MAsset.bind(Address.fromString(mAsset.id))
  let bAssets = contract.getBassets()
  mAsset.bAssets = bAssets.value0.map<string>(b => b.addr.toHexString())
  mAsset.save()

  let inputTokens: TokenEntity[] = []
  for (let i = 0; i < bAssets.value0.length; i = i + 1) {
    let token = getOrCreateERC20Token(event, bAssets.value0[i].addr)
    inputTokens.push(token)
  }
  market.inputTokens = inputTokens.map<string>(t => t.id)
  market.save()
}