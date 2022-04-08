import { Address, BigInt, dataSource, ethereum, store } from "@graphprotocol/graph-ts"
import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Burn as BurnEntity,
  Market as MarketEntity,
  MarketDayData,
  Mint as MintEntity,
  Pair as PairEntity
} from "../generated/schema"
import {
  Burn,
  Mint,
  Swap,
  Sync,
  Transfer
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair"
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common"
import { FEE_DENOMINATOR } from "./constants"

function getOrCreateMint(event: ethereum.Event, pair: PairEntity): MintEntity {
  let mintId = pair.id.concat("-").concat(event.transaction.hash.toHexString())
  let mint = MintEntity.load(mintId)
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(mintId)
  mint.pair = pair.id
  mint.transferEventApplied = false
  mint.syncEventApplied = false
  mint.mintEventApplied = false
  mint.save()
  return mint as MintEntity
}

function getOrCreateBurn(event: ethereum.Event, pair: PairEntity): BurnEntity {
  let burnId = pair.id.concat("-").concat(event.transaction.hash.toHexString())
  let burn = BurnEntity.load(burnId)
  if (burn != null) {
    return burn as BurnEntity
  }

  burn = new BurnEntity(burnId)
  burn.transferToPairEventApplied = false
  burn.transferToZeroEventApplied = false
  burn.syncEventApplied = false
  burn.burnEventApplied = false
  burn.pair = pair.id
  burn.save()

  pair.lastIncompleteBurn = burn.id
  pair.save()
  return burn as BurnEntity
}

function getOrCreateLiquidity(pair: PairEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = pair.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.pair = pair.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function createOrUpdatePositionOnMint(event: ethereum.Event, pair: PairEntity, mint: MintEntity): void {
  let isComplete = mint.transferEventApplied && mint.syncEventApplied && mint.mintEventApplied
  if (!isComplete) {
    return
  }

  let accountAddress = Address.fromString(mint.to)
  let account = new AccountEntity(mint.to)
  let market = MarketEntity.load(mint.pair) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pair.token0, mint.from, mint.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, mint.from, mint.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pair.token0, mint.to, token0Balance))
  inputTokenBalances.push(new TokenBalance(pair.token1, mint.to, token1Balance))

  investInMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // update market
  let marketInputTokenBalances: TokenBalance[] = []
  marketInputTokenBalances.push(new TokenBalance(pair.token0, pair.id, pair.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pair.token1, pair.id, pair.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pair.totalSupply
  )

  store.remove('Mint', mint.id)
}

function createOrUpdatePositionOnBurn(event: ethereum.Event, pair: PairEntity, burn: BurnEntity): void {
  let isComplete = burn.transferToPairEventApplied && burn.transferToZeroEventApplied && burn.syncEventApplied && burn.burnEventApplied
  if (!isComplete) {
    return
  }

  pair.lastIncompleteBurn = null
  pair.save()

  let accountAddress = Address.fromString(burn.from)
  let account = new AccountEntity(burn.from)
  let market = MarketEntity.load(burn.pair) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pair.token0, burn.to, burn.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, burn.to, burn.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pair.token0, burn.from, token0Balance))
  inputTokenBalances.push(new TokenBalance(pair.token1, burn.from, token1Balance))

  redeemFromMarket(
    event,
    account,
    market,
    outputTokenAmount,
    inputTokenAmounts,
    [],
    outputTokenBalance,
    inputTokenBalances,
    [],
    null
  )

  // update market
  let marketInputTokenBalances: TokenBalance[] = []
  marketInputTokenBalances.push(new TokenBalance(pair.token0, pair.id, pair.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pair.token1, pair.id, pair.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pair.totalSupply
  )

  store.remove('Burn', burn.id)
}

