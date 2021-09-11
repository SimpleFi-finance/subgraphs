import { Address, BigInt, log } from "@graphprotocol/graph-ts";

import {
  MasterChefV2,
  LogPoolAddition,
  Deposit,
  LogUpdatePool,
} from "../../generated/MasterChefV2/MasterChefV2";

import { IRewarder } from "../../generated/MasterChefV2/IRewarder";

import {
  SushiFarm,
  SushiFarmSnapshot,
  FarmDeposit,
  UserInfo,
  Market,
  Account,
  Token,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  TokenBalance,
  ADDRESS_ZERO,
} from "../library/common";

import { ProtocolName, ProtocolType } from "../library/constants";

let oneE12: BigInt = BigInt.fromI32(10).pow(12);

/**
 *
 * @param event
 */
export function handleLogPoolAddition(event: LogPoolAddition): void {
  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(event.params.pid.toString());
  sushiFarm.masterChef = event.address.toHexString();
  sushiFarm.rewarder = event.params.rewarder.toHexString();
  sushiFarm.allocPoint = event.params.allocPoint;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, event.params.lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardBlock = BigInt.fromI32(0);
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // create market representing the farm
  let marketId = sushiFarm.masterChef.concat("-").concat(sushiFarm.id);
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];

  let rewardTokens: Token[] = getRewardTokens(sushiFarm);

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    null,
    rewardTokens
  );
}

/**
 *
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let sushiFarm = SushiFarm.load(event.params.pid.toHexString());
  let sender = getOrCreateAccount(event.params.user);
  let receiver = getOrCreateAccount(event.params.to);
  let amount = event.params.amount;

  // save new deposit entity
  let deposit = new FarmDeposit(
    event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.logIndex.toHexString())
  );
  deposit.sushiFarm = sushiFarm.id;
  deposit.depositer = sender.id;
  deposit.depositReceiver = receiver.id;
  deposit.amount = amount;
  deposit.save();

  // don't update user's position for 0 value deposit
  if (deposit.amount == BigInt.fromI32(0)) {
    return;
  }

  ////// update user's position
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;

  let userInfo = getOrCreateUserInfo(receiver.id, sushiFarm.id);
  userInfo.amount = userInfo.amount.plus(amount);
  userInfo.rewardDebt = userInfo.rewardDebt.plus(
    amount.times(sushiFarm.accSushiPerShare).div(oneE12)
  );
  userInfo.save();

  let outputTokenAmount = amount;
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, masterChef, amount)];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, masterChef, userInfo.amount));

  // reward token amounts (CRV + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, receiver, rewardTokenBalances, market);

  investInMarket(
    event,
    receiver,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

/**
 *
 * @param event
 */
export function handleLogUpdatePool(event: LogUpdatePool) {
  let sushiFarm = SushiFarm.load(event.params.pid.toHexString());

  // create farm snapshot
  let snapshotId = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(event.logIndex.toHexString());
  let farmSnapshot = new SushiFarmSnapshot(snapshotId);
  farmSnapshot.sushiFarm = sushiFarm.id;
  farmSnapshot.allocPoint = sushiFarm.allocPoint;
  farmSnapshot.totalSupply = sushiFarm.totalSupply;
  farmSnapshot.timestamp = event.block.timestamp;
  farmSnapshot.transactionHash = event.transaction.hash.toHexString();
  farmSnapshot.transactionIndexInBlock = event.transaction.index;
  farmSnapshot.blockNumber = event.block.number;
  farmSnapshot.logIndex = event.logIndex;
  farmSnapshot.save();

  // update sushifarm
  sushiFarm.lastRewardBlock = event.params.lastRewardBlock;
  sushiFarm.totalSupply = event.params.lpSupply;
  sushiFarm.accSushiPerShare = event.params.accSushiPerShare;
  sushiFarm.save();

  // update market
  let masterChef = event.address.toHexString();
  let market = Market.load(masterChef.concat("-").concat(sushiFarm.id)) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );
}

/**
 * Get reward tokens of a pool by fetching sushi token address and additionally fetch
 * extra reward tokens by calling pendingTokens function of rewarder contract
 * @param sushiFarm
 * @returns
 */
function getRewardTokens(sushiFarm: SushiFarm): Token[] {
  let tokens: Token[] = [];
  let masterChef = MasterChefV2.bind(Address.fromString(sushiFarm.masterChef));

  // get sushi address
  let sushiToken = masterChef.try_SUSHI();
  if (!sushiToken.reverted) {
    tokens.push(new Token(sushiToken.value.toHexString()));
  }

  // get extra reward tokens
  let rewarder = IRewarder.bind(Address.fromString(sushiFarm.rewarder));
  let result = rewarder.try_pendingTokens(
    BigInt.fromI32(0),
    Address.fromString(ADDRESS_ZERO),
    BigInt.fromI32(0)
  );
  if (!result.reverted) {
    let extraRewardTokens: Address[] = result.value.value0;
    for (let i: i32 = 0; i < extraRewardTokens.length; i++) {
      tokens.push(new Token(extraRewardTokens[i].toHexString()));
    }
  }

  return tokens;
}

/**
 * Create UserInfo entity
 * @param user
 * @param farmPid
 * @returns
 */
function getOrCreateUserInfo(user: string, farmPid: string): UserInfo {
  let id = user.concat("-").concat(farmPid);
  let userInfo = UserInfo.load(id) as UserInfo;

  if (userInfo == null) {
    userInfo = new UserInfo(id);
    userInfo.amount = BigInt.fromI32(0);
    userInfo.rewardDebt = BigInt.fromI32(0);
  }

  return userInfo;
}

function collectRewardTokenBalances(
  sushiFarm: SushiFarm,
  receiver: Account,
  rewardTokenBalances: TokenBalance[],
  market: Market
) {
  // fetch claimable amount of sushi
  // fetch claimable a
}
