import { Mint, Burn, Initialized } from "../../generated/templates/StableDebtToken/StableDebtToken";

import {
  getAvgCumulatedInterest,
  getCollateralAmountLocked,
  getOrCreateIncentivesController,
  getOrCreateStableDebtToken,
  getOrCreateUserDebtBalance,
} from "../library/lendingPoolUtils";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

import { Market, Reserve } from "../../generated/schema";

import {
  ADDRESS_ZERO,
  borrowFromMarket,
  getOrCreateAccount,
  repayToMarket,
  TokenBalance,
  updateMarket,
} from "../library/common";

/**
 * Update market and user position when stable rate debt is issued.
 * @param event
 */
export function handleStableTokenMint(event: Mint): void {
  let mintedAmount = event.params.amount;
  let scaledMintedAmount = mintedAmount.plus(event.params.balanceIncrease);
  let currentUsersBalance = event.params.currentBalance;

  // user receives borrowed tokens
  let user = getOrCreateAccount(event.params.user);

  // onBehalfOf receives debt tokens
  let onBehalfOf = getOrCreateAccount(event.params.onBehalfOf);

  let sToken = getOrCreateStableDebtToken(event.address.toHexString());
  let market = Market.load(sToken.lendingPool + "-" + sToken.id) as Market;
  let reserve = Reserve.load(sToken.lendingPool + "-" + sToken.underlyingAsset) as Reserve;

  // increase debt balance of user who got debt tokens
  let userDebtBalance = getOrCreateUserDebtBalance(
    onBehalfOf.id,
    reserve.id,
    market.id,
    BORROW_MODE_STABLE
  );
  userDebtBalance.scaledDebtTokenBalance = userDebtBalance.scaledDebtTokenBalance.plus(
    scaledMintedAmount
  );
  userDebtBalance.amountBorrowedBalance = userDebtBalance.amountBorrowedBalance.plus(mintedAmount);
  userDebtBalance.save();

  // calculate how much collateral has been locked by this borrow
  let collateralAmountLocked = getCollateralAmountLocked(
    onBehalfOf,
    reserve,
    mintedAmount,
    event.block
  );

  // update market total supply
  let inputTokens = market.inputTokens as string[];
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newTotalSupply = market.outputTokenTotalSupply.plus(scaledMintedAmount);

  let prevTotalCollateralLocked = TokenBalance.fromString(inputTokenTotalBalances[0]).balance;
  let newTotalCollaterLocked = prevTotalCollateralLocked.plus(collateralAmountLocked);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];

  let marketSnaphost = updateMarket(event, market, marketInputTokenBalances, newTotalSupply);
  marketSnaphost.balanceMultiplier = getAvgCumulatedInterest(reserve, event);
  marketSnaphost.save();
  market.balanceMultiplier = marketSnaphost.balanceMultiplier;
  market.save();

  ////// update user's position

  // amount of debt bearing tokens minted
  let outputTokenAmount = scaledMintedAmount;

  // amount of collateral locked because of debt taken in this TX
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], onBehalfOf.id, collateralAmountLocked),
  ];

  // total scaled balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.scaledDebtTokenBalance;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    onBehalfOf,
    reserve,
    currentUsersBalance,
    event.block
  );
  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], onBehalfOf.id, totalUsersCollateralAmountLocked)
  );

  borrowFromMarket(
    event,
    onBehalfOf,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    []
  );
}

/**
 * Update market and user position when stable rate debt is repaid.
 * @param event
 */
export function handleStableTokenBurn(event: Burn): void {
  let burnedAmount = event.params.amount;
  let scaledBurnedAmount = burnedAmount.minus(event.params.balanceIncrease);
  let currentUsersBalance = event.params.currentBalance;

  // user whose debt is getting burned
  let user = getOrCreateAccount(event.params.user);

  let sToken = getOrCreateStableDebtToken(event.address.toHexString());
  let market = Market.load(sToken.lendingPool + "-" + sToken.id) as Market;
  let reserve = Reserve.load(sToken.lendingPool + "-" + sToken.underlyingAsset) as Reserve;

  // decrease user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    user.id,
    reserve.id,
    market.id,
    BORROW_MODE_STABLE
  );
  userDebtBalance.scaledDebtTokenBalance = userDebtBalance.scaledDebtTokenBalance.minus(
    scaledBurnedAmount
  );
  userDebtBalance.amountBorrowedBalance = userDebtBalance.amountBorrowedBalance.minus(burnedAmount);
  userDebtBalance.save();

  // calculate how much collateral has been unlocked
  let collateralAmountUnlocked = getCollateralAmountLocked(
    user,
    reserve,
    burnedAmount,
    event.block
  );

  // update market total supply
  let inputTokens = market.inputTokens as string[];
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newTotalSupply = market.outputTokenTotalSupply.minus(scaledBurnedAmount);

  let prevTotalCollateralLocked = TokenBalance.fromString(inputTokenTotalBalances[0]).balance;
  let newTotalCollaterLocked = prevTotalCollateralLocked.minus(collateralAmountUnlocked);
  let marketInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newTotalCollaterLocked),
  ];

  let marketSnaphost = updateMarket(event, market, marketInputTokenBalances, newTotalSupply);
  marketSnaphost.balanceMultiplier = getAvgCumulatedInterest(reserve, event);
  marketSnaphost.save();
  market.balanceMultiplier = marketSnaphost.balanceMultiplier;
  market.save();

  ////// update user's position

  // amount of debt bearing tokens burned
  let outputTokenAmount = scaledBurnedAmount;

  // amount of collateral unlocked
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], user.id, collateralAmountUnlocked),
  ];

  // total scaled balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.scaledDebtTokenBalance;

  // total amount of user's collateral locked by debt taken in this underlying token
  let inputTokenBalances: TokenBalance[] = [];
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    user,
    reserve,
    currentUsersBalance,
    event.block
  );
  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], user.id, totalUsersCollateralAmountLocked)
  );

  repayToMarket(
    event,
    user,
    market,
    outputTokenAmount,
    inputTokensAmount,
    [],
    outputTokenBalance,
    inputTokenBalances,
    []
  );
}

/**
 * Store sToken info when it is initialized.
 * @param event
 * @returns
 */
export function handleStableDebtTokenInitialized(event: Initialized): void {
  let sTokenAdress = event.address.toHexString();
  let sToken = getOrCreateStableDebtToken(sTokenAdress);

  sToken.underlyingAsset = event.params.underlyingAsset.toHexString();
  sToken.lendingPool = event.params.pool.toHexString();
  sToken.incentivesController = event.params.incentivesController.toHexString();
  sToken.debtTokenName = event.params.debtTokenName;
  sToken.debtTokenSymbol = event.params.debtTokenSymbol;
  sToken.debtTokenDecimals = event.params.debtTokenDecimals;
  sToken.save();

  let controllerAddress = event.params.incentivesController.toHexString();
  if (controllerAddress == ADDRESS_ZERO) {
    return;
  }

  let lendingPool = event.params.pool.toHexString();
  getOrCreateIncentivesController(event, controllerAddress, lendingPool);
}
