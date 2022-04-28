import { Address, BigInt, ethereum, store, log } from "@graphprotocol/graph-ts"

import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Burn as BurnEntity,
  Market as MarketEntity,
  Mint as MintEntity,
  Pair as PairEntity,
} from "../generated/schema"

import {
  Deposited,
  Withdrawn,
  Transfer,
  Sync,
  Mooniswap,
} from "../generated/templates/Mooniswap/Mooniswap"

import { ERC20 } from "../generated/MooniswapFactory/ERC20"

import {
  ADDRESS_ZERO,
  ADDRESS_ETH,
  ETH_BALANCE_CONTRACT,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common"

const BASE_SUPPLY = BigInt.fromI32(1000)

function getOrCreateMint(event: ethereum.Event, pair: PairEntity): MintEntity {
  let mintId = pair.id.concat("-").concat(event.transaction.hash.toHexString())
  let mint = MintEntity.load(mintId)
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(mintId)
  mint.pair = pair.id
  mint.save()
  return mint as MintEntity
}

function getOrCreateBurn(event: ethereum.Event, pair: PairEntity): BurnEntity {
  let burnId = pair.id.concat("-").concat(event.transaction.hash.toHexString())
  let burn = BurnEntity.load(burnId)
  if (burn != null) {
    return burn as BurnEntity
  }

  burn = new BurnEntity(burnId)
  burn.pair = pair.id
  burn.save()

  return burn as BurnEntity
}

function getOrCreateLiquidity(pair: PairEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = pair.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.pair = pair.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function createOrUpdatePositionOnMint(event: ethereum.Event, pair: PairEntity, mint: MintEntity): void {
  let accountAddress = Address.fromString(mint.to as string)
  let account = new AccountEntity(mint.to as string)
  let market = MarketEntity.load(mint.pair as string) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pair.token0, mint.from as string, mint.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, mint.from as string, mint.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pair.token0, mint.to as string, token0Balance))
  inputTokenBalances.push(new TokenBalance(pair.token1, mint.to as string, token1Balance))

  investInMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // update market
  let marketInputTokenBalances: TokenBalance[] = []
  marketInputTokenBalances.push(new TokenBalance(pair.token0, pair.id, pair.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pair.token1, pair.id, pair.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pair.totalSupply
  )

  store.remove('Mint', mint.id)
}

function createOrUpdatePositionOnBurn(event: ethereum.Event, pair: PairEntity, burn: BurnEntity): void {
  let accountAddress = Address.fromString(burn.from as string)
  let account = new AccountEntity(burn.from as string)
  let market = MarketEntity.load(burn.pair as string) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pair.token0, burn.to as string, burn.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, burn.to as string, burn.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pair.token0, burn.from as string, token0Balance))
  inputTokenBalances.push(new TokenBalance(pair.token1, burn.from as string, token1Balance))

  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // update market
  let marketInputTokenBalances: TokenBalance[] = []
  marketInputTokenBalances.push(new TokenBalance(pair.token0, pair.id, pair.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pair.token1, pair.id, pair.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pair.totalSupply
  )

  store.remove('Burn', burn.id)
}

function transferLPToken(event: ethereum.Event, pair: PairEntity, from: Address, to: Address, amount: BigInt): void {
  let market = MarketEntity.load(pair.id) as MarketEntity

  let fromAccount = getOrCreateAccount(from)
  let accountLiquidityFrom = getOrCreateLiquidity(pair, from)
  let fromOutputTokenBalance = accountLiquidityFrom.balance
  let fromInputTokenBalances: TokenBalance[] = []
  let fromToken0Balance = fromOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let fromToken1Balance = fromOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  fromInputTokenBalances.push(new TokenBalance(pair.token0, fromAccount.id, fromToken0Balance))
  fromInputTokenBalances.push(new TokenBalance(pair.token1, fromAccount.id, fromToken1Balance))

  redeemFromMarket(
    event,
    fromAccount,
    market,
    amount,
    [],
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to.toHexString()
  )

  let toAccount = getOrCreateAccount(to)
  let accountLiquidityTo = getOrCreateLiquidity(pair, to)
  let toOutputTokenBalance = accountLiquidityTo.balance
  let toInputTokenBalances: TokenBalance[] = []
  let toToken0Balance = toOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let toToken1Balance = toOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  toInputTokenBalances.push(new TokenBalance(pair.token0, toAccount.id, toToken0Balance))
  toInputTokenBalances.push(new TokenBalance(pair.token1, toAccount.id, toToken1Balance))

  investInMarket(
    event,
    toAccount,
    market,
    amount,
    [],
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from.toHexString()
  )
}

