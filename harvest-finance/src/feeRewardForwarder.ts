import { TokenPoolSet } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";
import { getOrCreateERC20Token } from "./common";
import { getOrCreateProfitSharingPool } from "./harvestUtils";

/**
 * Handle new reward pools
 * @param event
 */
export function handleTokenPoolSet(event: TokenPoolSet): void {
  let rewardToken = getOrCreateERC20Token(event.block, event.params.token);
  let profitSharingPool = event.params.pool;

  getOrCreateProfitSharingPool(profitSharingPool.toHexString(), rewardToken.id);
}
