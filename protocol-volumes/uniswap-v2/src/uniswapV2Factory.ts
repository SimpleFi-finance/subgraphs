import { BigInt } from "@graphprotocol/graph-ts";
import { Pair } from "../generated/schema";
import { UniswapV2Pair } from "../generated/templates";
import { PairCreated } from "../generated/UniswapV2Factory/UniswapV2Factory";

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
  UniswapV2Pair.create(event.params.pair);
}
