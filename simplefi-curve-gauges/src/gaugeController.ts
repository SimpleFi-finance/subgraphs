import { Address, BigInt } from "@graphprotocol/graph-ts";

import { getOrCreateERC20Token, getOrCreateMarket, TokenBalance, ADDRESS_ZERO } from "./common";

import { ProtocolName, ProtocolType } from "./constants";

import { GaugeController, NewGauge } from "../generated/GaugeController/GaugeController";

import { LiquidityGauge as GaugeContract } from "../generated/GaugeController/LiquidityGauge";

import { LiquidityGauge } from "../generated/templates";

import { Gauge, GaugeType, Token } from "../generated/schema";

const MAX_N_TOKENS = 8;

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
  gauge.save();

  // create common entities

  // get LPToken which is input token to gauge
  let inputTokens: Token[] = [];
  let inputTokenAddress = gaugeContract.try_lp_token();
  if (!inputTokenAddress.reverted) {
    let inputToken = getOrCreateERC20Token(event, inputTokenAddress.value);
    inputTokens.push(inputToken);

    // also save LP token reference to gauge entity
    gauge.lpToken = inputToken.id;
    gauge.save();
  }

  // output token is gauge contract itself
  let outputToken = getOrCreateERC20Token(event, Address.fromString(gauge.id));

  // get reward tokens
  let rewardTokens: Token[] = [];

  // CRV
  let crvTokenAddress = gaugeContract.try_crv_token();
  if (!crvTokenAddress.reverted) {
    let crvToken = getOrCreateERC20Token(event, crvTokenAddress.value);
    rewardTokens.push(crvToken);
  }

  // collect all other reward tokens
  for (let i: i32 = 0; i < MAX_N_TOKENS; i++) {
    let rewardTokenAddress = gaugeContract.try_reward_tokens(BigInt.fromI32(i));

    if (rewardTokenAddress.reverted || rewardTokenAddress.value.toHexString() == ADDRESS_ZERO) {
      break;
    }

    let rewardToken = getOrCreateERC20Token(event, rewardTokenAddress.value);
    rewardTokens.push(rewardToken);
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

  // Create indexer for gauges on Ethereum
  if (gaugeType.name == "Liquidity" || gaugeType.name == "Crypto Pools") {
    LiquidityGauge.create(event.params.addr);
  }
}
