import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import {
  Deposit,
  UpdateLiquidityLimit,
  Withdraw,
  Transfer as GaugeTokenTransfer,
} from "../generated/templates/LiquidityGauge/LiquidityGauge";

import { Transfer as RewardTokenTransfer } from "../generated/templates/RewardToken/ERC20";

import { Minted } from "../generated/Minter/Minter";

import { LiquidityGauge as GaugeContract } from "../generated/GaugeController/LiquidityGauge";

import {
  GaugeDeposit,
  GaugeSnapshot,
  GaugeWithdraw,
  GaugeUpdateLiquidityLimit,
  Gauge,
  Market,
  AccountLiquidity,
  Account,
} from "../generated/schema";

import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "./common";

import { GaugeVersion } from "./constants";

const GAUGE_TYPE_ETHEREUM_MAINNET = "0";

/**
 * When user deposits funds create entity and update user's position
 * @param event
 */
export function handleDeposit(event: Deposit): void {
  let account = getOrCreateAccount(event.params.provider);

  // save new deposit entity
  let deposit = new GaugeDeposit(event.transaction.hash.toHexString() + "-" + account.id);
  deposit.gauge = event.address.toHexString();
  deposit.provider = account.id;
  deposit.value = event.params.value;
  deposit.save();

  // don't update user's position for 0 value deposit
  if (deposit.value == BigInt.fromI32(0)) {
    return;
  }

  // load UpdateLiquidityLimit event which preceded deposit
  let transactionHash = event.transaction.hash.toHexString();
  let user = event.params.provider.toHexString();
  let id = transactionHash
    .concat("-")
    .concat(user)
    .concat("-")
    .concat(event.address.toHexString());
  let eventEntity = GaugeUpdateLiquidityLimit.load(id) as GaugeUpdateLiquidityLimit;
  let gauge = Gauge.load(event.address.toHexString()) as Gauge;

  // update user position in market after deposit
  updateUserPosition(gauge, eventEntity, event, true);

  // remove entity so that new one can be created in same transaction for same user/gauge
  store.remove("GaugeUpdateLiquidityLimit", eventEntity.id);
}

/**
 * When user withdraws funds create entity and update user's position
 * @param event
 */
export function handleWithdraw(event: Withdraw): void {
  let account = getOrCreateAccount(event.params.provider);

  // save new deposit entity
  let withdrawal = new GaugeWithdraw(event.transaction.hash.toHexString() + "-" + account.id);
  withdrawal.gauge = event.address.toHexString();
  withdrawal.provider = account.id;
  withdrawal.value = event.params.value;
  withdrawal.save();

  // don't update user's position for 0 value withdrawal
  if (withdrawal.value == BigInt.fromI32(0)) {
    return;
  }

  // load UpdateLiquidityLimit event which preceded withdrawal
  let transactionHash = event.transaction.hash.toHexString();
  let user = event.params.provider.toHexString();
  let id = transactionHash
    .concat("-")
    .concat(user)
    .concat("-")
    .concat(event.address.toHexString());
  let eventEntity = GaugeUpdateLiquidityLimit.load(id) as GaugeUpdateLiquidityLimit;
  let gauge = Gauge.load(event.address.toHexString()) as Gauge;

  // update user position in market after withdrawal
  updateUserPosition(gauge, eventEntity, event, false);

  // remove entity so that new one can be created in same transaction for same user/gauge
  store.remove("GaugeUpdateLiquidityLimit", eventEntity.id);
}

/**
 * UpdateLiquidityLimit event is emitted when:
 * - LP tokens are deposited or withdrawn
 * - CRV is minted and sent to user
 * - checkpoints are executed to update the rewards state
 * Handler updates the state of market.
 * @param event
 */
