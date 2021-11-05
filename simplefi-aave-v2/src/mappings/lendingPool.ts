import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  InitReserveCall,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Withdrawal,
  Reserve,
  Token,
  Market,
  UserBalance,
} from "../../generated/schema";

import { ProtocolName, ProtocolType } from "../library/constants";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  ADDRESS_ZERO,
  getOrCreateMarket,
} from "../library/common";

import { calculateCompoundedInterest, calculateLinearInterest, rayMul } from "../library/math";

export function handleDeposit(event: Deposit): void {
  let amount = event.params.amount;
  let onBehalfOf = event.params.onBehalfOf;
  let referral = event.params.referral;
  let reserve = event.params.reserve;
  let user = event.params.user;

  let deposit = new DepositEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  deposit.amount = amount;
  deposit.onBehalfOf = onBehalfOf.toHexString();
  deposit.referral = BigInt.fromI32(referral);
  deposit.reserve = reserve.toHexString();
  deposit.user = user.toHexString();
  deposit.save();

  // increase user's balance of provided tokens
  let reserveId = event.transaction.hash.toHexString() + "-" + reserve.toHexString();
  let userBalance = getOrCreateUserBalance(deposit.onBehalfOf, reserveId);
  userBalance.reserve = reserveId;
  userBalance.providedTokenAmount = userBalance.providedTokenAmount.plus(deposit.amount);
  userBalance.outputTokenAmount = userBalance.outputTokenAmount.plus(deposit.amount);
  userBalance.save();

  ////// update user's position

  let market = Market.load(event.address.toHexString() + "-" + deposit.reserve) as Market;

  // depositer (msg.sender)
  let account = getOrCreateAccount(Address.fromString(deposit.user));

  // amount of aTokens moved
  let outputTokenAmount = deposit.amount;

  // amount of reserve asset tokens moved
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(deposit.reserve, account.id, deposit.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided token amounts
  let outputTokenBalance = userBalance.outputTokenAmount;

  // inputTokenBalance -> number of tokens that can be redeemed by aToken receiver
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(reserve.toHexString(), deposit.onBehalfOf, userBalance.outputTokenAmount)
  );

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [];

  // use common function to update position and store transaction
  investInMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokensAmount,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

export function handleWithdraw(event: Withdraw): void {
  let amount = event.params.amount;
  let to = event.params.to;
  let reserve = event.params.reserve;
  let user = event.params.user;

  let withdrawal = new Withdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.amount = amount;
  withdrawal.to = to.toHexString();
  withdrawal.reserve = reserve.toHexString();
  withdrawal.user = user.toHexString();
  withdrawal.save();
}

export function handleInitReserveCall(call: InitReserveCall): void {
  let event = new ethereum.Event();
  event.block = call.block;

  let asset = getOrCreateERC20Token(event, call.inputs.asset);
  let aToken = getOrCreateERC20Token(event, call.inputs.aTokenAddress);

  let reserve = new Reserve(call.to.toHexString() + "-" + asset.id);
  reserve.lendingPool = call.to.toHexString();
  reserve.asset = asset.id;
  reserve.aToken = aToken.id;
  reserve.lastUpdateTimestamp = call.block.timestamp;
  reserve.liquidityIndex = BigInt.fromI32(0);
  reserve.liquidityRate = BigInt.fromI32(0);
  reserve.save();

  // create market representing the farm
  let marketId = reserve.id;
  let marketAddress = call.to;
  let protocolName = ProtocolName.AAVE_POOL;
  let protocolType = ProtocolType.LENDING;
  let inputTokens: Token[] = [asset];
  let outputTokens = aToken;
  let rewardTokens: Token[] = [];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputTokens,
    rewardTokens
  );
}

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
