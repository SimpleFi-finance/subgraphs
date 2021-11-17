import {
  RewardsClaimed,
  RewardsAccrued,
} from "../../generated/templates/AaveIncentivesController/AaveIncentivesController";
import { RewardsClaimed as RewardsClaimedEntity, RewardsAccrue } from "../../generated/schema";

export function handleRewardsClaimed(event: RewardsClaimed): void {
  let entity = new RewardsClaimedEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  entity.user = event.params.user.toHexString();
  entity.to = event.params.to.toHexString();
  entity.amount = event.params.amount;
  entity.save();
}

export function handleRewardsAccrued(event: RewardsAccrued): void {
  let entity = new RewardsAccrue(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  entity.user = event.params.user.toHexString();
  entity.amount = event.params.amount;
  entity.save();
}
