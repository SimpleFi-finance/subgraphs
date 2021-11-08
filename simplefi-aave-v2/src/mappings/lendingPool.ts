import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  Borrow,
  InitReserveCall,
  ReserveDataUpdated,
} from "../../generated/templates/LendingPool/LendingPool";
import {
  Deposit as DepositEntity,
  Borrow as BorrowEntity,
  Withdrawal,
  Reserve,
  Token,
  Market,
  UserBalance,
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
import { getOrCreateUserBalance, getReserveNormalizedIncome } from "../library/lendingPoolUtils";

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
  let userBalance = getOrCreateUserBalance(deposit.onBehalfOf, reserveId);
  userBalance.reserve = reserveId;
  userBalance.providedTokenAmount = userBalance.providedTokenAmount.plus(deposit.amount);
  userBalance.outputTokenAmount = userBalance.outputTokenAmount.plus(deposit.amount);
  userBalance.save();

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
  let outputTokenBalance = userBalance.outputTokenAmount;

  // inputTokenBalance -> number of tokens that can be redeemed by aToken receiver
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(reserve.toHexString(), deposit.onBehalfOf, userBalance.outputTokenAmount)
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
  let userBalance = getOrCreateUserBalance(withdrawal.user, reserveId);
  userBalance.reserve = reserveId;
  userBalance.providedTokenAmount = userBalance.providedTokenAmount.minus(withdrawal.amount);
  userBalance.outputTokenAmount = userBalance.outputTokenAmount.minus(withdrawal.amount);
  userBalance.save();

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
  let outputTokenBalance = userBalance.outputTokenAmount;

  // inputTokenBalance -> number of reserve tokens that can be redeemed by withdrawer
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(reserve.toHexString(), withdrawal.user, userBalance.outputTokenAmount)
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
  borrow.save();

  // increase user's balance of provided tokens
  let reserveId = event.transaction.hash.toHexString() + "-" + event.params.reserve.toHexString();
  let userBalance = getOrCreateUserBalance(borrow.user, reserveId);

  ////// update user's position

  let market = Market.load(event.address.toHexString() + "-" + borrow.reserve) as Market;

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
  let outputTokenBalance = userBalance.outputTokenAmount;

  // total amount of debt taken by user in this reserve token
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(borrow.reserve, borrow.user, userBalance.providedTokenAmount)
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

  let reserve = new Reserve(call.to.toHexString() + "-" + asset.id);
  reserve.lendingPool = call.to.toHexString();
  reserve.asset = asset.id;
  reserve.aToken = aToken.id;
  reserve.lastUpdateTimestamp = call.block.timestamp;
  reserve.liquidityIndex = BigInt.fromI32(0);
  reserve.liquidityRate = BigInt.fromI32(0);
  reserve.save();

  // create market representing the farm
  let marketId = reserve.id;
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
}

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let reserveId = event.address.toHexString() + "-" + event.params.reserve.toHexString();
  let reserve = Reserve.load(reserveId) as Reserve;

  reserve.liquidityRate = event.params.liquidityRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.lastUpdateTimestamp = event.block.timestamp;

  reserve.save();
}
