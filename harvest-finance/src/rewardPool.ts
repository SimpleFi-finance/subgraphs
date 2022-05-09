import { Market } from "../generated/schema";
import {
  RewardPaid,
  Staked,
  Withdrawn,
} from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import { getOrCreateAccount } from "./common";
import { getOrCreateRewardPool } from "./harvestUtils";

export function handleStaked(event: Staked): void {
  // to do
}

export function handleWithdrawn(event: Withdrawn): void {
  // to do
}

export function handleRewardPaid(event: RewardPaid): void {
  let rewardPool = getOrCreateRewardPool(event, event.address.toHexString());
  let rewardAmount = event.params.reward;
  let user = getOrCreateAccount(event.params.user);

  let market = Market.load(rewardPool.lpToken);
}
