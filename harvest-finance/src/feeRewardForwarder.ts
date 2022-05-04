import { TokenPoolSet } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";
import { getOrCreateERC20Token } from "./common";
import { getOrCreateRewardPool } from "./harvestUtils";

/**
 * Handle new reward pools
 * @param event
 */
export function handleTokenPoolSet(event: TokenPoolSet): void {
  let rewardToken = getOrCreateERC20Token(event.block, event.params.token);
  let rewardPool = event.params.pool;

  getOrCreateRewardPool(rewardPool.toHexString(), rewardToken.id);
}
