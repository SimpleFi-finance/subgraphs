import { NotifyPoolsCall } from "../generated/NotifyHelper/NotifyHelper";
import { getOrCreateRewardPool, getOrCreateVault } from "./harvestUtils";
import { RewardPool as RewardPoolContract } from "../generated/templates/RewardPool/RewardPool";

export function handleNotifyPools(call: NotifyPoolsCall): void {
  let rewardPoolAddresses = call.inputs.pools;
  for (let i = 0; i < rewardPoolAddresses.length; i++) {
    // get vault
    let rewardPoolContract = RewardPoolContract.bind(rewardPoolAddresses[i]);
    let vaultAddress = rewardPoolContract.lpToken();
    getOrCreateVault(call.block, vaultAddress);

    // create reward pool if it doesn't exist
    getOrCreateRewardPool(call.block, rewardPoolAddresses[i].toHexString());
  }
}
