import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
    LPToken as LPTokenEntity,
    LPTokenTransferToZero as LPTokenTransferToZeroEntity,
    Market as MarketEntity,
    Pool as PoolEntity,
    RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity
} from "../generated/schema"
import { TriPoolLPToken } from "../generated/templates"
import { Transfer } from "../generated/TriPool/ERC20"
import {
    AddLiquidity,
    RemoveLiquidity,
    RemoveLiquidityImbalance,
    RemoveLiquidityOne,
    Remove_liquidity_one_coinCall,
    TokenExchange
} from "../generated/TriPool/StableSwapPlain3"
import {
    ADDRESS_ZERO,
    getOrCreateAccount,
    investInMarket,
    redeemFromMarket,
    TokenBalance
} from "./common"
import {
    CurvePoolType,
    getOrCreatePool,
    getOtCreateAccountLiquidity,
    getPoolBalances,
    updatePool
} from "./curveUtil"

const coinCount = 3
let lpTokenAddress = Address.fromString("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")
let poolAddress = Address.fromString("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7")

let fakeEvent = new ethereum.Event()
let fakeBlock = new ethereum.Block()
fakeBlock.number = BigInt.fromString("10809473")
fakeBlock.timestamp = BigInt.fromString("1599414978")
fakeBlock.hash = Bytes.fromHexString("0x2d76f2a7c4f083b9f889611734104cfb1efa0cfef8e52b753d9c719870a49b98") as Bytes
fakeEvent.block = fakeBlock
getOrCreatePool(fakeEvent, poolAddress, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)

function handleRemoveLiquidityCommon(
    event: ethereum.Event,
    pool: PoolEntity,
    provider: Address,
    token_amounts: BigInt[],
    token_supply: BigInt
): void {
    let oldTotalSupply = pool.totalSupply

    // Update balances and totalSupply
    let newBalances = getPoolBalances(pool)
    pool = updatePool(event, pool, newBalances, token_supply)
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
    toAccountLiquidity.balance = toAccountLiquidity.balance.plus(toOutputTokenAmount)
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

    for (let j = 0; j < coinCount; j++) {
        if (j == i) {
            tokenAmounts[j] = dy
        } else {
            tokenAmounts[j] = BigInt.fromI32(0)
        }
    }

    let totalSupply = pool.totalSupply.minus(tokenAmount)

    handleRemoveLiquidityCommon(
        event,
        pool,
        provider,
        tokenAmounts,
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
    let transferTozero = LPTokenTransferToZeroEntity.load(pool.lastTransferToZero) as LPTokenTransferToZeroEntity
    transferLPToken(event, pool, transferTozero.from as Address, transferTozero.to as Address, transferTozero.value)

    pool.lastTransferToZero = null
    pool.save()
}

export function handleTokenExchange(event: TokenExchange): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)
    checkPendingTransferTozero(event, pool)
    let newBalances = getPoolBalances(pool)
    updatePool(event, pool, newBalances, pool.totalSupply)
}

export function handleAddLiquidity(event: AddLiquidity): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, [], CurvePoolType.PLAIN, coinCount)

    // Listen on LPToken transfer events
    if (pool.totalSupply == BigInt.fromI32(0)) {
        TriPoolLPToken.create(pool.lpToken as Address)
    }

    checkPendingTransferTozero(event, pool)

    let oldTotalSupply = pool.totalSupply
    let token_amounts = event.params.token_amounts

    // Update balances and totalSupply
    let newBalances = getPoolBalances(pool)
    pool = updatePool(event, pool, newBalances, event.params.token_supply)

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
    entity.logIndex = event.logIndex
    entity.save()

    handleRLOEEntityUpdate(event, entity, pool)
}

export function handleRemoveLiquidityOneCall(call: Remove_liquidity_one_coinCall): void {
    let pool = PoolEntity.load(call.to.toHexString()) as PoolEntity

    let id = call.transaction.hash.toHexString().concat("-").concat(pool.id)
    let entity = getOrCreateRemoveLiquidityOneEvent(id, pool)
    entity.i = call.inputs.i.toI32()
    entity.callApplied = true
    entity.save()

    let event = new ethereum.Event()
    event.block = call.block
    event.transaction = call.transaction
    event.logIndex = entity.logIndex as BigInt
    handleRLOEEntityUpdate(event, entity, pool)
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