export function handleUpdateLiquidityLimit(event: UpdateLiquidityLimit): void {
  // store event info
  getOrCreateGaugeUpdateLiquidityLimit(event);

  // check if this is deposit/withdraw or neither
  let gauge = Gauge.load(event.address.toHexString()) as Gauge;
  let isWithdraw = gauge.totalSupply > event.params.original_supply;
  let isDeposit = gauge.totalSupply < event.params.original_supply;

  // if there's no change in supply, don't handle the event
  if (!isWithdraw && !isDeposit) {
    return;
  }

  // create gauge snapshot
  let transactionHash = event.transaction.hash.toHexString();
  let snapshotId = transactionHash.concat("-").concat(event.logIndex.toHexString());
  let gaugeSnapshot = new GaugeSnapshot(snapshotId);
  gaugeSnapshot.gauge = event.address.toHexString();
  gaugeSnapshot.originalSupply = gauge.totalSupply;
  gaugeSnapshot.workingSupply = gauge.workingSupply;
  gaugeSnapshot.timestamp = event.block.timestamp;
  gaugeSnapshot.transactionHash = transactionHash;
  gaugeSnapshot.transactionIndexInBlock = event.transaction.index;
  gaugeSnapshot.blockNumber = event.block.number;
  gaugeSnapshot.logIndex = event.logIndex;
  gaugeSnapshot.save();

  // update gauge's LP token total and working supply
  gauge.totalSupply = event.params.original_supply;
  gauge.workingSupply = event.params.working_supply;
  gauge.save();

  // update market and create market snapshot
  let market = Market.load(gauge.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(gauge.lpToken, gauge.id, gauge.totalSupply)],
    gauge.totalSupply
  );
}

/**
 * Handles event of gauge token transfer from one account to another
 * @param gauge
 * @param event
 * @returns
 */
export function handleGaugeTokenTransfer(event: GaugeTokenTransfer): void {
  // if gauge contract generated event then it is gauge token transfer
  let gauge = Gauge.load(event.address.toHexString()) as Gauge;

  // ignore 0 value transfer
  if (event.params._value == BigInt.fromI32(0)) {
    return;
  }

  // mint of gauge tokens event is already handled in handleDeposit
  if (event.params._from.toHexString() == ADDRESS_ZERO) {
    return;
  }

  // if receiver is zero address and there is preceding withdrawal entity
  // -> then don't handle it as it was already done in withdrawal handler
  if (event.params._to.toHexString() == ADDRESS_ZERO) {
    let id = event.transaction.hash
      .toHexString()
      .concat("-")
      .concat(event.params._from.toHexString());
    let withdrawal = GaugeWithdraw.load(id);

    if (withdrawal != null && withdrawal.value == event.params._value) {
      store.remove("GaugeWithdraw", id);
      return;
    }
  }

  transferGaugeToken(gauge, event, event.params._from, event.params._to, event.params._value);
}

/**
 * Handles event of reward token transfer. We know it is reward claim if `from` is gauge itself.
 * @param event
 * @returns
 */
export function handleRewardTokenTransfer(event: RewardTokenTransfer): void {
  // check if gauge is the sender. If not, no need to handle event
  let gauge = Gauge.load(event.params.from.toHexString()) as Gauge;
  if (gauge == null) {
    return;
  }

  // ignore 0 value transfer
  if (event.params.value == BigInt.fromI32(0)) {
    return;
  }

  //// Collect data for position update after reward token has been claimed by user

  // user who gets the reward token
  let account = getOrCreateAccount(event.params.to);

  // market (gauge)
  let market = Market.load(gauge.id) as Market;

  // number of gauge tokens burned by user - none in this case
  let outputTokenAmount = BigInt.fromI32(0);

  // number of LP tokens withdrawn by user - none in this case
  let inputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  // this events tracks aquiring one reward token specifically
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardToken = event.address.toHexString();
  let rewardTokenBalance = new TokenBalance(rewardToken, account.id, event.params.value);
  rewardTokenAmounts.push(rewardTokenBalance);

  // total number of gauge tokens owned by user - no change in this case
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  let accountGaugeTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(gauge.lpToken, account.id, accountLiquidity.workingBalance)
  );

  // update reward token amounts (CRV + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, account, rewardTokenBalances, market);

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    accountGaugeTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

/**
 * Tracks `Minted` event emitted by CRV minter.
 * Minted CRV is transferred to user as reward for providing liquidity to gauge
 * @param event
 */
