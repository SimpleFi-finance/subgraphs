import { Address, log } from "@graphprotocol/graph-ts";
import { PoolAdded } from "../generated/templates/PoolRegistry/PoolRegistry";
import { getOrCreatePoolViaRegistry } from "./curveUtil";
import { CurvePool } from "../generated/templates";

export function handlePoolAdded(event: PoolAdded): void {
  let curvePoolAddress = event.params.pool;
  let pool = getOrCreatePoolViaRegistry(event, curvePoolAddress);

  // start indexing new pool
  CurvePool.create(Address.fromString(pool.id));
}
