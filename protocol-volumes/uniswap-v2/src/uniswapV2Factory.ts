import { BigInt, DataSourceContext } from "@graphprotocol/graph-ts";
import { Pair } from "../generated/schema";
import { UniswapV2Pair } from "../generated/templates";
import { PairCreated } from "../generated/UniswapV2Factory/UniswapV2Factory";
import { FEE_30_BASE_POINTS, protocolToFee } from "./constants";

/**
 * Create Pair entity and start indexing pair contract
 * @param event
 */
export function handlePairCreated(event: PairCreated): void {
  // Create a tokens and market entity
  let token0 = event.params.token0.toHexString();
  let token1 = event.params.token1.toHexString();

  // Create pair
  let pair = new Pair(event.params.pair.toHexString());
  pair.factory = event.address.toHexString();
  pair.token0 = token0;
  pair.token1 = token1;
  pair.totalSupply = BigInt.fromI32(0);
  pair.reserve0 = BigInt.fromI32(0);
  pair.reserve1 = BigInt.fromI32(0);
  pair.blockNumber = event.block.number;
  pair.timestamp = event.block.timestamp;
  pair.save();

  // Start listening for market events
  let context = new DataSourceContext();
  context.setBigInt("protocolFee", getProtocolFee(event.address.toHexString()));
  UniswapV2Pair.createWithContext(event.params.pair, context);
}

/**
 * Get protocol's swap fee by looking at static mapping in constants
 * @param address
 * @returns
 */
function getProtocolFee(address: string): BigInt {
  let fee = protocolToFee.get(address);

  if (fee == null) {
    // if not found, use Uniswap default of 0.3% swap fee (30 bps)
    fee = BigInt.fromI32(FEE_30_BASE_POINTS);
  }

  return fee as BigInt;
}
