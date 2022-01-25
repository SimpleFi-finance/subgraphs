import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { MarketDayData, Pair } from "../generated/schema";
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

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
    marketDayData.outputTokenDailyOutflowVolume = marketDayData.outputTokenDailyOutflowVolume.plus(
      supplyChange
    );
    marketDayData.save();
  }
}

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString()) as Pair;
  pair.reserve0 = event.params.reserve0;
  pair.reserve1 = event.params.reserve1;
  pair.save();
}

export function handleMint(event: Mint): void {
  let marketDayData = getMarketDayData(event);
  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

export function handleBurn(event: Burn): void {
  let marketDayData = getMarketDayData(event);
  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

export function handleSwap(event: Swap): void {
  let marketDayData = getMarketDayData(event);
  marketDayData.dailyTransactions = marketDayData.dailyTransactions.plus(BigInt.fromI32(1));
  marketDayData.save();
}

function getMarketDayData(event: ethereum.Event): MarketDayData {
  let pairAddress = event.address.toHexString();
  let timestamp = event.block.timestamp.toI32();
  let dayID = timestamp / 86400;
  let dayPairID = pairAddress.concat("-").concat(BigInt.fromI32(dayID).toString());

  let marketDayData = MarketDayData.load(dayPairID);
  if (marketDayData === null) {
    marketDayData = new MarketDayData(dayPairID);
    marketDayData.timestamp = event.block.timestamp;
    marketDayData.market = pairAddress;
    marketDayData.inputTokensDailyVolume = [BigInt.fromI32(0), BigInt.fromI32(0)];
    marketDayData.outputTokenDailyInflowVolume = BigInt.fromI32(0);
    marketDayData.outputTokenDailyOutflowVolume = BigInt.fromI32(0);
    marketDayData.dailyTransactions = BigInt.fromI32(0);
  }

  return marketDayData as MarketDayData;
}
