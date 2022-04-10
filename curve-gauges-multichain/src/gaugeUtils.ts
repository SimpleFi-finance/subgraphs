import { Account, AccountLiquidity, Gauge, Market, Token } from "../generated/schema";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { ADDRESS_ZERO, getOrCreateERC20Token, getOrCreateMarket, TokenBalance } from "./common";
import { GaugeVersion, ProtocolName, ProtocolType } from "./constants";
import { LiquidityGauge as GaugeContract } from "../generated/templates/LiquidityGauge/LiquidityGauge";
import { RewardToken, LiquidityGauge as GaugeTemplate } from "../generated/templates";

const MAX_N_TOKENS = 8;

/**
 * Create gauge and market entities, and start indexing gauge contract.
 * @param event
 * @param gaugeAddress
 * @returns
 */
export function getOrCreateGauge(event: ethereum.Event, gaugeAddress: Address): Gauge {
  //// create gauge entity
  let gauge = Gauge.load(gaugeAddress.toHexString());
  if (gauge != null) {
    return gauge as Gauge;
  }

  gauge = new Gauge(gaugeAddress.toHexString());
  gauge.created = event.block.timestamp;
  gauge.createdAtBlock = event.block.number;
  gauge.createdAtTransaction = event.transaction.hash;
  gauge.version = GaugeVersion.LIQUIDITY_GAUGE_V3;
  gauge.totalSupply = BigInt.fromI32(0);
  gauge.workingSupply = BigInt.fromI32(0);

  // create common entities

  // get LPToken which is input token to gauge
  let gaugeContract = GaugeContract.bind(gaugeAddress);
  let inputTokens: Token[] = [];
  let inputToken = getOrCreateERC20Token(event, gaugeContract.lp_token());
  inputTokens.push(inputToken);

  // also save LP token reference to gauge entity
  gauge.lpToken = inputToken.id;
  gauge.save();

  //// create market entity

  // output token is gauge contract itself
  let outputToken = getOrCreateERC20Token(event, Address.fromString(gauge.id));

  // get reward tokens
  let rewardTokens: Token[] = [];
  for (let i: i32 = 0; i < MAX_N_TOKENS; i++) {
    let rewardTokenAddress = gaugeContract.try_reward_tokens(BigInt.fromI32(i));
    if (rewardTokenAddress.reverted || rewardTokenAddress.value.toHexString() == ADDRESS_ZERO) {
      break;
    }

    let rewardToken = getOrCreateERC20Token(event, rewardTokenAddress.value);
    rewardTokens.push(rewardToken);

    // start indexing reward token - we want to listen for Transfer events
    RewardToken.create(rewardTokenAddress.value);
  }

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    gaugeAddress,
    ProtocolName.CURVE_GAUGE,
    ProtocolType.LP_FARMING,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // set mintedByMarket refrence
  outputToken.mintedByMarket = market.id;
  outputToken.save();

  // start indexing new gauge
  GaugeTemplate.create(gaugeAddress);

  return gauge as Gauge;
}

/**
 * AccountLiquidity tracks user's balance of gauge tokens and CRV tokens
 * @param account
 * @param gauge
 * @returns
 */
export function getOrCreateAccountLiquidity(account: Account, gauge: Gauge): AccountLiquidity {
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
 * Collect info from gauge contract about number of claimable reward tokens.
 * @param gauge
 * @param account
 * @param rewardTokenBalances
 * @param market
 */
export function collectRewardTokenBalances(
  gauge: Gauge,
  account: Account,
  rewardTokenBalances: TokenBalance[],
  market: Market
): void {
  let gaugeContract = GaugeContract.bind(Address.fromString(gauge.id));

  // handle LIQUIDITY_GAUGE_V3 as default case
  let rewardTokens = market.rewardTokens as string[];
  for (let i: i32 = 0; i < market.rewardTokens.length; i++) {
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
