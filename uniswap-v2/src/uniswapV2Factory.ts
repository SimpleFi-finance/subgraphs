import { BigInt, DataSourceContext } from "@graphprotocol/graph-ts"
import { 
  Pair as PairEntity,
  PairFactory as PairFactoryEntity 
} from "../generated/schema"
import { UniswapV2Pair } from "../generated/templates"
import { PairCreated, SetFeeToCall } from "../generated/UniswapV2Factory/UniswapV2Factory"
import { getOrCreateAccount, getOrCreateERC20Token, getOrCreateMarket } from "./common"
import { FEE_30_BASE_POINTS, protocolToFee, ProtocolType } from "./constants"

export function handlePairCreated(event: PairCreated, protocolName: string): void {
  let pairFactory = PairFactoryEntity.load(event.address.toHexString())
  if (pairFactory == null) {
    pairFactory = new PairFactoryEntity(event.address.toHexString())
    pairFactory.save()
  }

  // Create a tokens and market entity
  let token0 = getOrCreateERC20Token(event, event.params.token0)
  let token1 = getOrCreateERC20Token(event, event.params.token1)
  let lpToken = getOrCreateERC20Token(event, event.params.pair)

  let market = getOrCreateMarket(
    event,
    event.params.pair,
    protocolName,
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
  let context = new DataSourceContext()
  context.setBigInt("protocolFee", getProtocolFee(event.address.toHexString()))
  UniswapV2Pair.createWithContext(event.params.pair, context)
}

/**
 * Get protocol's swap fee by looking at static mapping in constants
 * @param address
 * @returns
 */
function getProtocolFee(address: string): BigInt {
  let fee = protocolToFee.get(address)

  if (fee == null) {
    // if not found, use Uniswap default of 0.3% swap fee (30 bps)
    fee = BigInt.fromI32(FEE_30_BASE_POINTS)
  }

  return fee as BigInt
}

export function handleSetFeeTo(call: SetFeeToCall): void {
  let pairFactory = PairFactoryEntity.load(call.to.toHexString())
  if (pairFactory == null) {
    pairFactory = new PairFactoryEntity(call.to.toHexString())
    pairFactory.save()
  }

  pairFactory.feeTo = call.inputs._feeTo.toHexString()
  pairFactory.save()
}
