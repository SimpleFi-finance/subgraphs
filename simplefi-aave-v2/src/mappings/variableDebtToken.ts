import {
  Mint,
  Burn,
  Initialized,
} from "../../generated/templates/VariableDebtToken/VariableDebtToken";

import {
  getCollateralAmountLocked,
  getOrCreateIncentivesController,
  getOrCreateUserDebtBalance,
  getOrCreateVariableDebtToken,
} from "../library/lendingPoolUtils";

import { Market, Reserve, VariableDebtTokenBurn } from "../../generated/schema";

import {
  ADDRESS_ZERO,
  borrowFromMarket,
  getOrCreateAccount,
  repayToMarket,
  TokenBalance,
  updateMarket,
} from "../library/common";
import { rayDiv, rayMul } from "../library/math";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

export function handleVariableTokenMint(event: Mint): void {
  let mintedAmount = event.params.value;
  let variableBorrowIndex = event.params.index;
  let scaledMintedAmount = rayDiv(mintedAmount, variableBorrowIndex);

  // user receives borrowed tokens
  let user = getOrCreateAccount(event.params.from);

  // onBehalfOf receives debt tokens
  let onBehalfOf = getOrCreateAccount(event.params.onBehalfOf);

  let vToken = getOrCreateVariableDebtToken(event.address.toHexString());
  let market = Market.load(vToken.lendingPool + "-" + vToken.id) as Market;
  let reserve = Reserve.load(vToken.lendingPool + "-" + vToken.underlyingAsset) as Reserve;

  // increase debt balance of user who got debt tokens
  let userDebtBalance = getOrCreateUserDebtBalance(
    onBehalfOf.id,
    reserve.id,
    market.id,
    BORROW_MODE_VARIABLE
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

  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

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
  let debtBalance = rayMul(userDebtBalance.scaledDebtTokenBalance, variableBorrowIndex);
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    onBehalfOf,
    reserve,
    debtBalance,
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

export function handleVariableTokenBurn(event: Burn): void {
  let burnedAmount = event.params.amount;
  let variableBorrowIndex = event.params.index;
  let scaledBurnedAmount = rayDiv(burnedAmount, variableBorrowIndex);

  // user whose debt is getting burned
  let user = getOrCreateAccount(event.params.user);

  let vToken = getOrCreateVariableDebtToken(event.address.toHexString());
  let market = Market.load(vToken.lendingPool + "-" + vToken.id) as Market;
  let reserve = Reserve.load(vToken.lendingPool + "-" + vToken.underlyingAsset) as Reserve;

  // decrease user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    user.id,
    reserve.id,
    market.id,
    BORROW_MODE_VARIABLE
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

  updateMarket(event, market, marketInputTokenBalances, newTotalSupply);

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
  let debtBalance = rayMul(userDebtBalance.scaledDebtTokenBalance, variableBorrowIndex);
  let totalUsersCollateralAmountLocked = getCollateralAmountLocked(
    user,
    reserve,
    debtBalance,
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

  ////// old stuff TODO remove
  let tx = event.transaction.hash.toHexString();
  let variableToken = event.address.toHexString();

  let burn = new VariableDebtTokenBurn(tx + "-" + variableToken);
  burn.save();
}

export function handleVariableDebtTokenInitialized(event: Initialized): void {
  let vTokenAdress = event.address.toHexString();
  let vToken = getOrCreateVariableDebtToken(vTokenAdress);

  vToken.underlyingAsset = event.params.underlyingAsset.toHexString();
  vToken.lendingPool = event.params.pool.toHexString();
  vToken.incentivesController = event.params.incentivesController.toHexString();
  vToken.debtTokenName = event.params.debtTokenName;
  vToken.debtTokenSymbol = event.params.debtTokenSymbol;
  vToken.debtTokenDecimals = event.params.debtTokenDecimals;
  vToken.save();

  let controllerAddress = event.params.incentivesController.toHexString();
  if (controllerAddress == ADDRESS_ZERO) {
    return;
  }

  let lendingPool = event.params.pool.toHexString();
  getOrCreateIncentivesController(event, controllerAddress, lendingPool);
}