export function handleMinted(event: Minted): void {
  // get gauge
  let gauge = Gauge.load(event.params.gauge.toHexString()) as Gauge;

  // only handle CRV minting for mainnet gauges
  if (gauge.type != GAUGE_TYPE_ETHEREUM_MAINNET) return;

  // Load UpdateLiquidityLimit event which preceded minting
  let transactionHash = event.transaction.hash.toHexString();
  let user = event.params.recipient.toHexString();
  let id = transactionHash
    .concat("-")
    .concat(user)
    .concat("-")
    .concat(event.params.gauge.toHexString());

  let eventEntity = GaugeUpdateLiquidityLimit.load(id);

  // user who gets minted CRV tokens
  let account = getOrCreateAccount(event.params.recipient);

  // event emits total number of CRV tokens minted for user for this gauge
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  let crvTokensReceivedTotal = event.params.minted;

  // calculate CRV tokens received in this transaction
  let crvTokensReceivedInTransaction = crvTokensReceivedTotal.minus(accountLiquidity.crvReceived);

  // store new total
  accountLiquidity.crvReceived = crvTokensReceivedTotal;
  accountLiquidity.save();

  //// Collect data for position update after CRV rewards have been transferred to user

  // market (representing gauge)
  let market = Market.load(gauge.id) as Market;

  // number of gauge tokens burned by user
  let outputTokenAmount = BigInt.fromI32(0);

  // number of LP tokens withdrawn by user
  let inputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  // this event tracks aquiring CRV tokens specifically (CRV is at 0 index in rewardTokens)
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokens = market.rewardTokens as string[];
  let crvTokenBalance = new TokenBalance(
    rewardTokens[0],
    account.id,
    crvTokensReceivedInTransaction
  );
  rewardTokenAmounts.push(crvTokenBalance);

  // total number of gauge tokens owned by user - no change in this case
  let accountGaugeTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let inputTokenBalances: TokenBalance[] = [];

  inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, eventEntity.working_balance));

  // update reward token amounts (CRV + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, account, rewardTokenBalances, market);

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    rewardTokenAmounts,
    accountGaugeTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );

  // remove entity so that new one can be created in same transaction for same user/gauge
  store.remove("GaugeUpdateLiquidityLimit", eventEntity.id);
}

/**
 * AccountLiquidity tracks user's balance of gauge tokens and CRV tokens
 * @param account
 * @param gauge
 * @returns
 */
function getOrCreateAccountLiquidity(account: Account, gauge: Gauge): AccountLiquidity {
  let id = account.id.concat("-").concat(gauge.id);
  let liquidity = AccountLiquidity.load(id);

  if (liquidity != null) {
    return liquidity as AccountLiquidity;
  }
  liquidity = new AccountLiquidity(id);
  liquidity.gauge = gauge.id;
  liquidity.account = account.id;
  liquidity.balance = BigInt.fromI32(0);
  liquidity.workingBalance = BigInt.fromI32(0);
  liquidity.crvReceived = BigInt.fromI32(0);
  liquidity.save();
  return liquidity as AccountLiquidity;
}

/**
 * Store params of UpdateLiquidityLimit event to entity, so they might be used for later processing.
 * @param event
 * @returns
 */
function getOrCreateGaugeUpdateLiquidityLimit(
  event: UpdateLiquidityLimit
): GaugeUpdateLiquidityLimit {
  let transactionHash = event.transaction.hash.toHexString();
  let user = event.params.user.toHexString();
  let id = transactionHash
    .concat("-")
    .concat(user)
    .concat("-")
    .concat(event.address.toHexString());

  let eventEntity = GaugeUpdateLiquidityLimit.load(id);

  if (eventEntity != null) {
    return eventEntity as GaugeUpdateLiquidityLimit;
  }

  eventEntity = new GaugeUpdateLiquidityLimit(id);
  eventEntity.gauge = event.address.toHexString();
  eventEntity.user = event.params.user.toHexString();
  eventEntity.original_balance = event.params.original_balance;
  eventEntity.original_supply = event.params.original_supply;
  eventEntity.working_balance = event.params.working_balance;
  eventEntity.working_supply = event.params.working_supply;
  eventEntity.save();
  return eventEntity as GaugeUpdateLiquidityLimit;
}

