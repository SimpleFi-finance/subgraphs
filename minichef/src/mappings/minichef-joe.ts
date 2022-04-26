import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import {
  MiniChef,
  Deposit,
  Withdraw,
  EmergencyWithdraw,
  Harvest,
  Add,
  UpdatePool,
  Set,
  UpdateEmissionRate,
} from "../../generated/MiniChef/MiniChef";

import { Transfer } from "../../generated/templates/RewardToken/IERC20";

import { IRewarder } from "../../generated/MiniChef/IRewarder";

import {
  SushiFarm,
  SushiFarmSnapshot,
  FarmDeposit,
  FarmWithdrawal,
  UserInfo,
  Market,
  Account,
  Token,
  SushiRewardTransfer,
  ExtraRewardTokenTransfer,
  MasterChef,
  Rewarder,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  ADDRESS_ZERO,
} from "../library/common";

import {
  collectRewardTokenBalances,
  getHarvestedRewards,
  getOrCreateUserInfo,
  getRewardTokens,
  isThereUnprocessedRewardTransfer,
} from "../library/masterChefUtils";

import { RewardToken } from "../../generated/templates";

import { ProtocolName, ProtocolType } from "../library/constants";

// hard-coded as in contract
let ACC_SUSHI_PRECISION: BigInt = BigInt.fromI32(10).pow(12);

/**
 * Handle creation of new Sushi farm.
 * @param event
 */
export function handleAdd(event: Add): void {
  let masterChef = MasterChef.load(event.address.toHexString());

  // create MasterChef entity and store Sushi token address
  if (masterChef == null) {
    masterChef = new MasterChef(event.address.toHexString());
    masterChef.version = BigInt.fromI32(2);

    // get sushi address, store it and start indexer if needed
    let masterChefContract = MiniChef.bind(event.address);
    let sushi = masterChefContract.joe();

    let token = Token.load(sushi.toHexString());
    if (token == null) {
      // start indexing SUSHI events
      RewardToken.create(sushi);
    }
    let sushiToken = getOrCreateERC20Token(event, sushi);
    masterChef.sushi = sushiToken.id;
    masterChef.numberOfFarms = BigInt.fromI32(0);
    masterChef.totalAllocPoint = BigInt.fromI32(0);
    masterChef.sushiPerSecond = masterChefContract.joePerSec();
    masterChef.save();
  }

  // create Rewarder entity
  let rewarderAddress = event.params.rewarder.toHexString();
  let rewarder = Rewarder.load(rewarderAddress);
  if (rewarder == null) {
    rewarder = new Rewarder(rewarderAddress);
    rewarder.save();
  }

  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(masterChef.id + "-" + event.params.pid.toString());
  sushiFarm.farmPid = event.params.pid;
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.rewarder = rewarder.id;
  sushiFarm.allocPoint = event.params.allocPoint;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, event.params.lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardTime = event.block.timestamp;
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // numberOfFarms++
  masterChef.numberOfFarms = masterChef.numberOfFarms.plus(BigInt.fromI32(1));
  masterChef.totalAllocPoint = masterChef.totalAllocPoint.plus(sushiFarm.allocPoint);
  masterChef.save();

  // create market representing the farm
  let marketId = sushiFarm.id;
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.TRADER_JOE_FARM;
  let protocolType = ProtocolType.LP_FARMING;
  let inputTokens: Token[] = [inputToken];
  let rewardTokens: Token[] = getRewardTokens(sushiFarm, event);

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
 * User deposits his LP tokens to farm. Receiver of deposit benefits doesn't have to necessarily be
 * account which triggered the Deposit.
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let user = getOrCreateAccount(event.params.user);
  let amount = event.params.amount;

  // save new deposit entity
  let deposit = new FarmDeposit(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString()
  );
  deposit.transactionHash = event.transaction.hash.toHexString();
  deposit.sushiFarm = sushiFarm.id;
  deposit.depositer = user.id;
  deposit.depositReceiver = user.id;
  deposit.amount = amount;
  deposit.save();

  // don't update user's position for 0 value deposit
  if (deposit.amount == BigInt.fromI32(0)) {
    return;
  }

  // increase user's balance of provided LP tokens and amount of rewards entitled to user
  let userInfo = getOrCreateUserInfo(deposit.depositReceiver, sushiFarm.id);
  userInfo.amount = userInfo.amount.plus(amount);
  userInfo.rewardDebt = userInfo.rewardDebt.plus(
    amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION)
  );
  userInfo.save();

  ////// update user's position

  let market = Market.load(sushiFarm.id) as Market;

  // sushi farms don't have output token, but keep track of provided LP token amounts
  let outputTokenAmount = amount;

  // user deposited `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, deposit.depositer, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, deposit.depositReceiver, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, user, rewardTokenBalances, market);

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
 * In Withdraw user gets his LP tokens back from farm and potentially rewards. Receiver doesn't have
 * to necessarily be account which triggered the Withdraw.
 * @param event
 * @returns
 */
