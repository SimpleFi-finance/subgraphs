import { BigInt } from "@graphprotocol/graph-ts";

import { UserInfo } from "../../generated/schema";

/**
 * Create UserInfo entity which tracks how many LP tokens user provided and how many Sushi rewards he claimed
 * @param user
 * @param farmPid
 * @returns
 */
export function getOrCreateUserInfo(user: string, farmId: string): UserInfo {
  let id = user + "-" + farmId;
  let userInfo = UserInfo.load(id) as UserInfo;

  if (userInfo == null) {
    userInfo = new UserInfo(id);
    userInfo.amount = BigInt.fromI32(0);
    userInfo.rewardDebt = BigInt.fromI32(0);
    userInfo.user = user;
    userInfo.farm = farmId;
    userInfo.save();
  }

  return userInfo;
}