function transferLPToken(event: ethereum.Event, pair: PairEntity, from: Address, to: Address, amount: BigInt): void {
  let market = MarketEntity.load(pair.id) as MarketEntity

  let fromAccount = getOrCreateAccount(from)
  let accountLiquidityFrom = getOrCreateLiquidity(pair, from)
  let fromOutputTokenBalance = accountLiquidityFrom.balance
  let fromInputTokenBalances: TokenBalance[] = []
  let fromToken0Balance = fromOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let fromToken1Balance = fromOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  fromInputTokenBalances.push(new TokenBalance(pair.token0, fromAccount.id, fromToken0Balance))
  fromInputTokenBalances.push(new TokenBalance(pair.token1, fromAccount.id, fromToken1Balance))

  redeemFromMarket(
    event,
    fromAccount,
    market,
    amount,
    [],
    [],
    fromOutputTokenBalance,
    fromInputTokenBalances,
    [],
    to.toHexString()
  )

  let toAccount = getOrCreateAccount(to)
  let accountLiquidityTo = getOrCreateLiquidity(pair, to)
  let toOutputTokenBalance = accountLiquidityTo.balance
  let toInputTokenBalances: TokenBalance[] = []
  let toToken0Balance = toOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
  let toToken1Balance = toOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
  toInputTokenBalances.push(new TokenBalance(pair.token0, toAccount.id, toToken0Balance))
  toInputTokenBalances.push(new TokenBalance(pair.token1, toAccount.id, toToken1Balance))

  investInMarket(
    event,
    toAccount,
    market,
    amount,
    [],
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from.toHexString()
  )
}

function checkIncompleteBurnFromLastTransaction(event: ethereum.Event, pair: PairEntity): void {
  // Check if pair has an incomplete burn
  if (pair.lastIncompleteBurn == null) {
    return
  }

  // Same transaction events being processed
  if (pair.lastIncompleteBurn == event.transaction.hash.toHexString()) {
    return
  }

  // New transaction processing has started without completing burn event
  let burnId = pair.id.concat("-").concat(pair.lastIncompleteBurn)
  let burn = BurnEntity.load(burnId)
  // Check if transfer to pair happened as an incomplete burn
  if (burn != null && burn.from != null && burn.liquityAmount != null && burn.transferToPairEventApplied) {
    let from = burn.from as string
    let amount = burn.liquityAmount as BigInt
    transferLPToken(event, pair, Address.fromString(from), event.address, amount)
  }

  // reset lastIncompleteBurn
  pair.lastIncompleteBurn = null
  pair.save()
}

export function handleTransfer(event: Transfer): void {
  if (event.params.value == BigInt.fromI32(0)) {
    return
  }

  let pairAddressHex = event.address.toHexString()
  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  let pair = PairEntity.load(pairAddressHex) as PairEntity

  // update account balances
  if (fromHex != ADDRESS_ZERO) {
    let accountLiquidityFrom = getOrCreateLiquidity(pair, event.params.from)
    accountLiquidityFrom.balance = accountLiquidityFrom.balance.minus(event.params.value)
    accountLiquidityFrom.save()
  }

  if (fromHex != pairAddressHex) {
    let accountLiquidityTo = getOrCreateLiquidity(pair, event.params.to)
    accountLiquidityTo.balance = accountLiquidityTo.balance.plus(event.params.value)
    accountLiquidityTo.save()
  }

  // Check if transfer it's a mint or burn or transfer transaction
  // minting new LP tokens
  if (fromHex == ADDRESS_ZERO) {
    // Initial minimum liquidity locking of 1000
    if (toHex == ADDRESS_ZERO) {
      pair.totalSupply = pair.totalSupply.plus(event.params.value)
      pair.save()

      // update inflow (mint) volume
      let marketDayData = getMarketDayData(event)
      marketDayData.outputTokenTotalBalance = pair.totalSupply
      marketDayData.outputTokenDailyInflowVolume = marketDayData.outputTokenDailyInflowVolume.plus(
        event.params.value
      )
      marketDayData.save()
    }

    let mint = getOrCreateMint(event, pair)
    mint.transferEventApplied = true
    mint.from = getOrCreateAccount(event.transaction.from).id
    mint.to = getOrCreateAccount(event.params.to).id
    mint.liquityAmount = event.params.value
    mint.save()
    createOrUpdatePositionOnMint(event, pair, mint)
  }

  // send to pair contract before burn method call
  if (fromHex != ADDRESS_ZERO && toHex == pairAddressHex) {
    let burn = getOrCreateBurn(event, pair)
    burn.transferToPairEventApplied = true
    burn.from = getOrCreateAccount(event.params.from).id
    burn.liquityAmount = event.params.value
    burn.save()
    createOrUpdatePositionOnBurn(event, pair, burn)
  }

  // internal _burn method call
  if (fromHex == pairAddressHex && toHex == ADDRESS_ZERO) {
    let burn = getOrCreateBurn(event, pair)
    burn.transferToZeroEventApplied = true
    burn.liquityAmount = event.params.value
    burn.save()
    createOrUpdatePositionOnBurn(event, pair, burn)
  }

  // everything else
  if (fromHex != ADDRESS_ZERO && fromHex != pairAddressHex && toHex != pairAddressHex) {
    transferLPToken(event, pair, event.params.from, event.params.to, event.params.value)
  }

  checkIncompleteBurnFromLastTransaction(event, pair)
}