export function handleTransfer(event: Transfer): void {
  if (event.params.value == BigInt.fromI32(0)) {
    return
  }

  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  let pair = PairEntity.load(event.address.toHexString()) as PairEntity

  // ignore initial transfers for first adds
  if (
    fromHex == ADDRESS_ZERO &&
    toHex == pair.id &&
    event.params.value.equals(BigInt.fromI32(1000)) && 
    pair.totalSupply.toString() == "0"
  ) {
    return
  }

  // Mint
  if (fromHex == ADDRESS_ZERO) {
    let pairContract = Mooniswap.bind(event.address)
    let totalSupplyCall = pairContract.try_totalSupply()
    if (!totalSupplyCall.reverted) {
      pair.totalSupply = totalSupplyCall.value
    }

    pair.save()
  } else if (toHex == ADDRESS_ZERO) {
    // Burn
    let pairContract = Mooniswap.bind(event.address)
    let totalSupplyCall = pairContract.try_totalSupply()
    if (!totalSupplyCall.reverted) {
      pair.totalSupply = totalSupplyCall.value
    }

    pair.save()
  }

  // update account balances
  if (fromHex != ADDRESS_ZERO) {
    let accountLiquidityFrom = getOrCreateLiquidity(pair, event.params.from)
    accountLiquidityFrom.balance = accountLiquidityFrom.balance.minus(event.params.value)
    accountLiquidityFrom.save()
  }

  if (fromHex != pair.id) {
    let accountLiquidityTo = getOrCreateLiquidity(pair, event.params.to)
    accountLiquidityTo.balance = accountLiquidityTo.balance.plus(event.params.value)
    accountLiquidityTo.save()
  }

  // everything else
  if (fromHex != ADDRESS_ZERO && fromHex != pair.id && toHex != pair.id) {
    transferLPToken(event, pair, event.params.from, event.params.to, event.params.value)
  }
}

export function handleMint(event: Deposited): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let mint = getOrCreateMint(event, pair)

  // First deposit will lock a BASE_SUPPLY to prevent total supply to ever be 0
  if (pair.totalSupply.toString() == "0") {
    pair.totalSupply = pair.totalSupply.plus(BASE_SUPPLY)
  }

  mint.amount0 = event.params.token0Amount
  mint.amount1 = event.params.token1Amount
  mint.from = getOrCreateAccount(event.transaction.from).id
  mint.to = getOrCreateAccount(event.params.receiver).id
  mint.liquityAmount = event.params.share
  mint.save()

  let reserves = fetchReserves(pair)
  pair.reserve0 = reserves[0]
  pair.reserve1 = reserves[1]

  pair.save()

  createOrUpdatePositionOnMint(event, pair, mint)
}

export function handleBurn(event: Withdrawn): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let burn = getOrCreateBurn(event, pair)

  burn.to = getOrCreateAccount(event.params.receiver).id
  burn.amount0 = event.params.token0Amount
  burn.amount1 = event.params.token1Amount
  burn.from = getOrCreateAccount(event.params.sender).id
  burn.liquityAmount = event.params.share
  burn.save()

  let reserves = fetchReserves(pair)
  pair.reserve0 = reserves[0]
  pair.reserve1 = reserves[1]

  pair.save()

  createOrUpdatePositionOnBurn(event, pair, burn)
}

export function fetchReserves(pair: PairEntity): Array<BigInt> {
  
  let token0 = pair.token0.toLowerCase() == ADDRESS_ETH ? Address.fromString(ETH_BALANCE_CONTRACT) : Address.fromString(pair.token0)
  let token1 = pair.token1.toLowerCase() == ADDRESS_ETH ? Address.fromString(ETH_BALANCE_CONTRACT) : Address.fromString(pair.token1)
  let contract0 = ERC20.bind(token0)
  let contract1 = ERC20.bind(token1)
  let token0Call = contract0.try_balanceOf(Address.fromString(pair.id))
  let token1Call = contract1.try_balanceOf(Address.fromString(pair.id))

  let reserve0 = BigInt.fromI32(0)
  let reserve1 = BigInt.fromI32(0)
  if (!token0Call.reverted) {
    reserve0 = token0Call.value
  }

  if (!token1Call.reverted) {
    reserve1 = token1Call.value
  }

  return [reserve0, reserve1]
}
