import { 
  Address, 
  BigInt, 
  ethereum, 
  log,
} from "@graphprotocol/graph-ts"

import {
  PoolRegistered,
  TokensDeregistered,
  TokensRegistered,
  PoolBalanceChanged,
} from "../generated/Vault/Vault"

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarket,
  updateMarket,
  TokenBalance,
} from "./common"

import {
  Pool as PoolEntity,
  PoolId as PoolIdEntity,
  Token as TokenEntity,
  Mint as MintEntity,
  Burn as BurnEntity,
  Market as MarketEntity,
} from "../generated/schema"

import { 
  ProtocolName, 
  ProtocolType,
  PoolSpecialization
} from "./constants"

import {
  createOrUpdatePositionOnMint,
  createOrUpdatePositionOnBurn
} from "./market"

export function handlePoolRegistered(event: PoolRegistered): void {
  let pool = new PoolEntity(event.params.poolId.toHexString())
  pool.address = event.params.poolAddress.toHexString();

  let evmEvent = event as ethereum.Event
  pool.blockNumber = evmEvent.block.number
  pool.timestamp = evmEvent.block.timestamp
  // pool.poolSpecialization = event.params.specialization // PoolSpecialization.GENERAL
  pool.save()

  // Solely purpose to retrive poolId from poolAddress when needed
  let poolId = new PoolIdEntity(pool.address)
  poolId.poolId = pool.id
  poolId.save()
}

export function handleTokensRegistered(event: TokensRegistered): void {
  let pool = PoolEntity.load(event.params.poolId.toHexString())

  // @todo: what if the pool already existed? (more tokens added)
  // Create a tokens and market entity
  let tokens: TokenEntity[] = []
  let tokensStr: string[] = [] // @todo: Is there any workaround to avoid 2 arrays?
  let reserves: BigInt[] = []

  for (let i = 0; i < event.params.tokens.length; i++) {
    let inputTokens = event.params.tokens
    let tokenEntity = getOrCreateERC20Token(event, inputTokens[i])
    tokens.push(tokenEntity)
    tokensStr.push(tokenEntity.id)
    reserves.push(BigInt.fromI32(0))
  }
  
  let poolAddress = Address.fromString(pool.address)
  let lpToken = getOrCreateERC20Token(event, poolAddress)

  let market = getOrCreateMarket(
    event,
    poolAddress,
    ProtocolName.BALANCER_V2,
    ProtocolType.EXCHANGE,
    tokens,
    lpToken,
    []
  )

  lpToken.mintedByMarket = market.id
  lpToken.save()

  pool.factory = getOrCreateAccount(poolAddress).id
  pool.tokens = tokensStr
  pool.reserves = reserves
  pool.totalSupply = BigInt.fromI32(0)
  pool.save()
}

export function handleTokensDeregistered(event: TokensDeregistered): void {
  
}

export function handlePoolBalanceChanged(event: PoolBalanceChanged): void {
  
  let pool = PoolEntity.load(event.params.poolId.toHexString())

  let transactionHash = event.transaction.hash.toHexString()
  let tokenAmounts: BigInt[] = []
  for (let i = 0; i < event.params.deltas.length; i++) {
    let amounts = event.params.deltas
    
    // deltas come as negative values on burning
    tokenAmounts.push(amounts[i].abs())
  }

  if (pool.reserves === null) {
    // @todo: can I trust ordering?
    pool.reserves = tokenAmounts
  } else {
    let reserves = pool.reserves as BigInt[]
    for (let i = 0; i < pool.reserves.length; i++) {
      let poolDeposit = tokenAmounts
      reserves[i].plus(poolDeposit[i])
    }
  }
  
  pool.save()

  let mintBurnId = pool.address.concat('-').concat(transactionHash)
  let isMintOrBurn = false
  let possibleMint = MintEntity.load(mintBurnId)
  if (possibleMint != null) {
    isMintOrBurn = true
    let mint = possibleMint as MintEntity
    mint.poolBalanceEventApplied = true

    // @todo: can I trust event.params.deltas ordering?
    mint.amounts = tokenAmounts
    mint.save()

    pool.totalSupply = pool.totalSupply.plus(mint.liquityAmount as BigInt)
    pool.save()
    log.info("Vault: Minting tokens ({}) from pool {} totalSupply {} {}", [mint.liquityAmount.toString(), pool.address, pool.totalSupply.toString(), event.transaction.hash.toHexString()])
    createOrUpdatePositionOnMint(event, pool as PoolEntity, mint)
  }
  
  let possibleBurn = BurnEntity.load(mintBurnId)
  if (possibleBurn != null) {
    isMintOrBurn = true
    let burn = possibleBurn as BurnEntity
    burn.poolBalanceEventApplied = true

    // @todo: can I trust event.params.deltas ordering?
    burn.amounts = tokenAmounts
    burn.save()

    pool.totalSupply = pool.totalSupply.minus(burn.liquityAmount as BigInt)
    pool.save()
    log.info("Vault: Burning tokens ({}) from pool {} totalSupply {} {}", [burn.liquityAmount.toString(), pool.address, pool.totalSupply.toString(), event.transaction.hash.toHexString()])
    createOrUpdatePositionOnBurn(event, pool as PoolEntity, burn)
  }

  if (!isMintOrBurn) {
    let inputTokenBalances: TokenBalance[] = []

    for (let i = 0; i < pool.tokens.length; i++) {
      let tokens = pool.tokens as string[]
      let poolReserves = pool.reserves as BigInt[]
      inputTokenBalances.push(new TokenBalance(tokens[i], pool.id, poolReserves[i]))
    }

    // Update market
    let market = MarketEntity.load(pool.address) as MarketEntity
    updateMarket(
      event,
      market,
      inputTokenBalances,
      pool.totalSupply as BigInt
    )
  }
}
