import { BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { MarketDayData, Pair } from "../generated/schema";
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Handle LP token transfer by updating totalSupply and outputToken daily inflow/outflow.
 * @param event
 */
export function handleTransfer(event: Transfer): void {
  let pair = Pair.load(event.address.toHexString());

  let supplyChange = event.params.value;
  let from = event.params.from.toHexString();
  let to = event.params.to.toHexString();

  // mint
  if (from == ADDRESS_ZERO) {
    pair.totalSupply = pair.totalSupply.plus(supplyChange);
    pair.save();

    let marketDayData = getMarketDayData(event);
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.outputTokenDailyInflowVolume = marketDayData.outputTokenDailyInflowVolume.plus(
      supplyChange
    );
    marketDayData.save();
  }

  // burn
  if (to == ADDRESS_ZERO && from == pair.id) {
    pair.totalSupply = pair.totalSupply.minus(supplyChange);
    pair.save();

    let marketDayData = getMarketDayData(event);
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.outputTokenDailyOutflowVolume = marketDayData.outputTokenDailyOutflowVolume.plus(
      supplyChange
    );
    marketDayData.save();
  }
}

/**
 * Handle sync by updating reserves
 * @param event
 */
export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString()) as Pair;
  pair.reserve0 = event.params.reserve0;
  pair.reserve1 = event.params.reserve1;
  pair.save();

  let marketDayData = getMarketDayData(event);
  marketDayData.inputTokenTotalBalances = [pair.reserve0, pair.reserve1];
  marketDayData.save();
}

/**
 * Handle mint by increasing reserve token inflow and burn TX counter.
 * @param event
 */
export function handleMint(event: Mint): void {
  let marketDayData = getMarketDayData(event);

  let inflows = marketDayData.inputTokenDailyInflow;
  let prevToken0Inflow = inflows[0];
  let prevToken1Inflow = inflows[1];

  marketDayData.inputTokenDailyInflow = [
    prevToken0Inflow.plus(event.params.amount0),
    prevToken1Inflow.plus(event.params.amount1),
  ];

  marketDayData.dailyMintTXs = marketDayData.dailyMintTXs.plus(BigInt.fromI32(1));
  marketDayData.save();
}

/**
 * Handle burn by increasing reserve token outflow and burn TX counter.
 * @param event
 */
export function handleBurn(event: Burn): void {
  let marketDayData = getMarketDayData(event);

  let outflows = marketDayData.inputTokenDailyOutflow;
  let prevToken0Outflow = outflows[0];
  let prevToken1Outflow = outflows[1];

  marketDayData.inputTokenDailyOutflow = [
    prevToken0Outflow.plus(event.params.amount0),
    prevToken1Outflow.plus(event.params.amount1),
  ];

  marketDayData.dailyBurnTXs = marketDayData.dailyBurnTXs.plus(BigInt.fromI32(1));
  marketDayData.save();
}

/**
 * Handle swap by increasing daily swap volume per token and swap TX counter.
 * @param event
 */
export function handleSwap(event: Swap): void {
  // update daily swap volume per token
  let marketDayData = getMarketDayData(event);

  // update swap in volumes
  let swapInVolumes = marketDayData.inputTokensDailySwapInVolume;
  marketDayData.inputTokensDailySwapInVolume = [
    swapInVolumes[0].plus(event.params.amount0In),
    swapInVolumes[1].plus(event.params.amount1In),
  ];

  // update swap out volumes
  let swapOutVolumes = marketDayData.inputTokensDailySwapOutVolume;
  marketDayData.inputTokensDailySwapOutVolume = [
    swapOutVolumes[0].plus(event.params.amount0Out),
    swapOutVolumes[1].plus(event.params.amount1Out),
  ];

  // update TX counter
  marketDayData.dailySwapTXs = marketDayData.dailySwapTXs.plus(BigInt.fromI32(1));

  // update fees collected
  let swapFeeToken0 = event.params.amount0In.times(marketDayData.protocolFee);
  let swapFeeToken1 = event.params.amount1In.times(marketDayData.protocolFee);
  let prevFees: BigInt[] = marketDayData.feesGenerated;
  let swapFeesDailyCumulatedToken0 = prevFees[0].plus(swapFeeToken0);
  let swapFeesDailyCumulatedToken1 = prevFees[1].plus(swapFeeToken1);
  marketDayData.feesGenerated = [swapFeesDailyCumulatedToken0, swapFeesDailyCumulatedToken1];
  marketDayData.save();
}

/**
 * Get or create and init MarketDayData entity.
 * @param event
 * @returns
 */
function getMarketDayData(event: ethereum.Event): MarketDayData {
  let pairAddress = event.address.toHexString();
  let timestamp = event.block.timestamp.toI32();
  // UTC day is 86400 seconds long
  let dayID = timestamp / 86400;
  let dayPairID = pairAddress.concat("-").concat(BigInt.fromI32(dayID).toString());

  let marketDayData = MarketDayData.load(dayPairID);
  if (marketDayData === null) {
    marketDayData = new MarketDayData(dayPairID);
    marketDayData.timestamp = event.block.timestamp;
    marketDayData.market = pairAddress;
    marketDayData.inputTokensDailySwapInVolume = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.inputTokensDailySwapOutVolume = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.inputTokenDailyInflow = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.inputTokenDailyOutflow = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.outputTokenDailyInflowVolume = BigInt.fromI32(0);
    marketDayData.outputTokenDailyOutflowVolume = BigInt.fromI32(0);
    marketDayData.protocolFee = dataSource.context().getBigInt("protocolFee");
    marketDayData.feesGenerated = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.dailySwapTXs = BigInt.fromI32(0);
    marketDayData.dailyMintTXs = BigInt.fromI32(0);
    marketDayData.dailyBurnTXs = BigInt.fromI32(0);
    marketDayData.dayId = BigInt.fromI32(dayID);

    let pair = Pair.load(pairAddress);
    marketDayData.inputTokenTotalBalances = [pair.reserve0, pair.reserve1];
    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.save();
  }

  return marketDayData as MarketDayData;
}
