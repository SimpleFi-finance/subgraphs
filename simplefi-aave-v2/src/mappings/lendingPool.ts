import { BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  InitReserveCall,
} from "../../generated/templates/LendingPool/LendingPool";
import { Deposit as DepositEntity, Withdrawal, Reserve, Token } from "../../generated/schema";

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
} from "../library/common";

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
