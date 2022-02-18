import { log } from "@graphprotocol/graph-ts";
import { PoolAdded } from "../generated/templates/PoolRegistry/PoolRegistry";
import { getOrCreatePool } from "./curveUtil";

export function handlePoolAdded(event: PoolAdded): void {
  let curvePoolAddress = event.params.pool;
  getOrCreatePool(event, curvePoolAddress);
}
