import { TokenPoolSet } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";
import { getOrCreateProfitSharingPool } from "./harvestUtils";

/**
 * Handle new reward pools
 * @param event
 */
export function handleTokenPoolSet(event: TokenPoolSet): void {
  let profitSharingPool = event.params.pool;
  getOrCreateProfitSharingPool(event, profitSharingPool.toHexString());
}
