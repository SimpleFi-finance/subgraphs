import { BigInt, ethereum } from "@graphprotocol/graph-ts";

import { SushiFarm, SushiFarmSnapshot, UserInfo, UserInfoSnapshot } from "../../generated/schema";

/**
 * Create UserInfo entity which tracks how many LP tokens user provided and how many Sushi rewards he claimed
 * @param user
 * @param farmId
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

export function updateUserInfo(event: ethereum.Event, userInfo: UserInfo, amount: BigInt, rewardDebt: BigInt): UserInfo {
  userInfo.amount = amount;
  userInfo.rewardDebt = rewardDebt;
  userInfo.save();

  let id = userInfo.id + "-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString();
  let userInfoSnapshot = new UserInfoSnapshot(id);

  userInfoSnapshot.userInfo = userInfo.id;
  userInfoSnapshot.amount = userInfo.amount;
  userInfoSnapshot.rewardDebt = userInfo.rewardDebt;
  userInfoSnapshot.timestamp = event.block.timestamp;
  userInfoSnapshot.transactionHash = event.transaction.hash.toHexString();
  userInfoSnapshot.transactionIndexInBlock = event.transaction.index;
  userInfoSnapshot.blockNumber = event.block.number;
  userInfoSnapshot.logIndex = event.logIndex;

  userInfoSnapshot.save();

  return userInfo;
}

export function createFarmSnapshot(event: ethereum.Event, farm: SushiFarm): SushiFarmSnapshot {
  let snapshotId = event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString();
  let farmSnapshot = new SushiFarmSnapshot(snapshotId);
  farmSnapshot.farmPid = farm.farmPid;
  farmSnapshot.sushiFarm = farm.id;
  farmSnapshot.allocPoint = farm.allocPoint;
  farmSnapshot.totalSupply = farm.totalSupply;
  farmSnapshot.accSushiPerShare = farm.accSushiPerShare;
  farmSnapshot.lastRewardBlock = farm.lastRewardBlock;
  farmSnapshot.timestamp = event.block.timestamp;
  farmSnapshot.transactionHash = event.transaction.hash.toHexString();
  farmSnapshot.transactionIndexInBlock = event.transaction.index;
  farmSnapshot.blockNumber = event.block.number;
  farmSnapshot.logIndex = event.logIndex;
  farmSnapshot.save();

  return farmSnapshot;
}
