import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import { Market as MarketEntity, Pool as PoolEntity } from "../generated/schema";
import {
    AddLiquidity,
    NewFee,
    RemoveLiquidity,
    RemoveLiquidityImbalance,
    RemoveLiquidityOne,
    TokenExchange
} from "../generated/TriPool/StableSwapPlain3";
import { getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance } from "./common";
import { createPoolSnaptshot, CurvePoolType, getOrCreatePool, getOtCreateAccountLiquidity } from "./curveCommon";


const coinCount = 3
let feeDenominator = BigInt.fromI32(10).pow(10)
let precision = BigInt.fromI32(10).pow(18)
let rates: BigInt[] = []
rates.push(BigInt.fromI32(10).pow(18))
rates.push(BigInt.fromI32(10).pow(30))
rates.push(BigInt.fromI32(10).pow(30))
let lpTokenAddress = Address.fromString("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")
let poolAddress = Address.fromString("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7")

let event = new ethereum.Event()
let block = new ethereum.Block()
block.number = BigInt.fromString("10809473")
block.timestamp = BigInt.fromString("1599414978")
block.hash = Bytes.fromHexString("0x2d76f2a7c4f083b9f889611734104cfb1efa0cfef8e52b753d9c719870a49b98") as Bytes
event.block = block
getOrCreatePool(event, poolAddress, lpTokenAddress, [], CurvePoolType.PLAIN, 3)

function calculateBalanceFromDi(pool: PoolEntity, di: BigInt, i: i32): BigInt {
    let dip = di.times(rates[i]).div(precision)
    let denominator = feeDenominator.minus(pool.fee)
    let adip = dip.times(feeDenominator).div(denominator)
    let feep = adip.times(pool.fee).div(feeDenominator)
    let adminFeep = feep.times(pool.adminFee).div(feeDenominator)
    let adi = adip.times(precision).div(rates[i])
    let adminFee = adminFeep.times(precision).div(rates[i])
    let oldBalances = pool.balances
    let balance = oldBalances[i].minus(adi).minus(adminFee)
    return balance
}

export function handleTokenExchange(event: TokenExchange): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    createPoolSnaptshot(event, pool)
    let newBalances = pool.balances
    let i = event.params.bought_id.toI32()
    let j = event.params.sold_id.toI32()
    newBalances[i] = newBalances[i].plus(event.params.tokens_bought)
    newBalances[j] = calculateBalanceFromDi(pool, event.params.tokens_sold, j)
    pool.balances = newBalances
    pool.save()
}

export function handleAddLiquidity(event: AddLiquidity): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    createPoolSnaptshot(event, pool)
    let oldTotalSupply = pool.totalSupply
    let oldBalances = pool.balances

    let token_amounts = event.params.token_amounts
    let fees = event.params.fees

    // Update balances and totalSupply
    let newBalances = oldBalances
    for (let i = 0; i < coinCount; i++) {
        newBalances[i] = newBalances[i].plus(token_amounts[i])
    }
    if (pool.totalSupply.gt(BigInt.fromI32(0))) {
        for (let i = 0; i < coinCount; i++) {
            if (fees[i].gt(BigInt.fromI32(0))) {
                let adminFee = fees[i].times(pool.adminFee).div(feeDenominator)
                newBalances[i] = newBalances[i].minus(adminFee)
            }
        }
    }
    pool.balances = newBalances
    pool.totalSupply = event.params.token_supply
    pool.save()

    // Update AccountLiquidity to track account LPToken balance
    let account = getOrCreateAccount(event.params.provider)
    let outputTokenAmount = event.params.token_supply.minus(oldTotalSupply)

    let accountLiquidity = getOtCreateAccountLiquidity(account, pool)
    accountLiquidity.balance = accountLiquidity.balance.plus(outputTokenAmount)
    accountLiquidity.save()

    // Update position
    let market = MarketEntity.load(pool.id) as MarketEntity
    let outputTokenBalance = accountLiquidity.balance
    let inputTokenAmounts: TokenBalance[] = []
    let inputTokenBalances: TokenBalance[] = []
    let coins = pool.coins
    for (let i = 0; i < coinCount; i++) {
        let token = coins[i]
        let inputAmount = token_amounts[i]
        let inputBalance = newBalances[i].times(accountLiquidity.balance).div(pool.totalSupply)
        inputTokenAmounts.push(new TokenBalance(token, account.id, inputAmount))
        inputTokenBalances.push(new TokenBalance(token, account.id, inputBalance))
    }
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
}

function handleRemoveLiquidityCommon(
    event: ethereum.Event,
    provider: Address,
    token_amounts: BigInt[],
    fees: BigInt[],
    token_supply: BigInt
): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    createPoolSnaptshot(event, pool)
    let oldTotalSupply = pool.totalSupply
    let oldBalances = pool.balances

    // Update balances and totalSupply
    let newBalances = oldBalances
    for (let i = 0; i < coinCount; i++) {
        newBalances[i] = newBalances[i].minus(token_amounts[i])
    }
    for (let i = 0; i < coinCount; i++) {
        if (fees[i].gt(BigInt.fromI32(0))) {
            let adminFee = fees[i].times(pool.adminFee).div(feeDenominator)
            newBalances[i] = newBalances[i].minus(adminFee)
        }
    }
    pool.balances = newBalances
    pool.totalSupply = token_supply
    pool.save()

    // Update AccountLiquidity to track account LPToken balance
    let account = getOrCreateAccount(provider)
    let outputTokenAmount = oldTotalSupply.minus(token_supply)

    let accountLiquidity = getOtCreateAccountLiquidity(account, pool)
    accountLiquidity.balance = accountLiquidity.balance.minus(outputTokenAmount)
    accountLiquidity.save()

    // Update position
    let market = MarketEntity.load(pool.id) as MarketEntity
    let outputTokenBalance = accountLiquidity.balance
    let inputTokenAmounts: TokenBalance[] = []
    let inputTokenBalances: TokenBalance[] = []
    let coins = pool.coins
    for (let i = 0; i < coinCount; i++) {
        let token = coins[i]
        let inputAmount = token_amounts[i]
        let inputBalance = newBalances[i].times(accountLiquidity.balance).div(pool.totalSupply)
        inputTokenAmounts.push(new TokenBalance(token, account.id, inputAmount))
        inputTokenBalances.push(new TokenBalance(token, account.id, inputBalance))
    }

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
}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
    handleRemoveLiquidityCommon(
        event,
        event.params.provider,
        event.params.token_amounts,
        event.params.fees,
        event.params.token_supply
    )
}

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
    handleRemoveLiquidityCommon(
        event,
        event.params.provider,
        event.params.token_amounts,
        event.params.fees,
        event.params.token_supply
    )
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    log.info("TODO HANDLING EVENT {}", ["RemoveLiquidityOne"])
}

export function handleNewFee(event: NewFee): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    createPoolSnaptshot(event, pool)
    pool.fee = event.params.fee
    pool.adminFee = event.params.admin_fee
    pool.save()
}