export function handleMint(event: Mint): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let mint = getOrCreateMint(event, pair)
  mint.mintEventApplied = true
  mint.amount0 = event.params.amount0
  mint.amount1 = event.params.amount1
  mint.save()
  createOrUpdatePositionOnMint(event, pair, mint)
  checkIncompleteBurnFromLastTransaction(event, pair)

  // update daily inputTokenDailyInflow per token
  let marketDayData = getMarketDayData(event)

  let inflows = marketDayData.inputTokenDailyInflow
  let prevToken0Inflow = TokenBalance.fromString(inflows[0]).balance
  let prevToken1Inflow = TokenBalance.fromString(inflows[1]).balance

  let inputTokenDailyInflow: TokenBalance[] = [
    new TokenBalance(pair.token0, pair.id, prevToken0Inflow.plus(event.params.amount0)),
    new TokenBalance(pair.token1, pair.id, prevToken1Inflow.plus(event.params.amount1)),
  ]
  marketDayData.inputTokenDailyInflow = inputTokenDailyInflow.map<string>((tb) => tb.toString())
  marketDayData.dailyMintTXs = marketDayData.dailyMintTXs.plus(BigInt.fromI32(1))
  marketDayData.save()
}

export function handleBurn(event: Burn): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let burn = getOrCreateBurn(event, pair)
  burn.burnEventApplied = true
  burn.to = getOrCreateAccount(event.params.to).id
  burn.amount0 = event.params.amount0
  burn.amount1 = event.params.amount1
  burn.save()
  createOrUpdatePositionOnBurn(event, pair, burn)
  checkIncompleteBurnFromLastTransaction(event, pair)

  // update daily inputTokenDailyOutflow per token
  let marketDayData = getMarketDayData(event)

  let outflows = marketDayData.inputTokenDailyOutflow
  let prevToken0Outflow = TokenBalance.fromString(outflows[0]).balance
  let prevToken1Outflow = TokenBalance.fromString(outflows[1]).balance

  let inputTokenDailyOutflow: TokenBalance[] = [
    new TokenBalance(pair.token0, pair.id, prevToken0Outflow.plus(event.params.amount0)),
    new TokenBalance(pair.token1, pair.id, prevToken1Outflow.plus(event.params.amount1)),
  ]
  marketDayData.inputTokenDailyOutflow = inputTokenDailyOutflow.map<string>((tb) => tb.toString())
  marketDayData.dailyBurnTXs = marketDayData.dailyBurnTXs.plus(BigInt.fromI32(1))
  marketDayData.save()
}

