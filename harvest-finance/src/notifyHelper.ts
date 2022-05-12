import { NotifyPoolsCall } from "../generated/NotifyHelper/NotifyHelper";
import { createFakeEventFromCall, getOrCreateRewardPool, getOrCreateVault } from "./harvestUtils";
import { RewardPool as RewardPoolContract } from "../generated/templates/RewardPool/RewardPool";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";

export function handleNotifyPools(call: NotifyPoolsCall): void {
  let rewardPoolAddresses = call.inputs.pools;
  for (let i = 0; i < rewardPoolAddresses.length; i++) {
    // get vault
    let rewardPoolContract = RewardPoolContract.bind(rewardPoolAddresses[i]);
    let vaultAddress = rewardPoolContract.lpToken();

    // quick check if contract implements IVault interface
    let vaultContract = VaultContract.bind(vaultAddress);
    if (vaultContract.try_getPricePerFullShare().reverted) {
      continue;
    }
    // create vault
    getOrCreateVault(createFakeEventFromCall(call), vaultAddress);

    // create reward pool if it doesn't exist
    getOrCreateRewardPool(createFakeEventFromCall(call), rewardPoolAddresses[i].toHexString());
  }
}