/**
 * Collect info from gauge contract about number of claimable reward tokens
 * using correct API calls (depends on gauge type)
 * @param gauge
 * @param account
 * @param rewardTokenBalances
 * @param market
 */
function collectRewardTokenBalances(
  gauge: Gauge,
  account: Account,
  rewardTokenBalances: TokenBalance[],
  market: Market
): void {
  let gaugeContract = GaugeContract.bind(Address.fromString(gauge.id));

  // collect claimable CRV
  let claimableCrv = gaugeContract.try_claimable_tokens(Address.fromString(account.id));
  if (!claimableCrv.reverted) {
    let rewardTokens = market.rewardTokens as string[];
    let crvToken = rewardTokens[0];
    rewardTokenBalances.push(new TokenBalance(crvToken, account.id, claimableCrv.value));
  }

  // different gauge types use different APIs for reward tokens
  if (gauge.version == GaugeVersion.LIQUIDITY_GAUGE_REWARD) {
    let rewardedToken = gaugeContract.try_rewarded_token();
    let claimableRewardTotal = gaugeContract.try_claimable_reward(Address.fromString(account.id));
    let claimedRewards = gaugeContract.try_claimed_rewards_for(Address.fromString(account.id));

    if (!rewardedToken.reverted && !claimableRewardTotal.reverted && !claimedRewards.reverted) {
      let claimableRewards = claimableRewardTotal.value.minus(claimedRewards.value);
      rewardTokenBalances.push(
        new TokenBalance(rewardedToken.value.toHexString(), account.id, claimableRewards)
      );
    }
  } else if (gauge.version == GaugeVersion.LIQUIDITY_GAUGE_V1) {
    // do nothing, no reward tokens in V1
  } else if (gauge.version == GaugeVersion.LIQUIDITY_GAUGE_V2) {
    let rewardTokens = market.rewardTokens as string[];
    for (let i: i32 = 1; i < market.rewardTokens.length; i++) {
      let claimableCustomRewardToken = gaugeContract.try_claimable_reward1(
        Address.fromString(account.id),
        Address.fromString(rewardTokens[i])
      );

      if (!claimableCustomRewardToken.reverted) {
        rewardTokenBalances.push(
          new TokenBalance(rewardTokens[i], account.id, claimableCustomRewardToken.value)
        );
      }
    }
  } else {
    // handle LIQUIDITY_GAUGE_V3 as default case
    let rewardTokens = market.rewardTokens as string[];
    for (let i: i32 = 1; i < market.rewardTokens.length; i++) {
      let claimableCustomRewardToken = gaugeContract.try_claimable_reward_write(
        Address.fromString(account.id),
        Address.fromString(rewardTokens[i])
      );

      if (!claimableCustomRewardToken.reverted) {
        rewardTokenBalances.push(
          new TokenBalance(rewardTokens[i], account.id, claimableCustomRewardToken.value)
        );
      }
    }
  }
}

/**
 * Gauge token is transfered - substract from sender's position and add it to receiver's
 * @param gauge
 * @param event
 */