export function handleWithdraw(event: Withdraw): void {
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
  withdrawal.withdrawalReceiver = user.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // don't update user's position for 0 value withdrawal
  if (withdrawal.amount == BigInt.fromI32(0)) {
    return;
  }

  let market = Market.load(sushiFarm.id) as Market;
  let userInfo = getOrCreateUserInfo(withdrawal.withdrawer, sushiFarm.id);

  // if there are preceding reward transfers then this event is part of WithdrawAndHarvest function,
  // otherwise it is part of just a Withdraw function
  if (isThereUnprocessedRewardTransfer(market, event)) {
    let accSushi = userInfo.amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION);
    userInfo.rewardDebt = accSushi.minus(
      amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION)
    );
    userInfo.amount = userInfo.amount.minus(amount);
  } else {
    // decrease user's balance of provided LP tokens and amount of rewards entitled to user
    userInfo.amount = userInfo.amount.minus(amount);
    userInfo.rewardDebt = userInfo.rewardDebt.minus(
      amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION)
    );
  }

  userInfo.save();

  ////// update user's position

  // sushi farms don't have output token, but keep track of provided LP token amounts
  let outputTokenAmount = amount;

  // withdrawalReceiver received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  getHarvestedRewards(event, market, rewardTokenAmounts);

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

  // inputTokenBalance -> number of LP tokens that can be redeemed by withdrawer
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawer, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, user, rewardTokenBalances, market);

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
 * In EmergencyWithdraw user gets his LP tokens back from farm, but no rewards. Receiver doesn't have
 * to necessarily be account which triggered the EmergencyWithdraw
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
  withdrawal.withdrawalReceiver = user.id;
  withdrawal.amount = amount;
  withdrawal.save();

  // don't update user's position for empty emergency withdrawal
  if (withdrawal.amount == BigInt.fromI32(0)) {
    return;
  }

  // LP token balance and claimable rewards are resetted to 0 in EmergencyWithdraw
  let userInfo = getOrCreateUserInfo(withdrawal.withdrawer, sushiFarm.id);
  userInfo.amount = BigInt.fromI32(0);
  userInfo.rewardDebt = BigInt.fromI32(0);
  userInfo.save();

  ////// update user's position

  let market = Market.load(sushiFarm.id) as Market;

  // sushi farms don't have output token, but keep track of provided LP token amounts
  let outputTokenAmount = amount;

  // withdrawalReceiver received `amount` LP tokens
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawalReceiver, amount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(sushiFarm.lpToken, withdrawal.withdrawer, userInfo.amount)
  );

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, user, rewardTokenBalances, market);

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
 * Harvest means claiming the Sushi rewards as well as other reward tokens. Receiver of the rewards
 * doesn't have to be necessarily user who triggered the harvest.
 * @param event
 * @returns
 */