export function handleSync(event: Sync): void {
  let transactionHash = event.transaction.hash.toHexString()

  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  pair.reserve0 = event.params.reserve0
  pair.reserve1 = event.params.reserve1
  pair.save()

  // update inputTokenTotalBalances in marketDayData
  let marketDayData = getMarketDayData(event)
  let inputTokenTotalBalances: TokenBalance[] = [
    new TokenBalance(pair.token0, pair.id, pair.reserve0),
    new TokenBalance(pair.token1, pair.id, pair.reserve1),
  ]
  marketDayData.inputTokenTotalBalances = inputTokenTotalBalances.map<string>((tb) =>
    tb.toString()
  )
  marketDayData.save()

  let isSyncOnly = true

  let mintId = pair.id.concat("-").concat(transactionHash)
  let possibleMint = MintEntity.load(mintId)
  if (possibleMint != null) {
    isSyncOnly = false
    let mint = possibleMint as MintEntity
    mint.syncEventApplied = true
    mint.save()

    pair.totalSupply = pair.totalSupply.plus(mint.liquityAmount as BigInt)
    pair.save()

    // update inflow (mint) volume
    let marketDayData = getMarketDayData(event)
    marketDayData.outputTokenTotalBalance = pair.totalSupply
    marketDayData.outputTokenDailyInflowVolume = marketDayData.outputTokenDailyInflowVolume.plus(
      mint.liquityAmount as BigInt
    )
    marketDayData.save()

    createOrUpdatePositionOnMint(event, pair, mint)
  }

  let burnId = pair.id.concat("-").concat(transactionHash)
  let possibleBurn = BurnEntity.load(burnId)
  if (possibleBurn != null) {
    isSyncOnly = false
    let burn = possibleBurn as BurnEntity
    burn.syncEventApplied = true
    burn.save()

    pair.totalSupply = pair.totalSupply.minus(burn.liquityAmount as BigInt)
    pair.save()

    // update outflow (burn) volume
    let marketDayData = getMarketDayData(event)
    marketDayData.outputTokenTotalBalance = pair.totalSupply
    marketDayData.outputTokenDailyOutflowVolume = marketDayData.outputTokenDailyOutflowVolume.plus(
      burn.liquityAmount as BigInt
    )
    marketDayData.save()

    createOrUpdatePositionOnBurn(event, pair, burn)
  }

  if (isSyncOnly) {
    let inputTokenBalances: TokenBalance[] = []
    inputTokenBalances.push(new TokenBalance(pair.token0, pair.id, pair.reserve0))
    inputTokenBalances.push(new TokenBalance(pair.token1, pair.id, pair.reserve1))

    // Update market
    let market = MarketEntity.load(event.address.toHexString()) as MarketEntity
    updateMarket(
      event,
      market,
      inputTokenBalances,
      pair.totalSupply
    )
  }

  checkIncompleteBurnFromLastTransaction(event, pair)
}

/**
 * Handle swap by increasing daily swap volume per token and swap TX counter.
 * @param event
 */
export function handleSwap(event: Swap): void {
  let pairAddress = event.address.toHexString()
  let pair = PairEntity.load(pairAddress) as PairEntity

  // update daily swap volume per token
  let marketDayData = getMarketDayData(event)

  // update swap in volumes
  let swapInVolumes = marketDayData.inputTokensDailySwapInVolume
  let swapInVolume0 = TokenBalance.fromString(swapInVolumes[0]).balance
  let swapInVolume1 = TokenBalance.fromString(swapInVolumes[1]).balance

  let inputTokensDailySwapInVolume: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapInVolume0.plus(event.params.amount0In)),
    new TokenBalance(pair.token1, pairAddress, swapInVolume1.plus(event.params.amount1In)),
  ]
  marketDayData.inputTokensDailySwapInVolume = inputTokensDailySwapInVolume.map<string>((tb) =>
    tb.toString()
  )

  // update swap out volumes
  let swapOutVolumes = marketDayData.inputTokensDailySwapOutVolume
  let swapOutVolume0 = TokenBalance.fromString(swapOutVolumes[0]).balance
  let swapOutVolume1 = TokenBalance.fromString(swapOutVolumes[1]).balance

  let inputTokensDailySwapOutVolume: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapOutVolume0.plus(event.params.amount0Out)),
    new TokenBalance(pair.token1, pairAddress, swapOutVolume1.plus(event.params.amount1Out)),
  ]
  marketDayData.inputTokensDailySwapOutVolume = inputTokensDailySwapOutVolume.map<string>((tb) =>
    tb.toString()
  )

  // update TX counter
  marketDayData.dailySwapTXs = marketDayData.dailySwapTXs.plus(BigInt.fromI32(1))

  // update fees collected
  let swapFeeToken0 = event.params.amount0In
    .times(marketDayData.protocolFee)
    .div(BigInt.fromI32(FEE_DENOMINATOR))
  let swapFeeToken1 = event.params.amount1In
    .times(marketDayData.protocolFee)
    .div(BigInt.fromI32(FEE_DENOMINATOR))

  let prevFees = marketDayData.feesGenerated
  let prevFees0 = TokenBalance.fromString(prevFees[0]).balance
  let prevFees1 = TokenBalance.fromString(prevFees[1]).balance

  let swapFeesDailyCumulatedToken0 = prevFees0.plus(swapFeeToken0)
  let swapFeesDailyCumulatedToken1 = prevFees1.plus(swapFeeToken1)

  let feesGenerated: TokenBalance[] = [
    new TokenBalance(pair.token0, pairAddress, swapFeesDailyCumulatedToken0),
    new TokenBalance(pair.token1, pairAddress, swapFeesDailyCumulatedToken1),
  ]
  marketDayData.feesGenerated = feesGenerated.map<string>((tb) => tb.toString())
  marketDayData.save()
}

