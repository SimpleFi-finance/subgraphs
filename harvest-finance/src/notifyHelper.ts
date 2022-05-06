import { NotifyPoolsCall } from "../generated/NotifyHelper/NotifyHelper";

export function handleNotifyPools(call: NotifyPoolsCall): void {
  let rewardPoolAddresses = call.inputs.pools;
  for (let i = 0; i < rewardPoolAddresses.length; i++) {
    // create reward pool
  }
}
