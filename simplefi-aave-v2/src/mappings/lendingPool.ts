import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  Borrow,
  Repay,
  Swap,
  ReserveDataUpdated,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Borrow as BorrowEntity,
  Repay as RepayEntity,
  Withdrawal,
  Reserve,
  Market,
  SwapRateMode,
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
  ADDRESS_ZERO,
} from "../library/common";

import {
  getOrCreateUserInvestmentBalance,
  getOrCreateUserDebtBalance,
  getReserveNormalizedIncome,
  getUserATokenBalance,
  getMarketATokenSupply,
  getPriceOracle,
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
  deposit.save();

  // increase user's balance of provided tokens
  let reserveId = event.address.toHexString() + "-" + deposit.reserve;
  let userInvestmentBalance = getOrCreateUserInvestmentBalance(deposit.onBehalfOf, reserveId);
  userInvestmentBalance.underlyingTokenProvidedAmount = userInvestmentBalance.underlyingTokenProvidedAmount.plus(
    deposit.amount
  );
  userInvestmentBalance.save();

  // update market total supply
  let market = Market.load(reserveId) as Market;
  let oldTotalSupply = getMarketATokenSupply(market, reserveId, event);
  let newTotalSupply = oldTotalSupply.plus(deposit.amount);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(deposit.reserve, market.id, newTotalSupply),
  ];
  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ////// update user's position

  // position shall be updated for user on whose behalf deposit is made
  let account = getOrCreateAccount(Address.fromString(deposit.onBehalfOf));

  // amount of aTokens minted
  let outputTokenAmount = deposit.amount;

  // amount of underlying asset tokens supplied
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(deposit.reserve, deposit.user, deposit.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // user's total balance of aTokens
  let outputTokenBalance = getUserATokenBalance(userInvestmentBalance, event);

  // number of tokens that can be redeemed by deposit receiver - it's equal to user's aToken balance
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(deposit.reserve, deposit.onBehalfOf, outputTokenAmount));

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
  // store withdraw event as entity
  let withdrawal = new Withdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.amount = event.params.amount;
  withdrawal.to = event.params.to.toHexString();
  withdrawal.reserve = event.params.reserve.toHexString();
  withdrawal.user = event.params.user.toHexString();
  withdrawal.save();

  // decrease user's balance of provided tokens
  let reserveId = event.address.toHexString() + "-" + withdrawal.reserve;
  let userInvestmentBalance = getOrCreateUserInvestmentBalance(withdrawal.user, reserveId);
  userInvestmentBalance.underlyingTokenProvidedAmount = userInvestmentBalance.underlyingTokenProvidedAmount.minus(
    withdrawal.amount
  );
  userInvestmentBalance.save();

  // update market total supply
  let market = Market.load(reserveId) as Market;
  let oldTotalSupply = getMarketATokenSupply(market, reserveId, event);
  let newTotalSupply = oldTotalSupply.minus(withdrawal.amount);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(withdrawal.reserve, market.id, newTotalSupply),
  ];
  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ////// update user's position

  // withdrawer (msg.sender)
  let account = getOrCreateAccount(Address.fromString(withdrawal.user));

  // amount of aTokens burned
  let outputTokenAmount = withdrawal.amount;

  // withdraw receiver received `amount` of underlying tokens
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(withdrawal.reserve, withdrawal.to, withdrawal.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // user's total balance of aTokens
  let outputTokenBalance = getUserATokenBalance(userInvestmentBalance, event);

  // number of tokens that can be redeemed by withdrawer - it's equal to his aToken balance
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(withdrawal.reserve, withdrawal.user, outputTokenAmount));

  // reward token amounts claimable by user
  let rewardTokenBalances: TokenBalance[] = [];

  // use common function to update position and store transaction
  redeemFromMarket(
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
    marketId,
    reserve.id,
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
    marketId,
    reserve.id,
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
  let newTotalCollaterLocked = oldTotalCollateralLocked.plus(collateralAmountUnlocked);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];
  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

  ////// update user's position

  // amount of debt bearing tokens burned
  let outputTokenAmount = repay.amount;

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

export function handleSwap(event: Swap): void {
  let lendingPool = event.address.toHexString();

  let swap = new SwapRateMode(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  swap.reserve = event.params.reserve.toHexString();
  swap.user = event.params.user.toHexString();
  swap.rateMode = event.params.rateMode.toI32();

  let reserve = Reserve.load(lendingPool + "-" + swap.reserve) as Reserve;
  let marketId: string;
  if (swap.rateMode == BORROW_MODE_STABLE) {
    marketId = event.address.toHexString() + "-" + reserve.variableDebtToken;

    // load existing tracker
    let userDebtBalance = getOrCreateUserDebtBalance(
      swap.user,
      marketId,
      reserve.id,
      BORROW_MODE_VARIABLE
    );

    // switch it to stable mode
    userDebtBalance.id = event.address.toHexString() + "-" + reserve.stableDebtToken;
    userDebtBalance.rateMode = BORROW_MODE_STABLE;
    userDebtBalance.save();

    // TODO update markets
  } else if (swap.rateMode == BORROW_MODE_VARIABLE) {
    marketId = event.address.toHexString() + "-" + reserve.stableDebtToken;
    // load existing tracker
    let userDebtBalance = getOrCreateUserDebtBalance(
      swap.user,
      marketId,
      reserve.id,
      BORROW_MODE_STABLE
    );
    // switch it to variable mode
    userDebtBalance.id = event.address.toHexString() + "-" + reserve.variableDebtToken;
    userDebtBalance.rateMode = BORROW_MODE_VARIABLE;
    userDebtBalance.save();

    // TODO update markets
  } else {
    // unrecognized borrow rate mode
    return;
  }
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
  reserve.lastUpdateTimestamp = event.block.timestamp;
  reserve.save();
}
