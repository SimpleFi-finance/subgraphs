import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  MasterChef,
  AddCall,
  Deposit,
  Withdraw,
  EmergencyWithdraw,
  SetCall,
  UpdatePoolCall,
} from "../../generated/MasterChef/MasterChef";

import {
  SushiFarm,
  FarmDeposit,
  FarmWithdrawal,
  Market,
  Token,
  MasterChef as MasterChefEntity,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "../library/common";

import { getOrCreateUserInfo } from "../library/masterChefUtils";

import { ProtocolName, ProtocolType } from "../library/constants";

// hard-coded as in contract
let ACC_SUSHI_PRECISION: BigInt = BigInt.fromI32(10).pow(12);

/**
 *
 * @param call
 */
export function handleAdd(call: AddCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity;

  // "fake" event containing block info
  let event = new ethereum.Event();
  event.block = call.block;

  // create MasterChef entity and store Sushi token address
  if (masterChef == null) {
    masterChef = new MasterChefEntity(call.to.toHexString());
    masterChef.version = BigInt.fromI32(1);

    // get sushi address, store it and start indexer if needed
    let masterChefContract = MasterChef.bind(call.to);
    let sushi = masterChefContract.sushi();

    // initialize other params
    let sushiToken = getOrCreateERC20Token(event, sushi);
    masterChef.sushi = sushiToken.id;
    masterChef.numberOfFarms = BigInt.fromI32(0);
    masterChef.totalAllocPoint = BigInt.fromI32(0);
    masterChef.sushiPerBlock = masterChefContract.sushiPerBlock();
    masterChef.bonusEndBlock = masterChefContract.bonusEndBlock();
    masterChef.bonusMultiplier = masterChefContract.BONUS_MULTIPLIER();
    masterChef.save();
  }

  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(masterChef.id + "-" + masterChef.numberOfFarms.toString());
  sushiFarm.farmPid = masterChef.numberOfFarms;
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.allocPoint = call.inputs._allocPoint;
  sushiFarm.created = call.block.timestamp;
  sushiFarm.createdAtBlock = call.block.number;
  sushiFarm.createdAtTransaction = call.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, call.inputs._lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardBlock = call.block.number;
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // update all farms reward variables
  if (call.inputs._withUpdate) {
    massUpdateFarms(masterChef, call.block);
  }

  // numberOfFarms++
  masterChef.numberOfFarms = masterChef.numberOfFarms.plus(BigInt.fromI32(1));
  masterChef.totalAllocPoint = masterChef.totalAllocPoint.plus(sushiFarm.allocPoint);
  masterChef.save();

  // create market representing the farm
  let marketId = sushiFarm.id;
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];
  let rewardTokens: Token[] = [getOrCreateERC20Token(event, Address.fromString(masterChef.sushi))];

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
 * User deposits his LP tokens to farm and gets pending Sushi reward
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let user = getOrCreateAccount(event.params.user);
  let amount = event.params.amount;

  // update farm/pool reward variables
  updateFarm(sushiFarm, event.block);

  // save new deposit entity
  let deposit = new FarmDeposit(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  deposit.transactionHash = event.transaction.hash.toHexString();
  deposit.sushiFarm = sushiFarm.id;
  deposit.depositer = user.id;
  deposit.amount = amount;
  deposit.save();

  // calculate harvested Sushi amount
  let userInfo = getOrCreateUserInfo(user.id, sushiFarm.id);
  let harvestedSushi = userInfo.amount
    .times(sushiFarm.accSushiPerShare)
    .div(ACC_SUSHI_PRECISION)
    .minus(userInfo.rewardDebt);

  // increase user's balance of provided LP tokens and amount of rewards entitled to user
  userInfo.amount = userInfo.amount.plus(amount);
  userInfo.rewardDebt = userInfo.amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION);
  userInfo.save();

  ////// update market LP supply

  // update sushifarm
  sushiFarm.totalSupply = sushiFarm.totalSupply.plus(amount);
  sushiFarm.save();

  // update market
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );

  ////// update user's position

  // sushi farms don't have output token
  let outputTokenAmount = BigInt.fromI32(0);

  // user deposited `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of Sushi tokens user received in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], user.id, harvestedSushi));

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, user.id, userInfo.amount));

  // Sushi amount claimable by user - at this point it is 0 as all the pending reward Sushi has just
  // been transferred to user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, BigInt.fromI32(0)),
  ];

  investInMarket(
    event,
    user,
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
 * In Withdraw user gets his LP tokens back from farm and pending Sushi rewards
 * @param event
 * @returns
 */
export function handleWithdraw(event: Withdraw): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let user = getOrCreateAccount(event.params.user);
  let amount = event.params.amount;

  // update farm/pool reward variables
  updateFarm(sushiFarm, event.block);

  // save new withdrawal entity
  let withdrawal = new FarmWithdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.transactionHash = event.transaction.hash.toHexString();
  withdrawal.sushiFarm = sushiFarm.id;
  withdrawal.withdrawer = user.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // calculate harvested Sushi amount
  let userInfo = getOrCreateUserInfo(user.id, sushiFarm.id);
  let harvestedSushi = userInfo.amount
    .times(sushiFarm.accSushiPerShare)
    .div(ACC_SUSHI_PRECISION)
    .minus(userInfo.rewardDebt);

  // decrease user's balance of provided LP tokens and amount of rewards entitled to user
  userInfo.amount = userInfo.amount.minus(amount);
  userInfo.rewardDebt = userInfo.amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION);
  userInfo.save();

  ////// update market LP supply

  // update sushifarm
  sushiFarm.totalSupply = sushiFarm.totalSupply.minus(amount);
  sushiFarm.save();

  // update market
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );

  ////// update user's position

  // sushi farms don't have output token
  let outputTokenAmount = BigInt.fromI32(0);

  // user received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], user.id, harvestedSushi));

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by withdrawer
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, user.id, userInfo.amount));

  // Sushi amount claimable by user - at this point it is 0 as all the pending reward Sushi has just
  // been transferred to user
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, BigInt.fromI32(0)),
  ];

  redeemFromMarket(
    event,
    user,
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
 * In EmergencyWithdraw user gets his LP tokens back from farm, but no rewards.
 * @param event
 * @returns
 */
export function handleEmergencyWithdraw(event: EmergencyWithdraw): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let user = getOrCreateAccount(event.params.user);
  let amount = event.params.amount;

  // save new withdrawal entity
  let withdrawal = new FarmWithdrawal(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  withdrawal.transactionHash = event.transaction.hash.toHexString();
  withdrawal.sushiFarm = sushiFarm.id;
  withdrawal.withdrawer = user.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // LP token balance and claimable rewards are resetted to 0 in EmergencyWithdraw
  let userInfo = getOrCreateUserInfo(user.id, sushiFarm.id);
  userInfo.amount = BigInt.fromI32(0);
  userInfo.rewardDebt = BigInt.fromI32(0);
  userInfo.save();

  ////// update market LP supply

  // update sushifarm
  sushiFarm.totalSupply = sushiFarm.totalSupply.minus(amount);
  sushiFarm.save();

  // update market
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    BigInt.fromI32(0)
  );

  ////// update user's position

  // no output token in sushi farms
  let outputTokenAmount = BigInt.fromI32(0);

  // user received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of farm ownership tokens owned by user - 0 because sushi farms don't have token
  let outputTokenBalance = BigInt.fromI32(0);

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, user.id, userInfo.amount));

  // Sushi amount claimable by user - at this point it is 0 because of emergency withdrawal
  let rewardTokens = market.rewardTokens as string[];
  let rewardTokenBalances: TokenBalance[] = [
    new TokenBalance(rewardTokens[0], user.id, BigInt.fromI32(0)),
  ];

  redeemFromMarket(
    event,
    user,
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
 * Updates farm/pool reward variables
 * @param event
 */
export function handleUpdatePool(call: UpdatePoolCall): void {
  let masterChef = call.to.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + call.inputs._pid.toString()) as SushiFarm;
  updateFarm(sushiFarm, call.block);
}

