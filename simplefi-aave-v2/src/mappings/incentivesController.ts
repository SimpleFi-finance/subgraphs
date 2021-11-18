import {
  RewardsClaimed,
  RewardsAccrued,
} from "../../generated/templates/IncentivesController/AaveIncentivesController";
import { RewardsClaimed as RewardsClaimedEntity, RewardsAccrue } from "../../generated/schema";

export function handleRewardsClaimed(event: RewardsClaimed): void {
  let claim = new RewardsClaimedEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  claim.user = event.params.user.toHexString();
  claim.to = event.params.to.toHexString();
  claim.claimer = event.params.claimer.toHexString();
  claim.amount = event.params.amount;
  claim.save();
}

export function handleRewardsAccrued(event: RewardsAccrued): void {
  let entity = new RewardsAccrue(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  entity.user = event.params.user.toHexString();
  entity.amount = event.params.amount;
  entity.save();
}
