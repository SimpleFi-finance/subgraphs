import { PoolAdded } from "../generated/templates/PoolRegistry/PoolRegistry";
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
