import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
    LPToken as LPTokenEntity,
    LPTokenTransferToZero as LPTokenTransferToZeroEntity,
    Market as MarketEntity,
    Pool as PoolEntity,
    RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity
} from "../generated/schema";
import { CurveLPToken } from '../generated/templates';
import { Transfer } from "../generated/TriPool/ERC20";
import {
    AddLiquidity,
    NewFee,
    RampA,
    RemoveLiquidity,
    RemoveLiquidityImbalance,
    RemoveLiquidityOne,
    Remove_liquidity_one_coinCall,
    StopRampA,
    TokenExchange
} from "../generated/TriPool/StableSwapPlain3";
import { ADDRESS_ZERO, getOrCreateAccount, investInMarket, redeemFromMarket, TokenBalance } from "./common";
import { createPoolSnaptshot, getOrCreatePool, getOtCreateAccountLiquidity } from "./curveCommon";
import { CurvePoolType, getDYFeeOnOneCoinWithdrawal, PoolConstants } from './stableSwapLib';

const coinCount = 3
let feeDenominator = BigInt.fromI32(10).pow(10)
let precision = BigInt.fromI32(10).pow(18)
let lendingPrecision = BigInt.fromI32(10).pow(18)
let rates: BigInt[] = []
rates.push(BigInt.fromI32(10).pow(18))
rates.push(BigInt.fromI32(10).pow(30))
rates.push(BigInt.fromI32(10).pow(30))
let lpTokenAddress = Address.fromString("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")
let poolAddress = Address.fromString("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7")
let poolType = CurvePoolType.PLAIN

let poolConstants: PoolConstants = {
    coinCount,
    feeDenominator,
    precision,
    lendingPrecision,
    rates,
    lpTokenAddress,
    poolAddress,
    poolType
}

let fakeEvent = new ethereum.Event()
let fakeBlock = new ethereum.Block()
fakeBlock.number = BigInt.fromString("10809473")
fakeBlock.timestamp = BigInt.fromString("1599414978")
fakeBlock.hash = Bytes.fromHexString("0x2d76f2a7c4f083b9f889611734104cfb1efa0cfef8e52b753d9c719870a49b98") as Bytes
fakeEvent.block = fakeBlock
getOrCreatePool(fakeEvent, poolAddress, lpTokenAddress, [], CurvePoolType.PLAIN, 3)

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

