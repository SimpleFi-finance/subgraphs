import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts"

import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Burn as BurnEntity,
  Market as MarketEntity,
  Mint as MintEntity,
  Pair as PairEntity
} from "../generated/schema"

import {
  Burn,
  Mint,
} from "../generated/templates/UniswapV3Pool/UniswapV3Pool"

import {
  Transfer
} from "../generated/NonfungiblePositionManager/NonfungiblePositionManager"

import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common"

function getOrCreateMint(event: ethereum.Event, pair: PairEntity): MintEntity {
  let mintId = pair.id.concat("-").concat(event.transaction.hash.toHexString())
  let mint = MintEntity.load(mintId)
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(mintId)
  mint.pair = pair.id
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
  let accountAddress = Address.fromString(mint.to)
  let account = new AccountEntity(mint.to)
  let market = MarketEntity.load(mint.pair) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []

  // @todo: Shouldn't this be mint.to?? Which is the 'owner' of the position
  inputTokenAmounts.push(new TokenBalance(pair.token0, mint.from, mint.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, mint.from, mint.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  
  // @todo: is it ok to div(totalLiquidity)?
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalLiquidity)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalLiquidity)
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
    pair.totalLiquidity
  )

  store.remove('Mint', mint.id)
}

function createOrUpdatePositionOnBurn(event: ethereum.Event, pair: PairEntity, burn: BurnEntity): void {
  // let isComplete = burn.transferToPairEventApplied && burn.transferToZeroEventApplied && burn.burnEventApplied
  // if (!isComplete) {
  //   return
  // }

  // pair.lastIncompleteBurn = null
  // pair.save()

  let accountAddress = Address.fromString(burn.from)
  let account = new AccountEntity(burn.from)
  let market = MarketEntity.load(burn.pair) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pair, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pair.token0, burn.from, burn.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pair.token1, burn.from, burn.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalLiquidity)
  let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalLiquidity)
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
    pair.totalLiquidity
  )

  store.remove('Burn', burn.id)
}

/**
 * This is ERC721 transfer so it can only transfer the whole position all together
 * 
 * @param event 
 * @returns 
 */
export function handleTransfer(event: Transfer): void {
  let pairAddressHex = event.address.toHexString()
  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  let pair = PairEntity.load(pairAddressHex) as PairEntity

  // Doesn't care about minting or burning (cannot be transfered to ADDRESS_ZERO so it's safe)
  if (toHex === ADDRESS_ZERO || fromHex === ADDRESS_ZERO) {
    return
  }

  // update account balances
  let accountLiquidityFrom = getOrCreateLiquidity(pair, event.params.from)
  
  // It will be zero because it's an ERC721 so you transfer the whole position
  accountLiquidityFrom.balance = accountLiquidityFrom.balance = BigInt.fromI32(0)
  accountLiquidityFrom.save()

  if (fromHex != pairAddressHex) {
    let accountLiquidityTo = getOrCreateLiquidity(pair, event.params.to)
    accountLiquidityTo.balance = accountLiquidityTo.balance.plus(event.params.value)
    accountLiquidityTo.save()
  }

  // everything else
  if (fromHex != ADDRESS_ZERO && fromHex != pairAddressHex && toHex != pairAddressHex) {
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
}

export function handleMint(event: Mint): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let mint = getOrCreateMint(event, pair)

  mint.amount0 = event.params.amount0
  mint.amount1 = event.params.amount1
  mint.liquityAmount = event.params.amount
  // @todo: event.transaction.from or event.params.sender?
  mint.from = getOrCreateAccount(event.transaction.from).id
  mint.to = getOrCreateAccount(event.params.owner).id
  mint.save()

  pair.reserve0 = pair.reserve0.plus(event.params.amount0)
  pair.reserve1 = pair.reserve1.plus(event.params.amount1)
  pair.totalLiquidity = pair.totalLiquidity.plus(event.params.amount1 as BigInt)
  pair.save()

  createOrUpdatePositionOnMint(event, pair, mint)
}

// @todo: is closing position a two-transaction process? Burn + Claim tokens back
// @todo: there is such thing as from & to, it's only the position owner, saved as from
export function handleBurn(event: Burn): void {
  let pair = PairEntity.load(event.address.toHexString()) as PairEntity
  let burn = getOrCreateBurn(event, pair)

  burn.from = getOrCreateAccount(event.params.owner).id
  burn.amount0 = event.params.amount0
  burn.amount1 = event.params.amount1
  burn.liquityAmount = event.params.amount
  burn.save()

  pair.reserve0 = pair.reserve0.minus(event.params.amount0)
  pair.reserve1 = pair.reserve1.minus(event.params.amount1)
  pair.totalLiquidity = pair.totalLiquidity.minus(event.params.amount1 as BigInt)
  pair.save()

  createOrUpdatePositionOnBurn(event, pair, burn)
}
