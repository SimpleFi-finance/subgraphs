import { BigInt } from "@graphprotocol/graph-ts";

const NANO = BigInt.fromI32(10).pow(9);

export function parseSeedId(seedId: string): string[] {
  const parsedSeed: string[] = seedId.split("@");
  if (parsedSeed.length == 1) {
    parsedSeed[1] = parsedSeed[0];
  }
  return parsedSeed;
}

export function toSec(timestamp: BigInt): BigInt {
  return timestamp.div(NANO);
}

export function toNanoSec(timestamp: BigInt): BigInt {
  return timestamp.times(NANO);
}