import { PoolAdded } from "../generated/templates/PoolRegistry/PoolRegistry";
import { getOrCreatePoolViaRegistry } from "./curveUtil";

export function handlePoolAdded(event: PoolAdded): void {
  let curvePoolAddress = event.params.pool;
  let pool = getOrCreatePoolViaRegistry(event, curvePoolAddress);

  if (!pool.isInRegistry) {
    pool.isInRegistry = true;
    pool.save();
  }
}
