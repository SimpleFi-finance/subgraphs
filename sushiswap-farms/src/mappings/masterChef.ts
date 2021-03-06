import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  MasterChef,
  AddCall,
  Deposit,
  Withdraw,
  EmergencyWithdraw,
  SetCall,
  UpdatePoolCall,
  MigrateCall,
  MassUpdatePoolsCall,
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
 * Call handler for creation of new SushiFarm
 * @param call
 */
export function handleAdd(call: AddCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString());

  // "fake" event containing block info
  let event = new ethereum.Event();
  event.block = call.block;
  event.transaction = call.transaction;

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

  // update all farms reward variables
  if (call.inputs._withUpdate) {
    massUpdateFarms(masterChef as MasterChefEntity, call.block);
  }

  // create SushiFarm entity
  let farmId = masterChef.id + "-" + masterChef.numberOfFarms.toString();
  let sushiFarm = getOrCreateSushiFarm(masterChef as MasterChefEntity, call, event, farmId);

  if (sushiFarm != null) {
    // numberOfFarms++
    masterChef.numberOfFarms = masterChef.numberOfFarms.plus(BigInt.fromI32(1));
    masterChef.totalAllocPoint = masterChef.totalAllocPoint.plus(sushiFarm.allocPoint);
    masterChef.save();
  }
}

/**
 * User deposits his LP tokens to farm and gets pending Sushi reward
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity;
  let farmId = masterChef.id + "-" + event.params.pid.toString();
  let sushiFarm = getOrCreateSushiFarm(masterChef, null, event, farmId);
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

  // update market LP supply
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef.id, sushiFarm.totalSupply)],
    sushiFarm.totalSupply
  );

  ////// update user's position

  // sushi farms don't have output token, but keep track of provided LP token amounts
  let outputTokenAmount = amount;

  // user deposited `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of Sushi tokens user received in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], user.id, harvestedSushi));

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

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
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity;
  let farmId = masterChef.id + "-" + event.params.pid.toString();
  let sushiFarm = getOrCreateSushiFarm(masterChef, null, event, farmId);
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
    [new TokenBalance(sushiFarm.lpToken, masterChef.id, sushiFarm.totalSupply)],
    sushiFarm.totalSupply
  );

  ////// update user's position

  // sushi farms don't have output token, but keep track of provided LP token amounts
  let outputTokenAmount = amount;

  // user received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], user.id, harvestedSushi));

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

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
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity;
  let farmId = masterChef.id + "-" + event.params.pid.toString();
  let sushiFarm = getOrCreateSushiFarm(masterChef, null, event, farmId);
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
    [new TokenBalance(sushiFarm.lpToken, masterChef.id, sushiFarm.totalSupply)],
    sushiFarm.totalSupply
  );

  ////// update user's position

  // user withdrew `amount` of LP tokens
  let outputTokenAmount = amount;

  // user received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [new TokenBalance(sushiFarm.lpToken, user.id, amount)];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

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
 * Updates farm's allocPoint
 * @param event
 */
export function handleSet(call: SetCall): void {
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
 * When LP token of farm is migrated use contract call to MasterChef to fetch and store new LP token.
 * @param call
 */
export function handleMigrate(call: MigrateCall): void {
  let masterChef = call.to.toHexString();
  let sushiFarmPid = call.inputs._pid;
  let sushiFarm = SushiFarm.load(masterChef + "-" + sushiFarmPid.toString()) as SushiFarm;

  let masterChefContract = MasterChef.bind(Address.fromString(sushiFarm.masterChef));
  let poolInfo = masterChefContract.try_poolInfo(sushiFarmPid);

  if (!poolInfo.reverted) {
    let newLpToken = poolInfo.value.value0;

    // create "fake" event so it can be passed to `getOrCreateERC20Token`
    let fakeEvent = new ethereum.Event();
    fakeEvent.block = call.block;
    let transaction = new ethereum.Transaction();
    transaction.hash = call.block.hash;
    fakeEvent.transaction = transaction;
    fakeEvent.logIndex = call.block.number;

    // save new LP token
    sushiFarm.lpToken = getOrCreateERC20Token(fakeEvent, newLpToken).id;
    sushiFarm.save();

    // update market with LP token (balance stays the same)
    let market = Market.load(sushiFarm.id) as Market;
    let newTokenInputBalances: TokenBalance[] = [
      new TokenBalance(sushiFarm.lpToken, sushiFarm.masterChef, sushiFarm.totalSupply),
    ];

    market.inputTokens = [sushiFarm.lpToken];
    market.save();

    updateMarket(fakeEvent, market, newTokenInputBalances, market.outputTokenTotalSupply);
  }
}

/**
 * Update reward variables of each farm
 * @param call
 */
export function handleMassUpdatePools(call: MassUpdatePoolsCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity;
  massUpdateFarms(masterChef, call.block);
}

/**
 * Update reward variables of the given pool to be up-to-date.
 *
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

/**
 * Fetch existing farm, or create a new one if it doesn't exist. Additionally create new market
 * representing trhe farm and update MasterChef entity.
 * @param masterChef
 * @param call
 * @param event
 * @returns
 */
function getOrCreateSushiFarm(
  masterChef: MasterChefEntity,
  call: AddCall,
  event: ethereum.Event,
  farmId: string
): SushiFarm {
  // load and return it if exists
  let sushiFarm = SushiFarm.load(farmId);
  if (sushiFarm != null) {
    return sushiFarm as SushiFarm;
  }

  // check if farm really exists in MasterChef's storage
  let masterChefContract = MasterChef.bind(Address.fromString(masterChef.id));
  let poolInfo = masterChefContract.try_poolInfo(masterChef.numberOfFarms);
  if (poolInfo.reverted) {
    return null;
  }

  // create new SushiFarm entity
  sushiFarm = new SushiFarm(farmId);
  sushiFarm.farmPid = masterChef.numberOfFarms;
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  sushiFarm.lastRewardBlock = event.block.number;
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);

  let inputToken: Token = null;
  if (call != null) {
    // `call` is provided when AddCall handler creates new farm
    // in that case use the call params to fill entity
    inputToken = getOrCreateERC20Token(event, call.inputs._lpToken);
    sushiFarm.lpToken = inputToken.id;
    sushiFarm.allocPoint = call.inputs._allocPoint;
  } else {
    // `call` is not provided in edge cases where deposit/withdraw handler is called before the farm entity exists
    // in that case use MasterChef contract calls to fetch LP token and allocPoint
    inputToken = getOrCreateERC20Token(event, poolInfo.value.value0);
    sushiFarm.lpToken = inputToken.id;
    sushiFarm.allocPoint = poolInfo.value.value1;
  }

  sushiFarm.save();

  // create market representing the farm
  let marketId = sushiFarm.id;
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.LP_FARMING;
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

  return sushiFarm as SushiFarm;
}
