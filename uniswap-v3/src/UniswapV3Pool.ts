import { Address, BigInt, ethereum, store, log } from "@graphprotocol/graph-ts"

import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Burn as BurnEntity,
  Market as MarketEntity,
  Mint as MintEntity,
  Pool as PoolEntity,
  UniPosition as UniPositionEntity,
} from "../generated/schema"

import {
  Burn,
  Mint,
} from "../generated/templates/UniswapV3Pool/UniswapV3Pool"

import {
  Collect,
  Transfer,
  IncreaseLiquidity,
  DecreaseLiquidity,
  NonfungiblePositionManager,
} from "../generated/NonfungiblePositionManager/NonfungiblePositionManager"

import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common"

import { 
  ONE_BI,
  ZERO_BI, 
  ADDRESS_ZERO,
  factoryContract,
} from "./constants"

function getOrCreateMint(event: ethereum.Event, pool: PoolEntity): MintEntity {
  let mintId = pool.id.concat("-").concat(event.transaction.hash.toHexString())
  let mint = MintEntity.load(mintId)
  if (mint != null) {
    return mint as MintEntity
  }

  mint = new MintEntity(mintId)
  mint.pool = pool.id
  mint.save()
  return mint as MintEntity
}

function getOrCreateBurn(event: ethereum.Event, pool: PoolEntity): BurnEntity {
  let burnId = pool.id.concat("-").concat(event.transaction.hash.toHexString())
  let burn = BurnEntity.load(burnId)
  if (burn != null) {
    return burn as BurnEntity
  }

  burn = new BurnEntity(burnId)
  burn.pool = pool.id
  burn.save()

  pool.lastIncompleteBurn = burn.id
  pool.save()
  return burn as BurnEntity
}

function getOrCreateLiquidity(pool: PoolEntity, accountAddress: Address): AccountLiquidityEntity {
  let id = pool.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityEntity
  }
  liqudity = new AccountLiquidityEntity(id)
  liqudity.pool = pool.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = ZERO_BI
  liqudity.save()
  return liqudity as AccountLiquidityEntity
}

