import { RewardClaim } from "../generated/schema";
import { RewardPaid } from "../generated/templates/RewardPool/RewardPool";
import { getOrCreateAccount } from "./common";

export function handleRewardPaid(event: RewardPaid): void {
  let amount = event.params.reward;
  let user = getOrCreateAccount(event.params.user);
  let tx = event.transaction.hash.toHexString();

  let claim = new RewardClaim(user.id + "-" + tx);
  claim.user = user.id;
  claim.tx = tx;
  claim.amount = amount;
  claim.rewardPool = event.address.toHexString();
  claim.save();
}
