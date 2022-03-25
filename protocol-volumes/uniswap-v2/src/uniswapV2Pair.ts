import { BigInt, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { MarketDayData, Pair } from "../generated/schema";
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer,
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair";
import { FEE_DENOMINATOR } from "./constants";
import { TokenBalance } from "./utils";

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

  let inputTokenTotalBalances: TokenBalance[] = [
    new TokenBalance(pair.token0, pair.id, pair.reserve0),
    new TokenBalance(pair.token1, pair.id, pair.reserve1),
  ];
  marketDayData.inputTokenTotalBalances = inputTokenTotalBalances.map<string>((tb) =>
    tb.toString()
  );

  marketDayData.save();
}

/**
 * Handle mint by increasing reserve token inflow and burn TX counter.
 * @param event
 */
export function handleMint(event: Mint): void {
  let pairAddress = event.address.toHexString();
  let pair = Pair.load(pairAddress);

  // update daily inputTokenDailyInflow per token
  let marketDayData = getMarketDayData(event);

  let inflows = marketDayData.inputTokenDailyInflow;
  let prevToken0Inflow = TokenBalance.fromString(inflows[0]).balance;
  let prevToken1Inflow = TokenBalance.fromString(inflows[1]).balance;

  let inputTokenDailyInflow: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, prevToken0Inflow.plus(event.params.amount0)),
    new TokenBalance(pair.token1, pairAddress, prevToken1Inflow.plus(event.params.amount1)),
  ];
  marketDayData.inputTokenDailyInflow = inputTokenDailyInflow.map<string>((tb) => tb.toString());

  marketDayData.dailyMintTXs = marketDayData.dailyMintTXs.plus(BigInt.fromI32(1));
  marketDayData.save();
}

/**
 * Handle burn by increasing reserve token outflow and burn TX counter.
 * @param event
 */
export function handleBurn(event: Burn): void {
  let pairAddress = event.address.toHexString();
  let pair = Pair.load(pairAddress);

  // update daily inputTokenDailyOutflow per token
  let marketDayData = getMarketDayData(event);

  let outflows = marketDayData.inputTokenDailyOutflow;
  let prevToken0Outflow = TokenBalance.fromString(outflows[0]).balance;
  let prevToken1Outflow = TokenBalance.fromString(outflows[1]).balance;

  let inputTokenDailyOutflow: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, prevToken0Outflow.plus(event.params.amount0)),
    new TokenBalance(pair.token1, pairAddress, prevToken1Outflow.plus(event.params.amount1)),
  ];
  marketDayData.inputTokenDailyOutflow = inputTokenDailyOutflow.map<string>((tb) => tb.toString());

  marketDayData.dailyBurnTXs = marketDayData.dailyBurnTXs.plus(BigInt.fromI32(1));
  marketDayData.save();
}

/**
 * Handle swap by increasing daily swap volume per token and swap TX counter.
 * @param event
 */
export function handleSwap(event: Swap): void {
  let pairAddress = event.address.toHexString();
  let pair = Pair.load(pairAddress);

  // update daily swap volume per token
  let marketDayData = getMarketDayData(event);

  // update swap in volumes
  let swapInVolumes = marketDayData.inputTokensDailySwapInVolume;
  let swapInVolume0 = TokenBalance.fromString(swapInVolumes[0]).balance;
  let swapInVolume1 = TokenBalance.fromString(swapInVolumes[1]).balance;

  let inputTokensDailySwapInVolume: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapInVolume0.plus(event.params.amount0In)),
    new TokenBalance(pair.token1, pairAddress, swapInVolume1.plus(event.params.amount1In)),
  ];
  marketDayData.inputTokensDailySwapInVolume = inputTokensDailySwapInVolume.map<string>((tb) =>
    tb.toString()
  );

  // update swap out volumes
  let swapOutVolumes = marketDayData.inputTokensDailySwapOutVolume;
  let swapOutVolume0 = TokenBalance.fromString(swapOutVolumes[0]).balance;
  let swapOutVolume1 = TokenBalance.fromString(swapOutVolumes[1]).balance;

  let inputTokensDailySwapOutVolume: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapOutVolume0.plus(event.params.amount0Out)),
    new TokenBalance(pair.token1, pairAddress, swapOutVolume1.plus(event.params.amount1Out)),
  ];
  marketDayData.inputTokensDailySwapOutVolume = inputTokensDailySwapOutVolume.map<string>((tb) =>
    tb.toString()
  );

  // update TX counter
  marketDayData.dailySwapTXs = marketDayData.dailySwapTXs.plus(BigInt.fromI32(1));

  // update fees collected
  let swapFeeToken0 = event.params.amount0In.times(marketDayData.protocolFee).div(FEE_DENOMINATOR);
  let swapFeeToken1 = event.params.amount1In.times(marketDayData.protocolFee).div(FEE_DENOMINATOR);

  let prevFees = marketDayData.feesGenerated;
  let prevFees0 = TokenBalance.fromString(prevFees[0]).balance;
  let prevFees1 = TokenBalance.fromString(prevFees[1]).balance;

  let swapFeesDailyCumulatedToken0 = prevFees0.plus(swapFeeToken0);
  let swapFeesDailyCumulatedToken1 = prevFees1.plus(swapFeeToken1);

  let feesGenerated: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapFeesDailyCumulatedToken0),
    new TokenBalance(pair.token1, pairAddress, swapFeesDailyCumulatedToken1),
  ];
  marketDayData.feesGenerated = feesGenerated.map<string>((tb) => tb.toString());
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

  let pair = Pair.load(pairAddress);
  let marketDayData = MarketDayData.load(dayPairID);
  if (marketDayData === null) {
    marketDayData = new MarketDayData(dayPairID);
    marketDayData.timestamp = event.block.timestamp;
    marketDayData.market = pairAddress;

    let inputTokensDailySwapInVolume: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ];
    marketDayData.inputTokensDailySwapInVolume = inputTokensDailySwapInVolume.map<string>((tb) =>
      tb.toString()
    );

    let inputTokensDailySwapOutVolume: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ];
    marketDayData.inputTokensDailySwapOutVolume = inputTokensDailySwapOutVolume.map<string>((tb) =>
      tb.toString()
    );

    let inputTokenDailyInflow: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ];
    marketDayData.inputTokenDailyInflow = inputTokenDailyInflow.map<string>((tb) => tb.toString());

    let inputTokenDailyOutflow: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ];
    marketDayData.inputTokenDailyOutflow = inputTokenDailyOutflow.map<string>((tb) =>
      tb.toString()
    );

    marketDayData.outputTokenDailyInflowVolume = BigInt.fromI32(0);
    marketDayData.outputTokenDailyOutflowVolume = BigInt.fromI32(0);
    marketDayData.protocolFee = dataSource.context().getBigInt("protocolFee");

    let feesGenerated: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ];
    marketDayData.feesGenerated = feesGenerated.map<string>((tb) => tb.toString());

    marketDayData.dailySwapTXs = BigInt.fromI32(0);
    marketDayData.dailyMintTXs = BigInt.fromI32(0);
    marketDayData.dailyBurnTXs = BigInt.fromI32(0);
    marketDayData.dayId = BigInt.fromI32(dayID);

    let inputTokenTotalBalances: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, pair.reserve0),
      new TokenBalance(pair.token1, pairAddress, pair.reserve1),
    ];
    marketDayData.inputTokenTotalBalances = inputTokenTotalBalances.map<string>((tb) =>
      tb.toString()
    );

    marketDayData.outputTokenTotalBalance = pair.totalSupply;
    marketDayData.save();
  }

  return marketDayData as MarketDayData;
}