/**
 * Updates farm's allocPoint and potentially the rewarder contract.
 * @param event
 */
export function handleSetPool(call: SetCall): void {
  let masterChef = call.to.toHexString();
  let masterChefEntity = MasterChefEntity.load(masterChef) as MasterChefEntity;
  let sushiFarm = SushiFarm.load(masterChef + "-" + call.inputs._pid.toString()) as SushiFarm;

  // update all farms
  if (call.inputs._withUpdate) {
    massUpdateFarms(masterChefEntity, call.block);
  }

  // update totalalloc of MasterChef
  masterChefEntity.totalAllocPoint = masterChefEntity.totalAllocPoint
    .minus(sushiFarm.allocPoint)
    .plus(call.inputs._allocPoint);
  masterChefEntity.save();

  // update sushifarm
  sushiFarm.allocPoint = call.inputs._allocPoint;
  sushiFarm.save();
}

/**
 * Update reward variables of the given pool to be up-to-date.
 * Implementation loosely copied from MasterChef's `updatePool` function.
 * @param sushiFarm
 * @param event
 * @returns
 */
function updateFarm(sushiFarm: SushiFarm, block: ethereum.Block): void {
  let masterChef = MasterChefEntity.load(sushiFarm.masterChef) as MasterChefEntity;

  if (block.number.le(sushiFarm.lastRewardBlock)) {
    return;
  }

  if (sushiFarm.totalSupply == BigInt.fromI32(0)) {
    sushiFarm.lastRewardBlock = block.number;
    sushiFarm.save();
    return;
  }

  let multiplier = getMultiplier(masterChef, sushiFarm.lastRewardBlock, block.number);
  let sushiReward = multiplier
    .times(masterChef.sushiPerBlock)
    .times(sushiFarm.allocPoint)
    .div(masterChef.totalAllocPoint);
  sushiFarm.accSushiPerShare = sushiFarm.accSushiPerShare.plus(
    sushiReward.times(ACC_SUSHI_PRECISION).div(sushiFarm.totalSupply)
  );
  sushiFarm.lastRewardBlock = block.number;
  sushiFarm.save();
}

/**
 * Return reward multiplier over the given _from to _to block.
 * Implementation loosely copied from MasterChef contract.
 * @param masterChefAdress
 * @param from
 * @param to
 * @returns
 */
function getMultiplier(masterChef: MasterChefEntity, from: BigInt, to: BigInt): BigInt {
  if (to.le(masterChef.bonusEndBlock as BigInt)) {
    return to.minus(from).times(masterChef.bonusMultiplier as BigInt);
  } else if (from.ge(masterChef.bonusEndBlock as BigInt)) {
    return to.minus(from);
  } else {
    return masterChef.bonusEndBlock
      .minus(from)
      .times(masterChef.bonusMultiplier as BigInt)
      .plus(to.minus(masterChef.bonusEndBlock as BigInt));
  }
}

/**
 * Update reward variables for all pools
 * @param masterChef
 * @param block
 */
function massUpdateFarms(masterChef: MasterChefEntity, block: ethereum.Block): void {
  let length = masterChef.numberOfFarms.toI32();
  for (let pid: i32 = 0; pid < length; ++pid) {
    let sushiFarm = SushiFarm.load(masterChef.id + "-" + pid.toString()) as SushiFarm;
    updateFarm(sushiFarm, block);
  }
}
