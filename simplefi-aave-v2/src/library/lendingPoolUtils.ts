import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";

import { Reserve, UserBalance } from "../../generated/schema";

import { calculateLinearInterest, rayMul } from "./math";

/**
 * Create UserBalance entity which tracks how many tokens user provided
 * @param user
 * @param reserveId
 * @returns
 */
export function getOrCreateUserBalance(user: string, reserveId: string): UserBalance {
  let id = user + "-" + reserveId;
  let userBalance = UserBalance.load(id) as UserBalance;

  if (userBalance == null) {
    userBalance = new UserBalance(id);
    userBalance.user = user;
    userBalance.reserve = reserveId;
    userBalance.providedTokenAmount = BigInt.fromI32(0);
    userBalance.outputTokenAmount = BigInt.fromI32(0);
    userBalance.save();
  }

  return userBalance;
}

/**
 * Returns the ongoing normalized income for the reserve.
 * @param reserve
 * @param event
 * @returns
 */
export function getReserveNormalizedIncome(reserve: Reserve, event: ethereum.Event): BigInt {
  let timestamp = reserve.lastUpdateTimestamp;

  if (timestamp.equals(event.block.timestamp)) {
    //if the index was updated in the same block, no need to perform any calculation
    return reserve.liquidityIndex;
  }

  let cumulated = calculateLinearInterest(reserve.liquidityRate, timestamp, event.block.timestamp);
  let result = rayMul(cumulated, reserve.liquidityIndex);

  return result;
}
