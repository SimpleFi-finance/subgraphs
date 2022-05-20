import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import {
  Deposit,
  Withdraw,
  Transfer as GaugeTokenTransfer,
} from "../generated/templates/LiquidityGauge/LiquidityGauge";

import { Transfer as RewardTokenTransfer } from "../generated/templates/RewardToken/ERC20";

import { GaugeDeposit, GaugeWithdraw, Gauge, Market } from "../generated/schema";

import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "./common";

import {
  collectRewardTokenBalances,
  getOrCreateAccountLiquidity,
  getOrCreateGauge,
} from "./gaugeUtils";

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

  //// update market state
  let gauge = getOrCreateGauge(event, event.address);
  gauge.totalSupply = gauge.totalSupply.plus(deposit.value);
  gauge.save();

  let market = Market.load(gauge.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(gauge.lpToken, gauge.id, gauge.totalSupply)],
    gauge.totalSupply
  );

  //// update user position

  // amount of gauge tokens minted
  let outputTokenAmount = deposit.value;

  // amount of LP tokens provided
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(gauge.lpToken, account.id, deposit.value),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // users balance of LP tokens
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  accountLiquidity.balance = accountLiquidity.balance.plus(deposit.value);
  accountLiquidity.save();
  let outputTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, accountLiquidity.balance));

  // reward token amounts (CRV + custom tokens) claimable by user
  let rewardTokenBalances: TokenBalance[] = [];
  collectRewardTokenBalances(gauge, account, rewardTokenBalances, market);

  // use common function to update position and store transaction
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

  //// update market state
  let gauge = getOrCreateGauge(event, event.address);
  gauge.totalSupply = gauge.totalSupply.minus(withdrawal.value);
  gauge.save();

  let market = Market.load(gauge.id) as Market;
  updateMarket(
    event,
    market,
    [new TokenBalance(gauge.lpToken, gauge.id, gauge.totalSupply)],
    gauge.totalSupply
  );

  //// update user position

  // amount of gauge tokens burned
  let outputTokenAmount = withdrawal.value;

  // amount of LP tokens provided
  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(gauge.lpToken, account.id, withdrawal.value),
  ];

  // number of reward tokens claimed by user in this transaction
  let rewardTokenAmounts: TokenBalance[] = [];

  // users balance of LP tokens
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  accountLiquidity.balance = accountLiquidity.balance.minus(withdrawal.value);
  accountLiquidity.save();
  let outputTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, accountLiquidity.balance));

  // reward token amounts (CRV + custom tokens) claimable by user
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
    outputTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

/**
 * Handles event of gauge token transfer from one account to another
 * @param gauge
 * @param event
 * @returns
 */
export function handleGaugeTokenTransfer(event: GaugeTokenTransfer): void {
  // load UpdateLiquidityLimit event which preceded deposit
  let transactionHash = event.transaction.hash.toHexString();

  // if gauge contract generated event then it is gauge token transfer
  let gauge = getOrCreateGauge(event, event.address);

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
  let rewardTokens = market.rewardTokens as string[];
  let rewardToken = event.address.toHexString();
  for (let i: i32 = 0; i < market.rewardTokens.length; i++) {
    if (rewardTokens[i] == rewardToken) {
      rewardTokenAmounts.push(new TokenBalance(rewardToken, account.id, event.params.value));
    } else {
      rewardTokenAmounts.push(new TokenBalance(rewardTokens[i], account.id, BigInt.fromI32(0)));
    }
  }

  // total number of gauge tokens owned by user - no change in this case
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  let accountGaugeTokenBalance = accountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let inputTokenBalances: TokenBalance[] = [];
  inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, accountGaugeTokenBalance));

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
  fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(value);
  fromAccountLiquidity.save();
  let fromTokenBalance = fromAccountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  let fromInputTokenBalances: TokenBalance[] = [];
  fromInputTokenBalances.push(new TokenBalance(gauge.lpToken, fromAccount.id, fromTokenBalance));

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

  // receiver
  let toAccount = getOrCreateAccount(to);

  // number of LP tokens deposited by user - none in this case
  let toInputTokenAmounts: TokenBalance[] = [];

  // number of reward tokens claimed by user in this transaction
  let toRewardTokenAmounts: TokenBalance[] = [];

  // update sender's LP token balance and workingBalance
  let toAccountLiquidity = getOrCreateAccountLiquidity(toAccount, gauge);
  toAccountLiquidity.balance = toAccountLiquidity.balance.plus(value);
  toAccountLiquidity.save();
  let toTokenBalance = toAccountLiquidity.balance;

  // inputTokenBalance -> number of LP tokens that can be redeemed by receiver's gauge tokens
  let toInputTokenBalances: TokenBalance[] = [];
  toInputTokenBalances.push(new TokenBalance(gauge.lpToken, toAccount.id, toTokenBalance));

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
}