function createOrUpdatePositionOnMint(event: ethereum.Event, pool: PoolEntity, mint: MintEntity): void {
  let accountAddress = Address.fromString(mint.to as string)
  let account = new AccountEntity(mint.to as string)
  let market = MarketEntity.load(mint.pool as string) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = mint.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []

  inputTokenAmounts.push(new TokenBalance(pool.token0, mint.from as string, mint.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pool.token1, mint.from as string, mint.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  
  let token0Balance = outputTokenBalance.times(pool.reserve0).div(pool.totalLiquidity)
  let token1Balance = outputTokenBalance.times(pool.reserve1).div(pool.totalLiquidity)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pool.token0, mint.to as string, token0Balance))
  inputTokenBalances.push(new TokenBalance(pool.token1, mint.to as string, token1Balance))

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
  marketInputTokenBalances.push(new TokenBalance(pool.token0, pool.id, pool.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pool.token1, pool.id, pool.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalLiquidity
  )

  store.remove('Mint', mint.id)
}

function createOrUpdatePositionOnBurn(event: ethereum.Event, pool: PoolEntity, burn: BurnEntity): void {
  let accountAddress = Address.fromString(burn.from as string)
  let account = new AccountEntity(burn.from as string)
  let market = MarketEntity.load(burn.pool as string) as MarketEntity
  let accountLiquidity = getOrCreateLiquidity(pool, accountAddress)

  let outputTokenAmount = burn.liquityAmount as BigInt
  let inputTokenAmounts: TokenBalance[] = []
  inputTokenAmounts.push(new TokenBalance(pool.token0, burn.from as string, burn.amount0 as BigInt))
  inputTokenAmounts.push(new TokenBalance(pool.token1, burn.from as string, burn.amount1 as BigInt))

  let outputTokenBalance = accountLiquidity.balance
  let token0Balance = outputTokenBalance.times(pool.reserve0).div(pool.totalLiquidity)
  let token1Balance = outputTokenBalance.times(pool.reserve1).div(pool.totalLiquidity)
  let inputTokenBalances: TokenBalance[] = []
  inputTokenBalances.push(new TokenBalance(pool.token0, burn.from as string, token0Balance))
  inputTokenBalances.push(new TokenBalance(pool.token1, burn.from as string, token1Balance))

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
  marketInputTokenBalances.push(new TokenBalance(pool.token0, pool.id, pool.reserve0))
  marketInputTokenBalances.push(new TokenBalance(pool.token1, pool.id, pool.reserve1))

  // Update market
  updateMarket(
    event,
    market,
    marketInputTokenBalances,
    pool.totalLiquidity
  )

  store.remove('Burn', burn.id)
}

function getOrFetchUniPosition(event: ethereum.Event, tokenId: BigInt): UniPositionEntity | null {
  let position = UniPositionEntity.load(tokenId.toString())
  if (position === null) {
    let contract = NonfungiblePositionManager.bind(event.address)
    let positionCall = contract.try_positions(tokenId)

    // the following call reverts in situations where the position is minted
    // and deleted in the same block - from my investigation this happens
    // in calls from  BancorSwap
    // (e.g. 0xf7867fa19aa65298fadb8d4f72d0daed5e836f3ba01f0b9b9631cdc6c36bed40)
    if (!positionCall.reverted) {
      let positionResult = positionCall.value
      let poolAddress = factoryContract.getPool(positionResult.value2, positionResult.value3, positionResult.value4)
      position = new UniPositionEntity(tokenId.toString())
      // The owner gets correctly updated in the Transfer handler
      position.owner = Address.fromString(ADDRESS_ZERO)
      position.pool = poolAddress.toHexString()
      position.token0 = positionResult.value2.toHexString()
      position.token1 = positionResult.value3.toHexString()
      position.liquidity = ZERO_BI
      position.depositedToken0 = ZERO_BI
      position.depositedToken1 = ZERO_BI
      position.withdrawnToken0 = ZERO_BI
      position.withdrawnToken1 = ZERO_BI
      position.collectedFeesToken0 = ZERO_BI
      position.collectedFeesToken1 = ZERO_BI
      position.feeGrowthInside0LastX128 = positionResult.value8
      position.feeGrowthInside1LastX128 = positionResult.value9
    }
  }

  return position
}

export function handleMint(event: Mint): void {
  let pool = PoolEntity.load(event.address.toHexString()) as PoolEntity
  let mint = getOrCreateMint(event, pool)

  mint.amount0 = event.params.amount0
  mint.amount1 = event.params.amount1
  mint.liquityAmount = event.params.amount
  mint.from = getOrCreateAccount(event.transaction.from).id
  mint.to = getOrCreateAccount(event.params.owner).id
  mint.save()

  pool.reserve0 = pool.reserve0.plus(event.params.amount0)
  pool.reserve1 = pool.reserve1.plus(event.params.amount1)

  // On first deposit, we add 1 to liquidity to avoid dividing by zero later
  if (pool.totalLiquidity.equals(ZERO_BI)) {
    //log.info("Mint event: Liquidity plus one", [])
    pool.totalLiquidity = pool.totalLiquidity.plus(ONE_BI)
  }

  pool.totalLiquidity = pool.totalLiquidity.plus(event.params.amount as BigInt)
  pool.save()

  //log.info("Mint event: Pool {} - Liquidity {} - Total Liquidity {} - TX {}", [pool.id, (event.params.amount as BigInt).toString(), pool.totalLiquidity.toString(), event.transaction.hash.toHexString()])

  createOrUpdatePositionOnMint(event, pool, mint)
}

// @todo: is closing position a two-transaction process? Burn + Claim tokens back
export function handleBurn(event: Burn): void {
  let pool = PoolEntity.load(event.address.toHexString()) as PoolEntity
  let burn = getOrCreateBurn(event, pool)

  burn.from = getOrCreateAccount(event.params.owner).id
  burn.amount0 = event.params.amount0
  burn.amount1 = event.params.amount1
  burn.liquityAmount = event.params.amount
  burn.save()

  let prevLiquidity = pool.totalLiquidity

  pool.reserve0 = pool.reserve0.minus(event.params.amount0)
  pool.reserve1 = pool.reserve1.minus(event.params.amount1)
  pool.totalLiquidity = pool.totalLiquidity.minus(event.params.amount as BigInt)
  pool.save()

  //log.info("Burn event: Pool {} - Liquidity {} - Prev Liquidity {} - Total Liquidity {} - TX {}", [pool.id, (event.params.amount as BigInt).toString(), prevLiquidity.toString(), pool.totalLiquidity.toString(), event.transaction.hash.toHexString()])

  createOrUpdatePositionOnBurn(event, pool, burn)
}

/**
 * This is ERC721 transfer so it can only transfer the whole position all together
 * NonfungiblePositionManager contract
 * 
 * @param event 
 * @returns 
 */
 export function handleTransfer(event: Transfer): void {
  let position = getOrFetchUniPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  // Update owner on transfer
  position.owner = event.params.to
  position.save()

  let poolAddressHex = position.pool
  let fromHex = event.params.from.toHexString()
  let toHex = event.params.to.toHexString()

  let pool = PoolEntity.load(poolAddressHex) as PoolEntity

  // Doesn't care about minting or burning (cannot be transfered to ADDRESS_ZERO so it's safe)
  if (toHex === ADDRESS_ZERO || fromHex === ADDRESS_ZERO) {
    return
  }

  // update account balances
  let accountLiquidityFrom = getOrCreateLiquidity(pool, event.params.from)
  let accountLiquidityTo = getOrCreateLiquidity(pool, event.params.to)

  if (fromHex != poolAddressHex) {
    accountLiquidityTo.balance = accountLiquidityTo.balance.plus(accountLiquidityFrom.balance)
    accountLiquidityTo.save()
  }
  
  let positionAmount = accountLiquidityFrom.balance;

  // It will be zero because it's an ERC721 so you transfer the whole position
  accountLiquidityFrom.balance = accountLiquidityFrom.balance = ZERO_BI
  accountLiquidityFrom.save()

  // everything else
  if (fromHex != ADDRESS_ZERO && fromHex != poolAddressHex && toHex != poolAddressHex) {
    let market = MarketEntity.load(pool.id) as MarketEntity

    let fromAccount = getOrCreateAccount(event.params.from)
    let fromOutputTokenBalance = accountLiquidityFrom.balance
    let fromInputTokenBalances: TokenBalance[] = []
    let fromToken0Balance = fromOutputTokenBalance.times(pool.reserve0).div(pool.totalLiquidity)
    let fromToken1Balance = fromOutputTokenBalance.times(pool.reserve1).div(pool.totalLiquidity)
    fromInputTokenBalances.push(new TokenBalance(pool.token0, fromAccount.id, fromToken0Balance))
    fromInputTokenBalances.push(new TokenBalance(pool.token1, fromAccount.id, fromToken1Balance))

    redeemFromMarket(
      event,
      fromAccount,
      market,
      positionAmount,
      [],
      [],
      fromOutputTokenBalance,
      fromInputTokenBalances,
      [],
      toHex
    )

    let toAccount = getOrCreateAccount(event.params.to)
    let toOutputTokenBalance = accountLiquidityTo.balance
    let toInputTokenBalances: TokenBalance[] = []
    let toToken0Balance = toOutputTokenBalance.times(pool.reserve0).div(pool.totalLiquidity)
    let toToken1Balance = toOutputTokenBalance.times(pool.reserve1).div(pool.totalLiquidity)
    toInputTokenBalances.push(new TokenBalance(pool.token0, toAccount.id, toToken0Balance))
    toInputTokenBalances.push(new TokenBalance(pool.token1, toAccount.id, toToken1Balance))

    investInMarket(
      event,
      toAccount,
      market,
      positionAmount,
      [],
      [],
      toOutputTokenBalance,
      toInputTokenBalances,
      [],
      fromHex
    )
  }
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  let position = getOrFetchUniPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  // temp fix (edge case comming from Official Uni v3)
  if (Address.fromString(position.pool).equals(Address.fromHexString('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248'))) {
    return
  }
  position.liquidity = position.liquidity.plus(event.params.liquidity)
  position.depositedToken0 = position.depositedToken0.plus(event.params.amount0)
  position.depositedToken1 = position.depositedToken1.plus(event.params.amount1)

  position.save()
}

export function handleDecreaseLiquidity(event: DecreaseLiquidity): void {
  let position = getOrFetchUniPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  // @todo: what is it temp fixing? (low priority)
  // temp fix (edge case comming from Official Uni v3)
  if (Address.fromString(position.pool).equals(Address.fromHexString('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248'))) {
    return
  }

  position.liquidity = position.liquidity.minus(event.params.liquidity)
  position.withdrawnToken0 = position.withdrawnToken0.plus(event.params.amount0)
  position.withdrawnToken1 = position.withdrawnToken1.plus(event.params.amount1)

  position.save()
}

export function handleCollect(event: Collect): void {
  let position = getOrFetchUniPosition(event, event.params.tokenId)
  
  // position was not able to be fetched
  if (position == null) {
    return
  }

  // temp fix (edge case comming from Official Uni v3)
  if (Address.fromString(position.pool).equals(Address.fromHexString('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248'))) {
    return
  }

  // @todo: do we need this?
  position.collectedToken0 = position.collectedToken0.plus(event.params.amount0)
  position.collectedToken1 = position.collectedToken1.plus(event.params.amount1)

  position.collectedFeesToken0 = position.collectedToken0.minus(position.withdrawnToken0)
  position.collectedFeesToken1 = position.collectedToken1.minus(position.withdrawnToken1)
  
  position.save()
}
