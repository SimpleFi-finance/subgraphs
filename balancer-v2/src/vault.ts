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
} from "./constants"

import {
  createOrUpdatePositionOnMint,
  createOrUpdatePositionOnBurn
} from "./market"

export function handlePoolRegistered(event: PoolRegistered): void {
  let pool = new PoolEntity(event.params.poolId.toHexString())
  pool.address = event.params.poolAddress.toHexString();

  pool.blockNumber = event.block.number
  pool.timestamp = event.block.timestamp
  //pool.poolSpecialization = event.params.specialization // PoolSpecialization.GENERAL
  pool.tokens = []
  pool.reserves = []
  pool.totalSupply = BigInt.fromI32(0)
  pool.save()

  // Solely purpose to retrive poolId from poolAddress when needed
  let poolId = new PoolIdEntity(pool.address)
  poolId.poolId = pool.id
  poolId.save()
}

export function handleTokensRegistered(event: TokensRegistered): void {
  let pool = PoolEntity.load(event.params.poolId.toHexString())

  // By the design of protocol registerTokens is called only once in the constructor of the pool
  // Create a tokens and market entity
  let tokens: TokenEntity[] = []
  let reserves: BigInt[] = []
  let inputTokens = event.params.tokens

  for (let i = 0; i < event.params.tokens.length; i++) {
    let tokenEntity = getOrCreateERC20Token(event, inputTokens[i])
    tokens.push(tokenEntity)
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
  
  pool.tokens = tokens.map<string>(t => t.id)
  pool.reserves = reserves
  pool.save()
}

export function handleTokensDeregistered(event: TokensDeregistered): void {
  
}

export function handlePoolBalanceChanged(event: PoolBalanceChanged): void {
  
  let pool = PoolEntity.load(event.params.poolId.toHexString())

  let transactionHash = event.transaction.hash.toHexString()
  let deltas = event.params.deltas
  let inputTokenAmounts = deltas.map<BigInt>(d => d.abs())

  // ordering of amounts is always same as ordering of tokens in pool entity, it is validated by the protocol  
  let oldReserves = pool.reserves
  let newReserves: BigInt[] = []
  for (let i = 0; i < pool.reserves.length; i++) {
    newReserves[i] = oldReserves[i].plus(deltas[i])
  }

  pool.reserves = newReserves
  pool.save()

  let mintBurnId = pool.address.concat('-').concat(transactionHash)
  let isMintOrBurn = false
  let possibleMint = MintEntity.load(mintBurnId)
  if (possibleMint != null) {
    isMintOrBurn = true
    let mint = possibleMint as MintEntity
    mint.poolBalanceEventApplied = true

    mint.amounts = inputTokenAmounts
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

    burn.amounts = inputTokenAmounts
    burn.save()

    pool.totalSupply = pool.totalSupply.minus(burn.liquityAmount as BigInt)
    pool.save()
    log.info("Vault: Burning tokens ({}) from pool {} totalSupply {} {}", [burn.liquityAmount.toString(), pool.address, pool.totalSupply.toString(), event.transaction.hash.toHexString()])
    createOrUpdatePositionOnBurn(event, pool as PoolEntity, burn)
  }

  if (!isMintOrBurn) {
    let inputTokenBalances: TokenBalance[] = []
    let tokens = pool.tokens
    let reserves = pool.reserves

    for (let i = 0; i < pool.tokens.length; i++) {
      inputTokenBalances.push(new TokenBalance(tokens[i], pool.id, reserves[i]))
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
