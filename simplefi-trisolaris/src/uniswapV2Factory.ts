import { BigInt } from "@graphprotocol/graph-ts"
import { Pair as PairEntity } from "../generated/schema"
import { UniswapV2Pair } from "../generated/templates"
import {
  PairCreated
} from "../generated/UniswapV2Factory/UniswapV2Factory"
import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"

export function handlePairCreated(event: PairCreated): void {
  // Create a tokens and market entity
  let token0 = getOrCreateERC20Token(event, event.params.token0)
  let token1 = getOrCreateERC20Token(event, event.params.token1)
  let lpToken = getOrCreateERC20Token(event, event.params.pair)

  let market = getOrCreateMarket(
    event,
    event.params.pair,
    ProtocolName.TRISOLARIS,
    ProtocolType.EXCHANGE,
    [token0, token1],
    lpToken,
    []
  )

  lpToken.mintedByMarket = market.id
  lpToken.save()

  // Create pair
  let pair = new PairEntity(event.params.pair.toHexString())
  pair.factory = getOrCreateAccount(event.address).id
  pair.token0 = token0.id
  pair.token1 = token1.id
  pair.totalSupply = BigInt.fromI32(0)
  pair.reserve0 = BigInt.fromI32(0)
  pair.reserve1 = BigInt.fromI32(0)
  pair.blockNumber = event.block.number
  pair.timestamp = event.block.timestamp
  pair.save()

  // Start listening for market events
  UniswapV2Pair.create(event.params.pair)
}
