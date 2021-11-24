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
  investInMarket,
  borrowFromMarket,
  redeemFromMarket,
  repayToMarket,
  TokenBalance,
} from "../library/common";

import {
  getOrCreateUserInvestmentBalance,
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
  let lendingPool = event.address.toHexString();

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

  // fetch market based on borrow mode
  let reserve = Reserve.load(lendingPool + "-" + borrow.reserve) as Reserve;
  let marketId: string;
  if (borrow.borrowRateMode == BORROW_MODE_STABLE) {
    marketId = lendingPool + "-" + reserve.stableDebtToken;
  } else if (borrow.borrowRateMode == BORROW_MODE_VARIABLE) {
    marketId = lendingPool + "-" + reserve.variableDebtToken;
  } else {
    // unrecognized borrow mode
    return;
  }

  // increase user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    borrow.onBehalfOf,
    reserve.id,
    marketId,
    borrow.borrowRateMode
  );
  userDebtBalance.debtTakenAmount = userDebtBalance.debtTakenAmount.plus(borrow.amount);
  userDebtBalance.save();

  // calculate how much collateral has been locked by this borrow
  let account = getOrCreateAccount(Address.fromString(borrow.onBehalfOf));
  let collateralAmountLocked = getCollateralAmountLocked(
    account,
    reserve,
    borrow.amount,
    event.block
  );

  // update market total supply
  let market = Market.load(marketId) as Market;
  let inputTokens = market.inputTokens as string[];
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newTotalSupply = market.outputTokenTotalSupply.plus(borrow.amount);

  let oldTotalCollateralLocked = TokenBalance.fromString(inputTokenTotalBalances[0]).balance;
  let newTotalCollaterLocked = oldTotalCollateralLocked.plus(collateralAmountLocked);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];

  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ////// update user's position

  // amount of debt bearing tokens minted
  let outputTokenAmount = borrow.amount;

  // amount of collateral locked because of debt taken in this TX
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], borrow.user, collateralAmountLocked),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.debtTakenAmount;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    account,
    reserve,
    userDebtBalance.debtTakenAmount,
    event.block
  );
  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], borrow.onBehalfOf, totalUsersCollateralAmountLocked)
  );

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [];

  borrowFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokensAmount,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances
  );
}

export function handleRepay(event: Repay): void {
  let lendingPool = event.address.toHexString();

  // store repay event as entity
  let repay = new RepayEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  repay.amount = event.params.amount;
  repay.repayer = event.params.repayer.toHexString();
  repay.reserve = event.params.reserve.toHexString();
  repay.user = event.params.user.toHexString();

  // figure out if it's variable or stable debt mode
  let reserve = Reserve.load(lendingPool + "-" + repay.reserve) as Reserve;
  let repaymentRateMode = getRepaymentRateMode(event, reserve);
  repay.rateMode = repaymentRateMode;
  repay.save();

  // fetch market based on rate mode
  let marketId: string;
  if (repaymentRateMode == BORROW_MODE_STABLE) {
    marketId = lendingPool + "-" + reserve.stableDebtToken;
  } else if (repaymentRateMode == BORROW_MODE_VARIABLE) {
    marketId = lendingPool + "-" + reserve.variableDebtToken;
  } else {
    // unrecognized borrow mode
    return;
  }

  // decrease user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    repay.user,
    reserve.id,
    marketId,
    BORROW_MODE_VARIABLE
  );
  userDebtBalance.debtTakenAmount = userDebtBalance.debtTakenAmount.minus(repay.amount);
  userDebtBalance.save();

  // user for whom debt is being repayed (not neccessarily the sender)
  let account = getOrCreateAccount(Address.fromString(repay.user));
  // amount of collateral unlocked because of this payment
  let collateralAmountUnlocked = getCollateralAmountLocked(
    account,
    reserve,
    repay.amount,
    event.block
  );

  // update market total supply
  let market = Market.load(marketId) as Market;
  let inputTokens = market.inputTokens as string[];
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newTotalSupply = market.outputTokenTotalSupply.minus(repay.amount);

  let oldTotalCollateralLocked = TokenBalance.fromString(inputTokenTotalBalances[0]).balance;
  let newTotalCollaterLocked = oldTotalCollateralLocked.minus(collateralAmountUnlocked);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];
  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ////// update user's position

  // amount of debt bearing tokens burned
  let outputTokenAmount = repay.amount;

  // amount of collateral unlocked because of repayment
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], repay.user, collateralAmountUnlocked),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.debtTakenAmount;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    account,
    reserve,
    userDebtBalance.debtTakenAmount,
    event.block
  );

  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], repay.user, totalUsersCollateralAmountLocked)
  );

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [];

  repayToMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokensAmount,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances
  );
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
  let lendingPool = event.address.toHexString();

  // create swap entity
  let swap = new SwapRateMode(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  swap.reserve = event.params.reserve.toHexString();
  swap.user = event.params.user.toHexString();
  swap.rateMode = event.params.rateMode.toI32();
  swap.transactionHash = event.transaction.hash.toHexString();
  swap.save();

  let reserve = Reserve.load(lendingPool + "-" + swap.reserve) as Reserve;
  let stableMarketId = lendingPool + "-" + reserve.stableDebtToken;
  let variableMarketId = lendingPool + "-" + reserve.variableDebtToken;

  // load debt trackers
  let userVariableDebtBalance = getOrCreateUserDebtBalance(
    swap.user,
    reserve.id,
    variableMarketId,
    BORROW_MODE_VARIABLE
  );

  let userStableDebtBalance = getOrCreateUserDebtBalance(
    swap.user,
    reserve.id,
    variableMarketId,
    BORROW_MODE_VARIABLE
  );

  if (swap.rateMode == BORROW_MODE_STABLE) {
    // increase stable debt
    userStableDebtBalance.debtTakenAmount = userStableDebtBalance.debtTakenAmount.plus(
      userVariableDebtBalance.debtTakenAmount
    );
    userStableDebtBalance.save();

    //decrease variable debt
    userVariableDebtBalance.debtTakenAmount = BigInt.fromI32(0);
    userVariableDebtBalance.save();

    // update user position - repay variable debt
    borrowOrRepayDebt(
      userVariableDebtBalance,
      userVariableDebtBalance.debtTakenAmount,
      reserve,
      event,
      variableMarketId,
      false
    );

    // update user position - borrow stable debt
    borrowOrRepayDebt(
      userStableDebtBalance,
      userStableDebtBalance.debtTakenAmount,
      reserve,
      event,
      stableMarketId,
      true
    );
  } else if (swap.rateMode == BORROW_MODE_VARIABLE) {
    // increase variable debt
    userVariableDebtBalance.debtTakenAmount = userVariableDebtBalance.debtTakenAmount.plus(
      userStableDebtBalance.debtTakenAmount
    );
    userVariableDebtBalance.save();

    // decrease stable debt
    userStableDebtBalance.debtTakenAmount = BigInt.fromI32(0);
    userStableDebtBalance.save();

    // update user position - repay stable debt
    borrowOrRepayDebt(
      userStableDebtBalance,
      userStableDebtBalance.debtTakenAmount,
      reserve,
      event,
      stableMarketId,
      false
    );

    // update user position - borrow variable debt
    borrowOrRepayDebt(
      userVariableDebtBalance,
      userVariableDebtBalance.debtTakenAmount,
      reserve,
      event,
      variableMarketId,
      true
    );
  } else {
    // unrecognized borrow rate mode
    return;
  }
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
  let lendingPool = event.address.toHexString();

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

  let debtAssetId = lendingPool + "-" + liquidation.debtAsset;
  let liquidatedReserve = Reserve.load(debtAssetId) as Reserve;

  // fetch market based on rate mode
  let debtMarketId: string;
  let repaymentRateMode = getRepaymentRateMode(event, liquidatedReserve);

  if (repaymentRateMode == BORROW_MODE_STABLE) {
    debtMarketId = lendingPool + "-" + liquidatedReserve.stableDebtToken;
  } else if (repaymentRateMode == BORROW_MODE_VARIABLE) {
    debtMarketId = lendingPool + "-" + liquidatedReserve.variableDebtToken;
  }

  // load existing tracker
  let userDebtBalance = getOrCreateUserDebtBalance(
    liquidation.user,
    debtAssetId,
    debtMarketId,
    getRepaymentRateMode(event, liquidatedReserve)
  );

  // debt liquidation is in effect debt repayment
  borrowOrRepayDebt(
    userDebtBalance,
    liquidation.debtToCover,
    liquidatedReserve,
    event,
    debtMarketId,
    false
  );
}

