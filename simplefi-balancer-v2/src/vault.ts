import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"

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
} from "./common"

import {
  Pool,
  PoolId,
  Token,
} from "../generated/schema"

import { 
  ProtocolName, 
  ProtocolType,
  PoolSpecialization
} from "./constants"

export function handlePoolRegistered(event: PoolRegistered): void {
  let pool = new Pool(event.params.poolId.toHexString())
  pool.address = event.params.poolAddress.toHexString();

  let evmEvent = event as ethereum.Event
  pool.blockNumber = evmEvent.block.number
  pool.timestamp = evmEvent.block.timestamp
  // pool.poolSpecialization = event.params.specialization // PoolSpecialization.GENERAL
  pool.save()

  // Solely purpose to retrive poolId from poolAddress when needed
  let poolId = new PoolId(event.params.poolAddress.toHexString())
  poolId.poolId = pool.id
  poolId.save()
}

export function handleTokensRegistered(event: TokensRegistered): void {
  let pool = Pool.load(event.params.poolId.toHexString())

  if (!pool) {
    return;
  }
  
  // @todo: what if the pool already existed? (more tokens added)
  // Create a tokens and market entity
  let tokens: Token[] = []
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

  // Start listening for market events
  //UniswapV2Pair.create(event.params.pair)
}

export function handleTokensDeregistered(event: TokensDeregistered): void {
  
}

export function handlePoolBalanceChanged(event: PoolBalanceChanged): void {

}
