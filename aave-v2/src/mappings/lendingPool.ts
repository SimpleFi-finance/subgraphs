import { BigInt } from "@graphprotocol/graph-ts";

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
  SwapRateMode,
  Liquidation,
  Market,
} from "../../generated/schema";

import { getOrCreateERC20Token, TokenBalance, updateMarket } from "../library/common";
import { getOrInitReserve } from "../library/lendingPoolUtils";
import { rayMul } from "../library/math";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

/**
 * Create deposit entity. Market and position are updated in aToken mint handler.
 * @param event
 */
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

/**
 * Create Withdrawal entity. Market and position are updated in aToken burn handler.
 * @param event
 */
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

/**
 * Create Borrow entity. Market and position are updated in debt token mint handler.
 * @param event
 */
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

/**
 * Create Repay entity. Market and position are updated in debt token burn handler.
 * @param event
 */
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

/**
 * Update Reserve entity. Update deposit market supply as liquidity index has been updated.
 * @param event
 */
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
  reserve.stableBorrowRate = event.params.stableBorrowRate;
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.save();

  // update market supply due to liquidity index change
  let market = Market.load(reserve.lendingPool + "-" + reserve.asset) as Market;
  let scaledTotalSupply = market.outputTokenTotalSupply;

  let inputTokens = market.inputTokens as string[];
  let newTotalATokenSupply = rayMul(scaledTotalSupply, reserve.liquidityIndex);
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalATokenSupply),
  ];

  updateMarket(event, market, newInputTokenBalances, scaledTotalSupply);
}

/**
 * Create Flashloan entity. Market and position are updated based on tokens mint/burn handlers.
 * @param event
 */
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

/**
 * Create Swap entity. User position is updated based on debt token burn/mint handlers.
 * @param event
 */
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
 * Create Liquidation entity. Market and position are updated based on tokens mint/burn handlers.
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