function transferGaugeToken(
  gauge: Gauge,
  event: ethereum.Event,
  from: Address,
  to: Address,
  value: BigInt
): void {
  // Load UpdateLiquidityLimit event which preceded token transfer (sender)
  let entityId = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(from.toHexString())
    .concat("-")
    .concat(event.address.toHexString());
  let sendersUpdateLiquidityEvent = GaugeUpdateLiquidityLimit.load(entityId);

  // sender
  let fromAccount = getOrCreateAccount(from);

  // market (gauge)
  let market = Market.load(gauge.id) as Market;

  // outputTokenAmount - number of gauge tokens transferred
  let tokensTransferred = value;

  // number of LP tokens deposited by user - none in this case
  let fromInputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let fromRewardTokenAmounts: TokenBalance[] = [];

  // update sender's LP token balance and workingBalance
  let fromAccountLiquidity = getOrCreateAccountLiquidity(fromAccount, gauge);
  fromAccountLiquidity.balance = sendersUpdateLiquidityEvent.original_balance;
  fromAccountLiquidity.workingBalance = sendersUpdateLiquidityEvent.working_balance;
  fromAccountLiquidity.save();
  let fromTokenBalance = fromAccountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let fromInputTokenBalances: TokenBalance[] = [];
  fromInputTokenBalances.push(
    new TokenBalance(gauge.lpToken, fromAccount.id, fromAccountLiquidity.workingBalance)
  );

  // reward token amounts (CRV + custom tokens) claimable by user
  let fromRewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, fromAccount, fromRewardTokenBalances, market);

  // receiver
  let transferredTo = to.toHexString();

  // use common function to update position and store transaction of sender
  redeemFromMarket(
    event,
    fromAccount,
    market,
    tokensTransferred,
    fromInputTokenAmounts,
    fromRewardTokenAmounts,
    fromTokenBalance,
    fromInputTokenBalances,
    fromRewardTokenBalances,
    transferredTo
  );

  //// Collect data for receiver's position update

  // Load UpdateLiquidityLimit event which preceded token transfer
  entityId = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(to.toHexString())
    .concat("-")
    .concat(event.address.toHexString());
  let receiversUpdateLiquidityEvent = GaugeUpdateLiquidityLimit.load(entityId);

  // receiver
  let toAccount = getOrCreateAccount(to);

  // number of LP tokens deposited by user - none in this case
  let toInputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let toRewardTokenAmounts: TokenBalance[] = [];

  // update sender's LP token balance and workingBalance
  let toAccountLiquidity = getOrCreateAccountLiquidity(toAccount, gauge);
  toAccountLiquidity.balance = receiversUpdateLiquidityEvent.original_balance;
  toAccountLiquidity.workingBalance = receiversUpdateLiquidityEvent.working_balance;
  toAccountLiquidity.save();
  let toTokenBalance = toAccountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by receiver's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let toInputTokenBalances: TokenBalance[] = [];
  toInputTokenBalances.push(
    new TokenBalance(gauge.lpToken, toAccount.id, toAccountLiquidity.workingBalance)
  );

  // reward token amounts (CRV + custom tokens) claimable by user
  let toRewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, toAccount, toRewardTokenBalances, market);

  // sender
  let transferredFrom = from.toHexString();

  // use common function to update position and store transaction
  investInMarket(
    event,
    toAccount,
    market,
    tokensTransferred,
    toInputTokenAmounts,
    toRewardTokenAmounts,
    toTokenBalance,
    toInputTokenBalances,
    toRewardTokenBalances,
    transferredFrom
  );

  // remove entity so that new one can be created in same transaction for same user/gauge
  store.remove("GaugeUpdateLiquidityLimit", sendersUpdateLiquidityEvent.id);
  store.remove("GaugeUpdateLiquidityLimit", receiversUpdateLiquidityEvent.id);
}

/**
 * Collect info and update user's position after depositing/withdrawing LP tokens
 * @param gauge
 * @param event
 * @param isDeposit
 */
function updateUserPosition(
  gauge: Gauge,
  eventEntity: GaugeUpdateLiquidityLimit,
  event: ethereum.Event,
  isDeposit: boolean
): void {
  // market (representing gauge)
  let market = Market.load(gauge.id) as Market;

  // calculate number of gauge tokens minted/burned by user
  let account = getOrCreateAccount(Address.fromString(eventEntity.user));
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  let outputTokenAmount = accountLiquidity.balance.minus(eventEntity.original_balance).abs();

  // number of LP tokens deposited/withdrawn by user
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(gauge.lpToken, account.id, outputTokenAmount),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // total number of gauge tokens owned by user
  accountLiquidity.balance = eventEntity.original_balance;
  accountLiquidity.workingBalance = eventEntity.working_balance;
  accountLiquidity.save();
  let outputTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(
    new TokenBalance(gauge.lpToken, account.id, accountLiquidity.workingBalance)
  );

  // reward token amounts (CRV + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, account, rewardTokenBalances, market);

  // use common function to update position and store transaction
  if (isDeposit) {
    investInMarket(
      event,
      account,
      market,
      outputTokenAmount,
      inputTokenAmounts,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances,
      null
    );
  } else {
    redeemFromMarket(
      event,
      account,
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
}