function handleRemoveLiquidityCommon(
    event: ethereum.Event,
    pool: PoolEntity,
    provider: Address,
    token_amounts: BigInt[],
    fees: BigInt[],
    token_supply: BigInt
): void {
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
    pool.lastTransferToZero = null
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

function transferLPToken(event: ethereum.Event, pool: PoolEntity, from: Address, to: Address, value: BigInt): void {
    let market = MarketEntity.load(pool.id) as MarketEntity
    let coins = pool.coins
    let balances = pool.balances

    // Redeem from transfer.from account
    let fromAccount = getOrCreateAccount(from)
    let fromOutputTokenAmount = value

    let fromAccountLiquidity = getOtCreateAccountLiquidity(fromAccount, pool)
    fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(fromOutputTokenAmount)
    fromAccountLiquidity.save()

    let fromOutputTokenBalance = fromAccountLiquidity.balance
    let fromInputTokenBalances: TokenBalance[] = []
    for (let i = 0; i < coinCount; i++) {
        let token = coins[i]
        let inputBalance = balances[i].times(fromAccountLiquidity.balance).div(pool.totalSupply)
        fromInputTokenBalances.push(new TokenBalance(token, fromAccount.id, inputBalance))
    }

    redeemFromMarket(
        event,
        fromAccount,
        market,
        fromOutputTokenAmount,
        [],
        [],
        fromOutputTokenBalance,
        fromInputTokenBalances,
        [],
        to.toHexString()
    )

    // Invest from transfer.to account
    let toAccount = getOrCreateAccount(to)
    let toOutputTokenAmount = value

    let toAccountLiquidity = getOtCreateAccountLiquidity(toAccount, pool)
    toAccountLiquidity.balance = toAccountLiquidity.balance.minus(toOutputTokenAmount)
    toAccountLiquidity.save()

    let toOutputTokenBalance = toAccountLiquidity.balance
    let toInputTokenBalances: TokenBalance[] = []
    for (let i = 0; i < coinCount; i++) {
        let token = coins[i]
        let inputBalance = balances[i].times(toAccountLiquidity.balance).div(pool.totalSupply)
        toInputTokenBalances.push(new TokenBalance(token, toAccount.id, inputBalance))
    }

    investInMarket(
        event,
        toAccount,
        market,
        toOutputTokenAmount,
        [],
        [],
        toOutputTokenBalance,
        toInputTokenBalances,
        [],
        from.toHexString()
    )
}

function getOrCreateRemoveLiquidityOneEvent(id: string, pool: PoolEntity): RemoveLiqudityOneEventEntity {
    let removeLiquidityEvent = RemoveLiqudityOneEventEntity.load(id)
    if (removeLiquidityEvent != null) {
        return removeLiquidityEvent as RemoveLiqudityOneEventEntity
    }
    removeLiquidityEvent = new RemoveLiqudityOneEventEntity(id)
    removeLiquidityEvent.pool = pool.id
    removeLiquidityEvent.eventApplied = false
    removeLiquidityEvent.callApplied = false
    removeLiquidityEvent.save()

    return removeLiquidityEvent as RemoveLiqudityOneEventEntity
}

function handleRLOEEntityUpdate(event: ethereum.Event, entity: RemoveLiqudityOneEventEntity, pool: PoolEntity): void {
    if (!entity.eventApplied || !entity.callApplied) {
        return
    }

    let tokenAmount = entity.tokenAmount as BigInt
    let i = entity.i as i32
    let dy = entity.dy as BigInt

    let provider = Address.fromString(entity.account)
    let tokenAmounts: BigInt[] = []
    let fees: BigInt[] = []

    // Calculate fee for i coin
    let feeI = getDYFeeOnOneCoinWithdrawal(
        event.block,
        pool,
        poolConstants,
        tokenAmount,
        i,
        dy
    )

    for (let j = 0; j < coinCount; j++) {
        if (j == i) {
            tokenAmounts[j] = dy
            fees[j] = feeI
        } else {
            tokenAmounts[j] = BigInt.fromI32(0)
            fees[j] = BigInt.fromI32(0)
        }
    }

    let totalSupply = pool.totalSupply.minus(tokenAmount)

    handleRemoveLiquidityCommon(
        event,
        pool,
        provider,
        tokenAmounts,
        fees,
        totalSupply
    )
}

function checkPendingTransferTozero(event: ethereum.Event, pool: PoolEntity): void {
    // Check if pool has an incomplete burn
    if (pool.lastTransferToZero == null) {
        return
    }

    // Same transaction events being processed
    if (pool.lastTransferToZero == event.transaction.hash.toHexString()) {
        return
    }

    // New transaction processing has started without burn event
    // its a manual transfer to zero address
    let transferTozero = LPTokenTransferToZeroEntity.load(event.transaction.hash.toHexString())
    transferLPToken(event, pool, transferTozero.from as Address, transferTozero.to as Address, transferTozero.value)

    pool.lastTransferToZero = null
    pool.save()
}

export function handleTokenExchange(event: TokenExchange): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)
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
    checkPendingTransferTozero(event, pool)
    // Listen on LPToken transfer events
    if (pool.totalSupply == BigInt.fromI32(0)) {
        CurveLPToken.create(pool.lpToken as Address)
    }

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

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)

    handleRemoveLiquidityCommon(
        event,
        pool,
        event.params.provider,
        event.params.token_amounts,
        event.params.fees,
        event.params.token_supply
    )
}

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)

    handleRemoveLiquidityCommon(
        event,
        pool,
        event.params.provider,
        event.params.token_amounts,
        event.params.fees,
        event.params.token_supply
    )
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)

    let id = event.transaction.hash.toHexString().concat("-").concat(pool.id)
    let entity = getOrCreateRemoveLiquidityOneEvent(id, pool)
    entity.eventApplied = true
    entity.account = getOrCreateAccount(event.params.provider).id
    entity.tokenAmount = event.params.token_amount
    entity.dy = event.params.coin_amount
    entity.save()

    handleRLOEEntityUpdate(event, entity, pool)
}

export function handleRemoveLiquidityOneCall(call: Remove_liquidity_one_coinCall): void {
    let pool = PoolEntity.load(call.to.toHexString()) as PoolEntity

    let id = call.transaction.hash.toHexString().concat("-").concat(pool.id)
    let entity = getOrCreateRemoveLiquidityOneEvent(id, pool)
    entity.i = call.inputs.i.toI32()
    entity.save()

    let event = new ethereum.Event()
    event.block = call.block
    event.transaction = call.transaction
    handleRLOEEntityUpdate(event, entity, pool)
}

export function handleNewFee(event: NewFee): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)
    createPoolSnaptshot(event, pool)

    pool.fee = event.params.fee
    pool.adminFee = event.params.admin_fee
    pool.save()
}

export function handleRampA(event: RampA): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)
    createPoolSnaptshot(event, pool)

    pool.initialA = event.params.old_A
    pool.initialATime = event.params.initial_time
    pool.futureA = event.params.new_A
    pool.futureATime = event.params.future_time
    pool.save()
}

export function handleStopRampA(event: StopRampA): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)
    createPoolSnaptshot(event, pool)

    pool.initialA = event.params.A
    pool.initialATime = event.params.t
    pool.futureA = event.params.A
    pool.futureATime = event.params.t
    pool.save()
}

export function handleTransfer(event: Transfer): void {
    if (event.params.value == BigInt.fromI32(0) || event.params.from.toHexString() == ADDRESS_ZERO) {
        return
    }

    let lpToken = LPTokenEntity.load(event.address.toHexString()) as LPTokenEntity
    let pool = getOrCreatePool(event, Address.fromString(lpToken.pool), lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)

    if (event.params.to.toHexString() == ADDRESS_ZERO) {
        let transferTozero = new LPTokenTransferToZeroEntity(event.transaction.hash.toHexString())
        transferTozero.from = event.params.from
        transferTozero.to = event.params.to
        transferTozero.value = event.params.value
        transferTozero.save()

        pool.lastTransferToZero = transferTozero.id
        pool.save()

        return
    }

    transferLPToken(event, pool, event.params.from, event.params.to, event.params.value)
}