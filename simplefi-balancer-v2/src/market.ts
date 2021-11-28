import { 
  BigInt, 
  ethereum, 
  Address,
  store,
} from "@graphprotocol/graph-ts"

import { 
  Pool as PoolEntity, 
  Market as MarketEntity,
  Account as AccountEntity,
  Mint as MintEntity,
  Burn as BurnEntity,
  AccountLiquidity as AccountLiquidityEntity,
} from "../generated/schema"

import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  updateMarket,
  TokenBalance,
} from "./common"

export function getOrCreateLiquidity(pool: PoolEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = pool.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.pool = pool.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

export function getOrCreateMint(event: ethereum.Event, pool: PoolEntity): MintEntity {
  let mint = MintEntity.load(event.transaction.hash.toHexString())
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(event.transaction.hash.toHexString())
  mint.pool = pool.id
  mint.transferEventApplied = false
  mint.poolBalanceEventApplied = false
  mint.save()
  return mint as MintEntity
}

export function createOrUpdatePositionOnMint(event: ethereum.Event, pool: PoolEntity, mint: MintEntity): void {
  if (!mint.transferEventApplied || !mint.poolBalanceEventApplied) {
    return
  }

  let accountAddress = Address.fromString(mint.to)
  let account = new AccountEntity(mint.to)
  let market = MarketEntity.load(mint.pool) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  var inputTokenAmounts: TokenBalance[] = []
  
  var outputTokenBalance = accountLiquidity.balance
  var inputTokenBalances: TokenBalance[] = []

  var marketInputTokenBalances: TokenBalance[] = []

  pool.tokens.forEach((token, index) => {
    // @todo: can I trust mint.amounts ordering matching pool.tokens?
    // @todo: what if mint.amounts is null?
    let mintAmounts = mint.amounts as BigInt[]
    inputTokenAmounts.push(new TokenBalance(token, mint.to, mintAmounts[index] as BigInt))

    let poolReserves = pool.reserves as BigInt[]
    let tokenBalance = outputTokenBalance.times(poolReserves[index]).div(pool.totalSupply as BigInt)
    inputTokenBalances.push(new TokenBalance(token, mint.to, tokenBalance))

    marketInputTokenBalances.push(new TokenBalance(token, pool.id, poolReserves[index]))
  })

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

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalSupply as BigInt
  )

  store.remove('Mint', mint.id)
}

export function getOrCreateBurn(event: ethereum.Event, pool: PoolEntity): BurnEntity {
  let burn = BurnEntity.load(event.transaction.hash.toHexString())
  if (burn != null) {
    return burn as BurnEntity
  }

  burn = new BurnEntity(event.transaction.hash.toHexString())
  burn.transferEventApplied = false
  burn.poolBalanceEventApplied = false
  burn.pool = pool.id
  burn.save()

  return burn as BurnEntity
}

export function createOrUpdatePositionOnBurn(event: ethereum.Event, pool: PoolEntity, burn: BurnEntity): void {
  if (!burn.transferEventApplied || !burn.poolBalanceEventApplied) {
    return
  }

  let accountAddress = Address.fromString(burn.to)
  let account = new AccountEntity(burn.to)
  let market = MarketEntity.load(burn.pool) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  var inputTokenAmounts: TokenBalance[] = []
  var outputTokenBalance = accountLiquidity.balance
  var inputTokenBalances: TokenBalance[] = []
  var marketInputTokenBalances: TokenBalance[] = []

  pool.tokens.forEach((token, index) => {
    let burnAmounts = burn.amounts as BigInt[]
    inputTokenAmounts.push(new TokenBalance(token, burn.to, burnAmounts[index] as BigInt))

    let poolReserves = pool.reserves as BigInt[]
    let tokenBalance = outputTokenBalance.times(poolReserves[index]).div(pool.totalSupply as BigInt)
    inputTokenBalances.push(new TokenBalance(token, burn.to, tokenBalance))

    marketInputTokenBalances.push(new TokenBalance(token, pool.id, poolReserves[index]))
  })

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

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalSupply as BigInt
  )

  store.remove('Burn', burn.id)
}