/**
 * Get/create and init MarketDayData entity.
 * @param event
 * @returns
 */
function getMarketDayData(event: ethereum.Event): MarketDayData {
  let pairAddress = event.address.toHexString()
  let timestamp = event.block.timestamp.toI32()
  // UTC day is 86400 seconds long
  let dayID = timestamp / 86400
  let dayPairID = pairAddress.concat("-").concat(BigInt.fromI32(dayID).toString())

  let pair = PairEntity.load(pairAddress) as PairEntity
  let marketDayData = MarketDayData.load(dayPairID)
  if (marketDayData == null) {
    marketDayData = new MarketDayData(dayPairID)
    marketDayData.timestamp = event.block.timestamp
    marketDayData.market = pairAddress

    let inputTokensDailySwapInVolume: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ]
    marketDayData.inputTokensDailySwapInVolume = inputTokensDailySwapInVolume.map<string>((tb) =>
      tb.toString()
    )

    let inputTokensDailySwapOutVolume: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ]
    marketDayData.inputTokensDailySwapOutVolume = inputTokensDailySwapOutVolume.map<string>((tb) =>
      tb.toString()
    )

    let inputTokenDailyInflow: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ]
    marketDayData.inputTokenDailyInflow = inputTokenDailyInflow.map<string>((tb) => tb.toString())

    let inputTokenDailyOutflow: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ]
    marketDayData.inputTokenDailyOutflow = inputTokenDailyOutflow.map<string>((tb) =>
      tb.toString()
    )

    marketDayData.outputTokenDailyInflowVolume = BigInt.fromI32(0)
    marketDayData.outputTokenDailyOutflowVolume = BigInt.fromI32(0)
    marketDayData.protocolFee = dataSource.context().getBigInt("protocolFee")

    let feesGenerated: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, BigInt.fromI32(0)),
      new TokenBalance(pair.token1, pairAddress, BigInt.fromI32(0)),
    ]
    marketDayData.feesGenerated = feesGenerated.map<string>((tb) => tb.toString())

    marketDayData.dailySwapTXs = BigInt.fromI32(0)
    marketDayData.dailyMintTXs = BigInt.fromI32(0)
    marketDayData.dailyBurnTXs = BigInt.fromI32(0)
    marketDayData.dayId = BigInt.fromI32(dayID)

    let inputTokenTotalBalances: TokenBalance[] = [
      new TokenBalance(pair.token0, pairAddress, pair.reserve0),
      new TokenBalance(pair.token1, pairAddress, pair.reserve1),
    ]
    marketDayData.inputTokenTotalBalances = inputTokenTotalBalances.map<string>((tb) =>
      tb.toString()
    )

    marketDayData.outputTokenTotalBalance = pair.totalSupply
    marketDayData.save()
  }

  return marketDayData as MarketDayData
}
