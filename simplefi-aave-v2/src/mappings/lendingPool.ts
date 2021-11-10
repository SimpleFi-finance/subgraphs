import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  Borrow,
  Repay,
  Swap,
  InitReserveCall,
  ReserveDataUpdated,
  LendingPool as LendingPoolContract,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Borrow as BorrowEntity,
  Repay as RepayEntity,
  Withdrawal,
  Reserve,
  Token,
  Market,
  SwapRateMode,
} from "../../generated/schema";

import { ProtocolName, ProtocolType } from "../library/constants";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  borrowFromMarket,
  redeemFromMarket,
  repayToMarket,
  TokenBalance,
  ADDRESS_ZERO,
  getOrCreateMarket,
} from "../library/common";

import { calculateGrowth } from "../library/math";
import {
  getOrCreateUserInvestmentBalance,
  getOrCreateUserDebtBalance,
  getReserveNormalizedIncome,
  getUserATokenBalance,
  getMarketATokenSupply,
} from "../library/lendingPoolUtils";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
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
  let userInvestmentBalance = getOrCreateUserInvestmentBalance(deposit.onBehalfOf, deposit.reserve);
  userInvestmentBalance.underlyingTokenProvidedAmount = userInvestmentBalance.underlyingTokenProvidedAmount.plus(
    deposit.amount
  );
  userInvestmentBalance.save();

  // update market total supply
  let market = Market.load(event.address.toHexString() + "-" + deposit.reserve) as Market;
  let oldTotalSupply = getMarketATokenSupply(market, deposit.reserve, event);
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
  let userInvestmentBalance = getOrCreateUserInvestmentBalance(withdrawal.user, withdrawal.reserve);
  userInvestmentBalance.underlyingTokenProvidedAmount = userInvestmentBalance.underlyingTokenProvidedAmount.minus(
    withdrawal.amount
  );
  userInvestmentBalance.save();

  // update market total supply
  let market = Market.load(event.address.toHexString() + "-" + withdrawal.reserve) as Market;
  let oldTotalSupply = getMarketATokenSupply(market, withdrawal.reserve, event);
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
  let borrow = new BorrowEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );

  borrow.amount = event.params.amount;
  borrow.onBehalfOf = event.params.onBehalfOf.toHexString();
  borrow.reserve = event.params.reserve.toHexString();
  borrow.user = event.params.user.toHexString();
  borrow.borrowRateMode = event.params.borrowRateMode;
  borrow.save();

  // fetch market based on borrow mode
  let reserve = Reserve.load(borrow.reserve) as Reserve;
  let marketId: string;
  if (borrow.borrowRateMode == BigInt.fromI32(BORROW_MODE_STABLE)) {
    marketId = event.address.toHexString() + "-" + reserve.stableDebtToken;
  } else if (borrow.borrowRateMode == BigInt.fromI32(BORROW_MODE_VARIABLE)) {
    marketId = event.address.toHexString() + "-" + reserve.variableDebtToken;
  } else {
    // unrecognized borrow mode
    return;
  }

  // increase user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    borrow.user,
    marketId,
    reserve.id,
    borrow.borrowRateMode
  );
  userDebtBalance.debtTakenAmount = userDebtBalance.debtTakenAmount.plus(borrow.amount);

  let contract = LendingPoolContract.bind(event.address);
  let userData = contract.getUserAccountData(Address.fromString(borrow.user));
  // TODO - this is not really correct as we store total collateral when it should be
  // only collateral locked for this specific reserve asset
  userDebtBalance.totalCollateralInETH = userData.value0;
  userDebtBalance.save();

  ////// update user's position

  let market = Market.load(marketId) as Market;

  // borower (msg.sender)
  let account = getOrCreateAccount(Address.fromString(borrow.user));

  // amount of debt bearing tokens minted
  let outputTokenAmount = borrow.amount;

  // amount of collateral locked because of this payment
  let inputTokens = market.inputTokens as string[];
  // TODO - make bunch of calcs to deduce the actual amount
  let collateralAmountLocked = BigInt.fromI32(0);
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], borrow.user, collateralAmountLocked),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.debtTakenAmount;

  // amount of collateral locked as result of debt taken in this reserve
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], borrow.user, userDebtBalance.totalCollateralInETH)
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
  let repay = new RepayEntity(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );

  repay.amount = event.params.amount;
  repay.repayer = event.params.repayer.toHexString();
  repay.reserve = event.params.reserve.toHexString();
  repay.user = event.params.user.toHexString();
  repay.save();

  // fetch market based on borrow mode
  let reserve = Reserve.load(repay.reserve) as Reserve;
  // TODO - deduce if stable or variable debt repayment based on preceding ERC20 burn event
  let marketId = event.address.toHexString() + "-" + reserve.variableDebtToken;

  // decrease user's debt balance
  let userDebtBalance = getOrCreateUserDebtBalance(
    repay.repayer,
    marketId,
    reserve.id,
    BigInt.fromI32(BORROW_MODE_VARIABLE)
  );
  userDebtBalance.debtTakenAmount = userDebtBalance.debtTakenAmount.minus(repay.amount);

  let contract = LendingPoolContract.bind(event.address);
  let userData = contract.getUserAccountData(Address.fromString(repay.repayer));
  // TODO - this is not really correct as we store total collateral when it should be
  // only collateral locked for this specific reserve asset
  userDebtBalance.totalCollateralInETH = userData.value0;
  userDebtBalance.save();

  ////// update user's position

  let market = Market.load(marketId) as Market;

  // user for whom debt is being repayed (not neccessarily the sender)
  let account = getOrCreateAccount(Address.fromString(repay.repayer));

  // amount of debt bearing tokens burned
  let outputTokenAmount = repay.amount;

  // amount of collateral unlocked because of this payment
  let inputTokens = market.inputTokens as string[];
  // TODO - make bunch of calcs to deduce the actual amount
  let collateralAmountUnlocked = BigInt.fromI32(0);
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(inputTokens[0], repay.user, collateralAmountUnlocked),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.debtTakenAmount;

  // amount of collateral locked as result of debt taken in this reserve
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(inputTokens[0], repay.repayer, userDebtBalance.totalCollateralInETH)
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
  let swap = new SwapRateMode(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  swap.reserve = event.params.reserve.toHexString();
  swap.user = event.params.user.toHexString();
  swap.rateMode = event.params.rateMode;

  let reserve = Reserve.load(swap.reserve) as Reserve;
  let marketId: string;
  if (swap.rateMode == BigInt.fromI32(BORROW_MODE_STABLE)) {
    marketId = event.address.toHexString() + "-" + reserve.variableDebtToken;

    // load existing tracker
    let userDebtBalance = getOrCreateUserDebtBalance(
      swap.user,
      marketId,
      reserve.id,
      BigInt.fromI32(BORROW_MODE_VARIABLE)
    );

    // switch it to stable mode
    userDebtBalance.id = event.address.toHexString() + "-" + reserve.stableDebtToken;
    userDebtBalance.rateMode = BigInt.fromI32(BORROW_MODE_STABLE);
    userDebtBalance.save();

    // TODO update markets
  } else if (swap.rateMode == BigInt.fromI32(BORROW_MODE_VARIABLE)) {
    marketId = event.address.toHexString() + "-" + reserve.stableDebtToken;
    // load existing tracker
    let userDebtBalance = getOrCreateUserDebtBalance(
      swap.user,
      marketId,
      reserve.id,
      BigInt.fromI32(BORROW_MODE_STABLE)
    );
    // switch it to variable mode
    userDebtBalance.id = event.address.toHexString() + "-" + reserve.variableDebtToken;
    userDebtBalance.rateMode = BigInt.fromI32(BORROW_MODE_VARIABLE);
    userDebtBalance.save();

    // TODO update markets
  } else {
    // unrecognized borrow rate mode
    return;
  }
}