export function handleHarvest(event: Harvest): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;
  let harvester = getOrCreateAccount(event.params.user);
  let harvestedSushiAmount = event.params.amount;

  // if there are no unprocessed reward transfers then don't do anything, as it means they were already
  // handled in handleWithdraw
  let market = Market.load(sushiFarm.id) as Market;
  if (!isThereUnprocessedRewardTransfer(market, event)) {
    return;
  }

  // don't update user's position for 0 value harvest
  if (harvestedSushiAmount == BigInt.fromI32(0)) {
    return;
  }

  // updated user's rewardDebt which tracks total amount of claimed Sushi tokens
  let userInfo = getOrCreateUserInfo(harvester.id, sushiFarm.id);
  userInfo.rewardDebt = userInfo.amount.times(sushiFarm.accSushiPerShare).div(ACC_SUSHI_PRECISION);
  userInfo.save();

  ////// update user's position

  // no LP tokens moved
  let outputTokenAmount = BigInt.fromI32(0);

  // no input tokens received in this transaction, only reward tokens
  let inputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];
  getHarvestedRewards(event, market, rewardTokenAmounts);

  // keep track of provided LP token amounts
  let outputTokenBalance = userInfo.amount;

  // inputTokenBalance -> number of LP tokens that can be redeemed by user
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(sushiFarm.lpToken, userInfo.id, userInfo.amount));

  // reward token amounts (SUSHI + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(sushiFarm, harvester, rewardTokenBalances, market);

  redeemFromMarket(
    event,
    harvester,
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
 * Updates farm's supply of LP tokens, as well as farm reward parameters.
 * @param event
 */
export function handleUpdatePool(event: UpdatePool): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;

  // create farm snapshot
  let snapshotId = event.transaction.hash.toHexString() + "-" + event.logIndex.toHexString();
  let farmSnapshot = new SushiFarmSnapshot(snapshotId);
  farmSnapshot.farmPid = event.params.pid;
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
  sushiFarm.lastRewardTime = event.params.lastRewardTimestamp;
  sushiFarm.totalSupply = event.params.lpSupply;
  sushiFarm.accSushiPerShare = event.params.accJoePerShare;
  sushiFarm.save();

  // update market
  let market = Market.load(sushiFarm.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(sushiFarm.lpToken, masterChef, sushiFarm.totalSupply)],
    sushiFarm.totalSupply
  );
}

/**
 * Updates farm's allocPoint and potentially the rewarder contract.
 * @param event
 */
export function handleSet(event: Set): void {
  let masterChef = event.address.toHexString();
  let sushiFarm = SushiFarm.load(masterChef + "-" + event.params.pid.toString()) as SushiFarm;

  // update totalalloc of MasterChef
  let masterChefEntity = MasterChef.load(masterChef) as MasterChef;
  masterChefEntity.totalAllocPoint = masterChefEntity.totalAllocPoint
    .minus(sushiFarm.allocPoint)
    .plus(event.params.allocPoint);
  masterChefEntity.save();

  // update sushifarm
  sushiFarm.allocPoint = event.params.allocPoint;
  if (event.params.overwrite) {
    sushiFarm.rewarder = event.params.rewarder.toHexString();
  }
  sushiFarm.save();
}

/**
 * Save reward token Transfer events, so they can be processed later as part of Harvest.
 * @param event
 */
export function handleRewardTokenTransfer(event: Transfer): void {
  let from = getOrCreateAccount(event.params.from);

  // if it is Sushi transfer and sender is MasterChef then store it as reward transfer
  let masterChef = MasterChef.load(from.id) as MasterChef;
  if (masterChef != null && event.address.toHexString() == masterChef.sushi) {
    let receiver = getOrCreateAccount(event.params.to);
    let transfer = new SushiRewardTransfer(event.transaction.hash.toHexString());
    transfer.from = from.id;
    transfer.to = receiver.id;
    transfer.value = event.params.value;
    transfer.transactionHash = event.transaction.hash.toHexString();
    transfer.save();
    return;
  }

  // if sender is Rewarder contract then it is extra token reward transfer
  let rewarder = Rewarder.load(from.id) as Rewarder;
  if (rewarder != null) {
    let receiver = getOrCreateAccount(event.params.to);

    let tx = event.transaction.hash.toHexString();
    let token = event.address.toHexString();

    let transfer = new ExtraRewardTokenTransfer(tx + "-" + token);
    transfer.rewardToken = token;
    transfer.from = from.id;
    transfer.to = receiver.id;
    transfer.value = event.params.value;
    transfer.transactionHash = tx;
    transfer.save();
    return;
  }
}

/**
 * Update `sushiPerSecond` parameter.
 * @param event
 */
export function handleUpdateEmissionRate(event: UpdateEmissionRate): void {
  let masterChef = MasterChef.load(event.address.toHexString());
  masterChef.sushiPerSecond = event.params._joePerSec;
  masterChef.save();
}
