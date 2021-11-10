import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";

import { Reserve, UserInvestmentBalance, UserDebtBalance } from "../../generated/schema";

import { calculateLinearInterest, rayMul } from "./math";

/**
 * Create userInvestmentBalance entity which tracks how many tokens user provided
 * @param user
 * @param reserveId
 * @returns
 */
export function getOrCreateUserInvestmentBalance(
  user: string,
  reserveId: string
): UserInvestmentBalance {
  let id = user + "-" + reserveId;
  let userInvestmentBalance = UserInvestmentBalance.load(id) as UserInvestmentBalance;

  if (userInvestmentBalance == null) {
    userInvestmentBalance = new UserInvestmentBalance(id);
    userInvestmentBalance.user = user;
    userInvestmentBalance.reserve = reserveId;
    userInvestmentBalance.underlyingTokenProvidedAmount = BigInt.fromI32(0);
    userInvestmentBalance.save();
  }

  return userInvestmentBalance;
}

/**
 * Create userDebtBalance entity which tracks user's debt balance
 * @param user
 * @param reserveId
 * @returns
 */
export function getOrCreateUserDebtBalance(
  user: string,
  reserve: string,
  marketId: string,
  rateMode: BigInt
): UserDebtBalance {
  let id = user + "-" + marketId;
  let userDebtBalance = UserDebtBalance.load(id) as UserDebtBalance;

  if (userDebtBalance == null) {
    userDebtBalance = new UserDebtBalance(id);
    userDebtBalance.user = user;
    userDebtBalance.reserve = reserve;
    userDebtBalance.debtTakenAmount = BigInt.fromI32(0);
    userDebtBalance.totalCollateralInETH = BigInt.fromI32(0);
    userDebtBalance.totalDebtInETH = BigInt.fromI32(0);
    userDebtBalance.rateMode = rateMode;
    userDebtBalance.save();
  }

  return userDebtBalance;
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

export function userATokenBalance(balance: UserInvestmentBalance, event: ethereum.Event): BigInt {
  let reserve = Reserve.load(balance.reserve) as Reserve;
  let reserveNormalIncome = getReserveNormalizedIncome(reserve, event);

  return rayMul(balance.underlyingTokenProvidedAmount, reserveNormalIncome);
}
