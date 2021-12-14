import { BigInt } from "@graphprotocol/graph-ts"

import { Pair as PairEntity } from "../generated/schema"

import { Mooniswap } from "../generated/templates"

import {
  Deployed
} from "../generated/MooniswapFactory/MooniswapFactory"

import {
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"

import { ProtocolName, ProtocolType } from "./constants"

export function handleDeployed(event: Deployed): void {
  // Protocol is not consistent with token index, sometimes it uses 0-1 and sometimes 1-2.
  // We use 0-1 across the board and map params accordingly
  // Create a tokens and market entity
  let token0 = getOrCreateERC20Token(event, event.params.token1)
  let token1 = getOrCreateERC20Token(event, event.params.token2)
  let lpToken = getOrCreateERC20Token(event, event.params.mooniswap)

  let market = getOrCreateMarket(
    event,
    event.params.mooniswap,
    ProtocolName.ONEINCH,
    ProtocolType.EXCHANGE,
    [token0, token1],
    lpToken,
    []
  )

  lpToken.mintedByMarket = market.id
  lpToken.save()

  // Create pair
  let pair = new PairEntity(event.params.mooniswap.toHexString())
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
  Mooniswap.create(event.params.mooniswap)
}
