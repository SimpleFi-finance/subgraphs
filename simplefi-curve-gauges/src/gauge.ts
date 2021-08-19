import { Address, BigInt } from "@graphprotocol/graph-ts";

import {
  Deposit,
  UpdateLiquidityLimit,
  Withdraw,
} from "../generated/templates/LiquidityGauge/LiquidityGauge";

import { LiquidityGauge as GaugeContract } from "../generated/GaugeController/LiquidityGauge";

import {
  GaugeDeposit,
  GaugeSnapshot,
  GaugeWithdraw,
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

export function handleDeposit(event: Deposit): void {
  let account = getOrCreateAccount(event.params.provider);

  // save new deposit entity
  let deposit = new GaugeDeposit(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  deposit.gauge = event.address.toHexString();
  deposit.provider = account.id;
  deposit.value = event.params.value.toBigDecimal();
  deposit.save();

  //////////////////////////////////////

  // get gauge
  let gauge = Gauge.load(event.address.toHexString());
  let gaugeContract = GaugeContract.bind(Address.fromString(gauge.id));

  // Update AccountLiquidity to track gauge token balance of account
  let accountLiquidity = getOrCreateAccountLiquidity(account, gauge);
  accountLiquidity.balance = accountLiquidity.balance.plus(event.params.value);
  accountLiquidity.save();

  //// Collect data for position update

  // market (representing gauge)
  let market = Market.load(gauge.id) as Market;

  // number of LP tokens deposited (equals to number of gauge tokens assigned to user)
  let outputTokenAmount = event.params.value;

  // total number of gauge tokens owned by user
  let accountGaugeTokenBalance = accountLiquidity.balance;

  // number of LP tokens deposited by user
  let inputTokenAmounts = [new TokenBalance(gauge.lpToken, account.id, outputTokenAmount)];

  // number of reward tokens claimed by user in this transaction
  // TODO find a way to collect info
  let rewardTokenAmounts: TokenBalance[] = [];

  // inputTokenBalance -> number of LP tokens that can be redeemed by accounts's gauge tokens
  // in this case it is working balance of user (takes into account CRV vote boosting)
  let inputTokenBalances: TokenBalance[] = [];
  let inputBalance = gaugeContract.try_working_balances(Address.fromString(account.id));
  if (!inputBalance.reverted) {
    inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, inputBalance.value));
  } else {
    // in case working balance can't be fetched, assume inputTokenBalance is equal to gauge token balance (no boost)
    inputTokenBalances.push(new TokenBalance(gauge.lpToken, account.id, accountGaugeTokenBalance));
  }

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
    accountGaugeTokenBalance,
    inputTokenBalances,
    rewardTokenBalances,
    null
  );
}

export function handleWithdraw(event: Withdraw): void {}

export function handleUpdateLiquidityLimit(event: UpdateLiquidityLimit): void {
  let transactionHash = event.transaction.hash.toHexString();
  let snapshotId = transactionHash.concat("-").concat(event.logIndex.toHexString());

  // create gauge snapshot
  let gaugeSnapshot = new GaugeSnapshot(snapshotId);
  gaugeSnapshot.gauge = event.address.toHexString();
  gaugeSnapshot.originalSupply = event.params.original_supply;
  gaugeSnapshot.workingSupply = event.params.working_supply;
  gaugeSnapshot.timestamp = event.block.timestamp;
  gaugeSnapshot.transactionHash = transactionHash;
  gaugeSnapshot.transactionIndexInBlock = event.transaction.index;
  gaugeSnapshot.blockNumber = event.block.number;
  gaugeSnapshot.logIndex = event.logIndex;
  gaugeSnapshot.save();

  // update gauge's LP token total and working supply
  let gauge = Gauge.load(event.address.toHexString());
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
  liquidity.save();
  return liquidity as AccountLiquidity;
}

/**
 * Collect info from gauge contracts about number of claimable reward tokens
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
) {
  let gaugeContract = GaugeContract.bind(Address.fromString(gauge.id));

  // collect claimable CRV
  let claimableCrv = gaugeContract.try_claimable_tokens(Address.fromString(account.id));
  if (!claimableCrv.reverted) {
    rewardTokenBalances.push(
      new TokenBalance(market.rewardTokens[0], account.id, claimableCrv.value)
    );
  }

  // different gauge types use different APIs for reward tokens
  switch (gauge.version) {
    case GaugeVersion.LIQUIDITY_GAUGE_REWARD:
      let rewardedToken = gaugeContract.try_rewarded_token();
      let claimableRewardTotal = gaugeContract.try_claimable_reward(Address.fromString(account.id));
      let claimedRewards = gaugeContract.try_claimed_rewards_for(Address.fromString(account.id));

      if (!rewardedToken.reverted && !claimableRewardTotal.reverted && !claimedRewards.reverted) {
        let claimableRewards = claimableRewardTotal.value.minus(claimedRewards.value);
        rewardTokenBalances.push(
          new TokenBalance(rewardedToken.value.toHexString(), account.id, claimableRewards)
        );
      }
      break;
    case GaugeVersion.LIQUIDITY_GAUGE_V1:
      // do nothing, no reward tokens
      break;
    case GaugeVersion.LIQUIDITY_GAUGE_V2:
      for (let i: i32 = 1; i < market.rewardTokens.length; i++) {
        let claimableCustomRewardToken = gaugeContract.try_claimable_reward1(
          Address.fromString(account.id),
          Address.fromString(market.rewardTokens[i])
        );

        if (!claimableCustomRewardToken.reverted) {
          rewardTokenBalances.push(
            new TokenBalance(market.rewardTokens[i], account.id, claimableCustomRewardToken.value)
          );
        }
      }
      break;
    case GaugeVersion.LIQUIDITY_GAUGE_V3:
    // handle V3 as default case
    default:
      for (let i: i32 = 1; i < market.rewardTokens.length; i++) {
        let claimableCustomRewardToken = gaugeContract.try_claimable_reward_write(
          Address.fromString(account.id),
          Address.fromString(market.rewardTokens[i])
        );

        if (!claimableCustomRewardToken.reverted) {
          rewardTokenBalances.push(
            new TokenBalance(market.rewardTokens[i], account.id, claimableCustomRewardToken.value)
          );
        }
      }
      break;
  }
}