function borrowOrRepayDebt(
  userDebtBalance: UserDebtBalance,
  amount: BigInt,
  reserve: Reserve,
  event: ethereum.Event,
  marketId: string,
  isBorrow: boolean
): void {
  // user for whom debt is being borrowed/repayed
  let account = getOrCreateAccount(Address.fromString(userDebtBalance.user));

  // amount of collateral locked/unlocked because of this payment
  let collateralAmount = getCollateralAmountLocked(account, reserve, amount, event.block);

  ///// update market

  // update debt market total supply
  let market = Market.load(marketId) as Market;
  let inputTokens = market.inputTokens as string[];
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newTotalSupply: BigInt;
  if (isBorrow) {
    newTotalSupply = market.outputTokenTotalSupply.plus(amount);
  } else {
    newTotalSupply = market.outputTokenTotalSupply.minus(amount);
  }

  let oldTotalCollateralLocked = TokenBalance.fromString(inputTokenTotalBalances[0]).balance;
  let newTotalCollaterLocked: BigInt;
  if (isBorrow) {
    newTotalCollaterLocked = oldTotalCollateralLocked.plus(collateralAmount);
  } else {
    newTotalCollaterLocked = oldTotalCollateralLocked.minus(collateralAmount);
  }
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];
  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ///// update position

  // amount of debt bearing tokens minted/burned
  let outputTokenAmount = amount;

  // amount of collateral locked/unlocked
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], userDebtBalance.user, collateralAmount),
  ];

  // rewards are handled in separate contract
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens ->
  let outputTokenBalance: BigInt;
  if (isBorrow) {
    outputTokenBalance = userDebtBalance.debtTakenAmount;
  } else {
    // 0 because debt is moved to another market
    outputTokenBalance = BigInt.fromI32(0);
  }

  // amount of collateral locked
  let inputTokenBalances: TokenBalance[] = [];
  let balance: BigInt;
  if (isBorrow) {
    balance = getCollateralAmountLocked(
      account,
      reserve,
      userDebtBalance.debtTakenAmount,
      event.block
    );
  } else {
    // debt repayed -> no collateral locked
    balance = BigInt.fromI32(0);
  }
  inputTokenBalances.push(new TokenBalance(inputTokens[0], userDebtBalance.user, balance));

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [];

  if (isBorrow) {
    borrowFromMarket(
      event,
      account,
      market,
      outputTokenAmount,
      inputTokensAmount,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances
    );
  } else {
    repayToMarket(
      event,
      account,
      market,
      outputTokenAmount,
      inputTokensAmount,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances
    );
  }
}