export function handleInitReserveCall(call: InitReserveCall): void {
  let event = new ethereum.Event();
  event.block = call.block;

  let asset = getOrCreateERC20Token(event, call.inputs.asset);
  let aToken = getOrCreateERC20Token(event, call.inputs.aTokenAddress);
  let stableDebtToken = getOrCreateERC20Token(event, call.inputs.stableDebtAddress);
  let variableDebtToken = getOrCreateERC20Token(event, call.inputs.variableDebtAddress);
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));

  // fetch and store reserve data
  let reserve = new Reserve(asset.id);
  reserve.lendingPool = call.to.toHexString();
  reserve.asset = asset.id;
  reserve.aToken = aToken.id;
  reserve.stableDebtToken = stableDebtToken.id;
  reserve.variableDebtToken = variableDebtToken.id;
  reserve.lastUpdateTimestamp = call.block.timestamp;
  reserve.liquidityIndex = BigInt.fromI32(0);
  reserve.liquidityRate = BigInt.fromI32(0);
  reserve.save();

  // create investment market representing the token-aToken pair
  let marketId = call.to.toHexString() + "-" + reserve.id;
  let marketAddress = call.to;
  let protocolName = ProtocolName.AAVE_POOL;
  let protocolType = ProtocolType.LENDING;
  let inputTokens: Token[] = [asset];
  let outputToken = aToken;
  let rewardTokens: Token[] = [];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // create stable debt market representing the debt taken in reserve asset
  marketId = call.to.toHexString() + "-" + stableDebtToken.id;
  inputTokens = [weth];
  outputToken = stableDebtToken;

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // create variable debt market representing the debt taken in reserve asset
  marketId = call.to.toHexString() + "-" + variableDebtToken.id;
  inputTokens = [weth];
  outputToken = variableDebtToken;

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );
}

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let reserveId = event.address.toHexString() + "-" + event.params.reserve.toHexString();
  let reserve = Reserve.load(reserveId) as Reserve;

  reserve.liquidityRate = event.params.liquidityRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.lastUpdateTimestamp = event.block.timestamp;

  reserve.save();
}
