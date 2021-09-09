import { Address, BigInt } from "@graphprotocol/graph-ts";

import { getOrCreateERC20Token, getOrCreateMarket, TokenBalance, ADDRESS_ZERO } from "./common";

import { GaugeVersion, ProtocolName, ProtocolType } from "./constants";

import { GaugeController, NewGauge } from "../generated/GaugeController/GaugeController";

import { LiquidityGauge as GaugeContract } from "../generated/GaugeController/LiquidityGauge";

import { RewardToken, LiquidityGauge } from "../generated/templates";

import { Gauge, GaugeType, Token } from "../generated/schema";

const MAX_N_TOKENS = 8;
const CRV_TOKEN = "0xd533a949740bb3306d119cc777fa900ba034cd52";

/**
 * Create new gauge entity and start indexing it
 * @param event
 */
export function handleNewGauge(event: NewGauge): void {
  // bind controller and gauge contracts
  let gaugeController = GaugeController.bind(event.address);
  let gaugeContract = GaugeContract.bind(event.params.addr);

  // Register new gauge type
  let gaugeType = GaugeType.load(event.params.gauge_type.toString())!;
  if (gaugeType == null) {
    gaugeType = new GaugeType(event.params.gauge_type.toString());
    gaugeType.name = gaugeController.gauge_type_names(event.params.gauge_type);
    gaugeType.save();
  }

  // Add gauge instance
  let gauge = new Gauge(event.params.addr.toHexString());
  gauge.type = gaugeType.id;
  gauge.created = event.block.timestamp;
  gauge.createdAtBlock = event.block.number;
  gauge.createdAtTransaction = event.transaction.hash;
  determineGaugeVersion(gauge, gaugeContract);
  gauge.totalSupply = BigInt.fromI32(0);
  gauge.workingSupply = BigInt.fromI32(0);

  // create common entities

  // get LPToken which is input token to gauge
  let inputTokens: Token[] = [];
  let inputTokenAddress = gaugeContract.try_lp_token();
  if (!inputTokenAddress.reverted) {
    let inputToken = getOrCreateERC20Token(event, inputTokenAddress.value);
    inputTokens.push(inputToken);

    // also save LP token reference to gauge entity
    gauge.lpToken = inputToken.id;
  }
  gauge.save();

  // output token is gauge contract itself
  let outputToken = getOrCreateERC20Token(event, Address.fromString(gauge.id));

  // get reward tokens
  let rewardTokens: Token[] = [];

  // CRV
  let crvTokenAddress = gaugeContract.try_crv_token();
  if (!crvTokenAddress.reverted) {
    let crvToken = getOrCreateERC20Token(event, crvTokenAddress.value);
    rewardTokens.push(crvToken);
  } else {
    // if there's no function to fetch it, use hardcoded CRV address
    let crvToken = getOrCreateERC20Token(event, Address.fromString(CRV_TOKEN));
    rewardTokens.push(crvToken);
  }

  // collect all other reward tokens
  if (gauge.version == GaugeVersion.LIQUIDITY_GAUGE_REWARD) {
    // LiquidityGaugeReward.vy uses rewarded_token() function
    let rewardedTokenAddress = gaugeContract.try_rewarded_token();
    if (!rewardedTokenAddress.reverted) {
      let rewardedToken = getOrCreateERC20Token(event, rewardedTokenAddress.value);
      rewardTokens.push(rewardedToken);

      // start indexing reward token - we want to listen for Transfer events
      RewardToken.create(rewardedTokenAddress.value);
    }
  } else if (gauge.version == GaugeVersion.LIQUIDITY_GAUGE_V1) {
    //do nothing as V1 doesn't have reward token
  } else {
    // from V2 onwards use reward_tokens(uint256) function
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
  }

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    event.params.addr,
    ProtocolName.CURVE_GAUGE,
    ProtocolType.TOKEN_MANAGEMENT,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // set mintedByMarket refrence
  outputToken.mintedByMarket = market.id;
  outputToken.save();

  // Create indexer only for gauges on Ethereum mainnet
  if (gaugeType.name == "Liquidity") {
    LiquidityGauge.create(event.params.addr);
  }
}

/**
 * Due to different Gauge implementations having different APIs and different way of
 * calculating rewards, we need to figure out dynamically which version is used.
 * Version is determined based on API differences.
 * Reference used: https://curve.readthedocs.io/dao-gauges.html#querying-gauge-information
 * @param gauge
 */
function determineGaugeVersion(gauge: Gauge, gaugeContract: GaugeContract): void {
  // only LIQUIDITY_GAUGE_REWARD has rewarded_token function
  if (!gaugeContract.try_rewarded_token().reverted) {
    gauge.version = GaugeVersion.LIQUIDITY_GAUGE_REWARD;
    return;
  }

  // only LIQUIDITY_GAUGE_ANDRE has reward_count function
  if (!gaugeContract.try_reward_count().reverted) {
    gauge.version = GaugeVersion.LIQUIDITY_GAUGE_ANDRE;
    return;
  }

  // V1 doesn't have reward_contract function nor reward_count
  if (gaugeContract.try_reward_contract().reverted && gaugeContract.try_reward_count().reverted) {
    gauge.version = GaugeVersion.LIQUIDITY_GAUGE_V1;
    return;
  }

  // V2 doesn't have last_claim function
  if (gaugeContract.try_last_claim().reverted) {
    gauge.version = GaugeVersion.LIQUIDITY_GAUGE_V2;
    return;
  }

  // assume latest V3 version
  gauge.version = GaugeVersion.LIQUIDITY_GAUGE_V3;
}
