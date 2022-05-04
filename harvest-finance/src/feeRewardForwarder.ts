import { TokenPoolSet } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";
import { getOrCreateERC20Token } from "./common";

export function handleTokenPoolSet(event: TokenPoolSet): void {
  let rewardToken = getOrCreateERC20Token(event.block, event.params.token);
  let rewardPool = event.params.pool;
}
