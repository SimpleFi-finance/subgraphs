import { BigInt, Address } from "@graphprotocol/graph-ts"
import { Pool as PoolEntity } from "../generated/schema"
import { UniswapV3Pool } from "../generated/templates"
import { PoolCreated } from "../generated/UniswapV3Factory/UniswapV3Factory"

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateERC721,
  getOrCreateMarket
} from "./common"

import { 
  ProtocolName, 
  ProtocolType,
  POSITION_MANAGER_ADDRESS,
} from "./constants"

export function handlePoolCreated(event: PoolCreated): void {
  // Create a tokens and market entity
  let token0 = getOrCreateERC20Token(event, event.params.token0)
  let token1 = getOrCreateERC20Token(event, event.params.token1)
  let positionToken = getOrCreateERC721(event, Address.fromString(POSITION_MANAGER_ADDRESS))

  getOrCreateMarket(
    event,
    event.params.pool,
    ProtocolName.UNISWAP_V3,
    ProtocolType.EXCHANGE,
    [token0, token1],
    positionToken,
    []
  )

  // Create pool
  let pool = new PoolEntity(event.params.pool.toHexString())
  pool.factory = getOrCreateAccount(event.address).id
  pool.token0 = token0.id
  pool.token1 = token1.id
  pool.totalLiquidity = BigInt.fromI32(0)
  pool.reserve0 = BigInt.fromI32(0)
  pool.reserve1 = BigInt.fromI32(0)
  pool.blockNumber = event.block.number
  pool.timestamp = event.block.timestamp
  pool.save()

  // Start listening for market events
  UniswapV3Pool.create(event.params.pool)
}
