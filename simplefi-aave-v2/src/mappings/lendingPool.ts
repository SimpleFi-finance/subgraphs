import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  Borrow,
  Repay,
  Swap,
  ReserveDataUpdated,
  FlashLoan,
  LiquidationCall,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Borrow as BorrowEntity,
  Repay as RepayEntity,
  FlashLoan as FlashLoanEntity,
  Withdrawal,
  Reserve,
  Market,
  SwapRateMode,
  UserDebtBalance,
  Liquidation,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateAccount,
  updateMarket,
  borrowFromMarket,
  repayToMarket,
  TokenBalance,
} from "../library/common";

import {
  getOrCreateUserDebtBalance,
  getOrInitReserve,
  getCollateralAmountLocked,
  getRepaymentRateMode,
} from "../library/lendingPoolUtils";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

export function handleDeposit(event: Deposit): void {
  // store deposit event as entity
  let deposit = new DepositEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  deposit.amount = event.params.amount;
  deposit.onBehalfOf = event.params.onBehalfOf.toHexString();
  deposit.referral = BigInt.fromI32(event.params.referral);
  deposit.reserve = event.params.reserve.toHexString();
  deposit.user = event.params.user.toHexString();
  deposit.transactionHash = event.transaction.hash.toHexString();
  deposit.save();
}

export function handleWithdraw(event: Withdraw): void {
  // store withdraw event as entity
  let withdrawal = new Withdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.amount = event.params.amount;
  withdrawal.to = event.params.to.toHexString();
  withdrawal.reserve = event.params.reserve.toHexString();
  withdrawal.user = event.params.user.toHexString();
  withdrawal.transactionHash = event.transaction.hash.toHexString();
  withdrawal.save();
}

export function handleBorrow(event: Borrow): void {
  // store borrow event as entity
  let borrow = new BorrowEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  borrow.amount = event.params.amount;
  borrow.onBehalfOf = event.params.onBehalfOf.toHexString();
  borrow.reserve = event.params.reserve.toHexString();
  borrow.user = event.params.user.toHexString();
  borrow.borrowRateMode = event.params.borrowRateMode.toI32();
  borrow.save();
}

export function handleRepay(event: Repay): void {
  // store repay event as entity
  let repay = new RepayEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  repay.amount = event.params.amount;
  repay.repayer = event.params.repayer.toHexString();
  repay.reserve = event.params.reserve.toHexString();
  repay.user = event.params.user.toHexString();
}

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let reserve = getOrInitReserve(
    event.params.reserve.toHexString(),
    event.address.toHexString(),
    event
  );

  let asset = getOrCreateERC20Token(event, event.params.reserve);

  reserve.asset = asset.id;
  reserve.assetDecimals = asset.decimals;
  reserve.liquidityRate = event.params.liquidityRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.variableBorrowIndex = event.params.variableBorrowIndex;
  reserve.variableBorrowRate = event.params.variableBorrowRate;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.save();
}

export function handleFlashLoan(event: FlashLoan): void {
  let flashLoan = new FlashLoanEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  flashLoan.target = event.params.target.toHexString();
  flashLoan.asset = event.params.asset.toHexString();
  flashLoan.initiator = event.params.initiator.toHexString();
  flashLoan.amount = event.params.amount;
  flashLoan.premium = event.params.premium;
  flashLoan.transactionHash = event.transaction.hash.toHexString();
  flashLoan.save();
}

export function handleSwap(event: Swap): void {
  // create swap entity
  let swap = new SwapRateMode(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  swap.reserve = event.params.reserve.toHexString();
  swap.user = event.params.user.toHexString();
  swap.rateMode = event.params.rateMode.toI32();
  swap.transactionHash = event.transaction.hash.toHexString();
  swap.save();
}

/**
 * Liquidated user:
 * - part of debt repayed
 * - part of collateral (aTokens) burned
 * Liquidator:
 * - receives underlying tokens of burned collateral
 * @param event
 */
export function handleLiquidationCall(event: LiquidationCall): void {
  let liquidation = new Liquidation(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  liquidation.collateralAsset = event.params.collateralAsset.toHexString();
  liquidation.debtAsset = event.params.debtAsset.toHexString();
  liquidation.debtToCover = event.params.debtToCover;
  liquidation.liquidatedCollateralAmount = event.params.liquidatedCollateralAmount;
  liquidation.liquidator = event.params.liquidator.toHexString();
  liquidation.receiveAToken = event.params.receiveAToken;
  liquidation.user = event.params.user.toHexString();
  liquidation.save();
}
