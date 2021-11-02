import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Deposit, Withdraw } from "../../generated/templates/LendingPool/LendingPool";

import { Deposit as DepositEntity, Withdrawal } from "../../generated/schema";

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
