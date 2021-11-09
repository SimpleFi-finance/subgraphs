import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  Borrow,
  InitReserveCall,
  ReserveDataUpdated,
  LendingPool as LendingPoolContract,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Borrow as BorrowEntity,
  Withdrawal,
  Reserve,
  Token,
  Market,
  UserInvestmentBalance,
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
  TokenBalance,
  ADDRESS_ZERO,
  getOrCreateMarket,
} from "../library/common";

import { calculateGrowth } from "../library/math";
import {
  getOrCreateUserInvestmentBalance,
  getOrCreateUserDebtBalance,
  getReserveNormalizedIncome,
} from "../library/lendingPoolUtils";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const BORROW_MODE_STABLE = 1;
const BORROW_MODE_VARIABLE = 2;

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

  // increase user's balance of provided tokens
  let reserveId = event.transaction.hash.toHexString() + "-" + reserve.toHexString();
  let userInvestmentBalance = getOrCreateUserInvestmentBalance(deposit.onBehalfOf, reserveId);
  userInvestmentBalance.reserve = reserveId;
  userInvestmentBalance.providedTokenAmount = userInvestmentBalance.providedTokenAmount.plus(
    deposit.amount
  );
  userInvestmentBalance.outputTokenAmount = userInvestmentBalance.outputTokenAmount.plus(
    deposit.amount
  );
  userInvestmentBalance.save();

  ////// update user's position

  let market = Market.load(event.address.toHexString() + "-" + deposit.reserve) as Market;

  // depositer (msg.sender)
  let account = getOrCreateAccount(Address.fromString(deposit.user));

  // amount of aTokens moved
  let outputTokenAmount = deposit.amount;

  // amount of reserve asset tokens moved
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(deposit.reserve, account.id, deposit.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided token amounts
  let outputTokenBalance = userInvestmentBalance.outputTokenAmount;

  // inputTokenBalance -> number of tokens that can be redeemed by aToken receiver
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(
      reserve.toHexString(),
      deposit.onBehalfOf,
      userInvestmentBalance.outputTokenAmount
    )
  );

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
  let amount = event.params.amount;
  let to = event.params.to;
  let reserve = event.params.reserve;
  let user = event.params.user;

  // create withdrawal entity
  let withdrawal = new Withdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.amount = amount;
  withdrawal.to = to.toHexString();
  withdrawal.reserve = reserve.toHexString();
  withdrawal.user = user.toHexString();
  withdrawal.save();

  // decrease user's balance of provided tokens
  let reserveId = event.transaction.hash.toHexString() + "-" + reserve.toHexString();
  let UserInvestmentBalance = getOrCreateUserInvestmentBalance(withdrawal.user, reserveId);
  UserInvestmentBalance.reserve = reserveId;
  UserInvestmentBalance.providedTokenAmount = UserInvestmentBalance.providedTokenAmount.minus(
    withdrawal.amount
  );
  UserInvestmentBalance.outputTokenAmount = UserInvestmentBalance.outputTokenAmount.minus(
    withdrawal.amount
  );
  UserInvestmentBalance.save();

  ////// update user's position

  let market = Market.load(event.address.toHexString() + "-" + withdrawal.reserve) as Market;

  // withdrawer (msg.sender)
  let account = getOrCreateAccount(Address.fromString(withdrawal.user));

  // amount of aTokens moved
  let outputTokenAmount = withdrawal.amount;

  // withdraw receiver received `amount` of reserve tokens
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(withdrawal.reserve, withdrawal.to, withdrawal.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided token amounts
  let outputTokenBalance = UserInvestmentBalance.outputTokenAmount;

  // inputTokenBalance -> number of reserve tokens that can be redeemed by withdrawer
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(
      reserve.toHexString(),
      withdrawal.user,
      UserInvestmentBalance.outputTokenAmount
    )
  );

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
  let userDebtBalance = getOrCreateUserDebtBalance(borrow.user, marketId, reserve.id);
  userDebtBalance.debtTakenAmount = userDebtBalance.debtTakenAmount.plus(borrow.amount);

  let contract = LendingPoolContract.bind(event.address);
  let userData = contract.getUserAccountData(Address.fromString(borrow.user));
  // TODO - this is not really correct as we store total collateral when it should be
  // only collateral locked for single reserve asset
  userDebtBalance.totalCollateralInETH = userData.value0;
  userDebtBalance.save();

  ////// update user's position

  let market = Market.load(marketId) as Market;

  // borower (msg.sender)
  let account = getOrCreateAccount(Address.fromString(borrow.user));

  // no aTokens moved
  let outputTokenAmount = BigInt.fromI32(0);

  // amount of reserve asset tokens borrowed
  let inputTokensAmount: TokenBalance[] = [
    new TokenBalance(borrow.reserve, borrow.user, borrow.amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total balance of debt bearing tokens
  let outputTokenBalance = userDebtBalance.debtTakenAmount;

  // amount of collateral locked as result of debt taken in this reserve
  let inputTokenBalances: TokenBalance[] = [];
  let inputTokens = market.inputTokens as string[];
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

export function handleInitReserveCall(call: InitReserveCall): void {
  let event = new ethereum.Event();
  event.block = call.block;

  let asset = getOrCreateERC20Token(event, call.inputs.asset);
  let aToken = getOrCreateERC20Token(event, call.inputs.aTokenAddress);
  let stableDebtToken = getOrCreateERC20Token(event, call.inputs.stableDebtAddress);
  let variableDebtToken = getOrCreateERC20Token(event, call.inputs.variableDebtAddress);
  let weth = getOrCreateERC20Token(event, Address.fromString(WETH));

  // fetch and store reserve data
  let reserve = new Reserve(call.to.toHexString() + "-" + asset.id);
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

  // create stable debt market representing the debt taken in reserve asset
  marketId = call.to.toHexString() + "-" + stableDebtToken.id;
  inputTokens = [weth];
  outputTokens = stableDebtToken;

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

  // create variable debt market representing the debt taken in reserve asset
  marketId = call.to.toHexString() + "-" + variableDebtToken.id;
  inputTokens = [weth];
  outputTokens = variableDebtToken;

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

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let reserveId = event.address.toHexString() + "-" + event.params.reserve.toHexString();
  let reserve = Reserve.load(reserveId) as Reserve;

  reserve.liquidityRate = event.params.liquidityRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.lastUpdateTimestamp = event.block.timestamp;

  reserve.save();
}
