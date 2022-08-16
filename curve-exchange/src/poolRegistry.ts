import { Pool } from "../generated/schema";
import { PoolAdded, PoolRemoved } from "../generated/templates/PoolRegistry/PoolRegistry";
import { getOrCreatePoolViaRegistry } from "./curveUtil";

/**
 * Create pool entity if there is no already one, add registry reference
 * @param event
 */
export function handlePoolAdded(event: PoolAdded): void {
  let curvePoolAddress = event.params.pool;
  let pool = getOrCreatePoolViaRegistry(event, curvePoolAddress, event.address);

  if (!pool.isInRegistry) {
    pool.isInRegistry = true;
    pool.registry = event.address.toHexString();
    pool.save();
  }
}

/**
 * Remove registry ref from pool entity
 * @param event
 * @returns
 */
export function handlePoolRemoved(event: PoolRemoved): void {
  let curvePoolAddress = event.params.pool;
  let pool = Pool.load(curvePoolAddress.toHexString());

  if (pool == null) {
    return;
  }

  // remove registry ref
  if (pool.isInRegistry) {
    pool.isInRegistry = false;
    pool.registry = null;
    pool.save();
  }
}
