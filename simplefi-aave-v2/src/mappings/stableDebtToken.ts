import {
  Mint,
  Burn,
  Initialized as StableDebtTokenInitialized,
} from "../../generated/templates/StableDebtToken/StableDebtToken";

import {
  getCollateralAmountLocked,
  getOrCreateIncentivesController,
  getOrCreateStableDebtToken,
  getOrCreateUserDebtBalance,
} from "../library/lendingPoolUtils";

const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

import { Market, Reserve, StableDebtTokenBurn } from "../../generated/schema";

import {
  ADDRESS_ZERO,
  borrowFromMarket,
  getOrCreateAccount,
  TokenBalance,
  updateMarket,
} from "../library/common";
import { rayMul } from "../library/math";

export function handleStableTokenMint(event: Mint): void {

  let mintedAmount = event.params.amount;
  let currentUsersBalance = event.params.currentBalance;
  event.params.newRate;
  event.params.avgStableRate;
  event.params.newTotalSupply;

  let scaledMintedAmount = mintedAmount.plus(event.params.balanceIncrease);

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

export function handleStableTokenBurn(event: Burn): void {
  ////// old stuff TODO remove
  let tx = event.transaction.hash.toHexString();
  let token = event.address.toHexString();

  let burn = new StableDebtTokenBurn(tx + "-" + token);
  burn.save();
}

export function handleStableDebtTokenInitialized(event: StableDebtTokenInitialized): void {
  let controllerAddress = event.params.incentivesController.toHexString();
  if (controllerAddress == ADDRESS_ZERO) {
    return;
  }

  let lendingPool = event.params.pool.toHexString();
  getOrCreateIncentivesController(event, controllerAddress, lendingPool);
}
