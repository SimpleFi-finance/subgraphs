import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import {
    Account as AccountEntity,
    AccountLiquidity as AccountLiquidityEntity,
    Pool as PoolEntity,
    PoolSnapshot as PoolSnapshotEntity,
    Token as TokenEntity
} from '../generated/schema'
import { StableSwapLending3 } from '../generated/TriPool/StableSwapLending3'
import { StableSwapPlain3 } from '../generated/TriPool/StableSwapPlain3'
import { ADDRESS_ZERO, getOrCreateERC20Token, getOrCreateMarket } from './common'
import { ProtocolName, ProtocolType } from './constants'


export namespace CurvePoolType {
    export const PLAIN = "PLAIN"
    export const LENDING = "LENDING"
    export const META = "META"
}

class PoolInfo {
    coins: Address[]
    underlyingCoins: Address[]
    balances: BigInt[]
    fee: BigInt
    adminFee: BigInt
}

export function getOrCreatePool(
    event: ethereum.Event,
    address: Address,
    lpTokenAddress: Address,
    rewardTokenAddresses: Address[],
    poolType: string,
    coinCount: i32
): PoolEntity {
    let pool = PoolEntity.load(address.toHexString())

    if (pool == null) {
        let info: PoolInfo

        if (poolType == CurvePoolType.PLAIN) {
            info = getPlainPoolInfo(address, coinCount)
        }

        pool = new PoolEntity(address.toHexString())
        pool.coinCount = info.coins.length

        let poolCoins: TokenEntity[] = []
        for (let i = 0; i < info.coins.length; i++) {
            let coin = info.coins[i]
            let token = getOrCreateERC20Token(event, coin)
            poolCoins.push(token)
        }
        pool.coins = poolCoins.map<string>(t => t.id)

        let poolUnderlyingCoins: TokenEntity[] = []
        for (let i = 0; i < info.underlyingCoins.length; i++) {
            let coin = info.underlyingCoins[i]
            let token = getOrCreateERC20Token(event, coin)
            poolUnderlyingCoins.push(token)
        }
        pool.underlyingCoins = poolUnderlyingCoins.map<string>(t => t.id)

        pool.balances = info.balances
        pool.fee = info.fee
        pool.adminFee = info.adminFee
        pool.totalSupply = BigInt.fromI32(0)
        let lpToken = getOrCreateERC20Token(event, lpTokenAddress)
        pool.lpToken = lpTokenAddress

        pool.blockNumber = event.block.number
        pool.timestamp = event.block.timestamp
        pool.save()

        let poolRewardTokens: TokenEntity[] = []
        for (let i = 0; i < rewardTokenAddresses.length; i++) {
            let coin = rewardTokenAddresses[i]
            let token = getOrCreateERC20Token(event, coin)
            poolRewardTokens.push(token)
        }
        // Create Market entity
        getOrCreateMarket(
            event,
            address,
            ProtocolName.CURVE_POOL,
            ProtocolType.EXCHANGE,
            poolCoins,
            lpToken,
            poolRewardTokens
        )
    }

    return pool as PoolEntity
}

export function createPoolSnaptshot(event: ethereum.Event, pool: PoolEntity): PoolSnapshotEntity {
    let transactionHash = event.transaction.hash.toHexString()
    let id = transactionHash.concat("-").concat(event.logIndex.toHexString())
    let poolSnapshot = PoolSnapshotEntity.load(id)
    if (poolSnapshot != null) {
        return poolSnapshot as PoolSnapshotEntity
    }

    poolSnapshot = new PoolSnapshotEntity(id)
    poolSnapshot.pool = pool.id
    poolSnapshot.balances = pool.balances
    poolSnapshot.fee = pool.fee
    poolSnapshot.adminFee = pool.adminFee
    poolSnapshot.totalSupply = pool.totalSupply
    poolSnapshot.blockNumber = event.block.number
    poolSnapshot.timestamp = event.block.timestamp
    poolSnapshot.transactionHash = transactionHash
    poolSnapshot.transactionIndexInBlock = event.transaction.index
    poolSnapshot.logIndex = event.logIndex
    poolSnapshot.save()

    return poolSnapshot as PoolSnapshotEntity
}

export function getPlainPoolInfo(pool: Address, coinCount: i32): PoolInfo {
    let swapContract = StableSwapPlain3.bind(pool)

    let coins: Address[] = []
    let underlyingCoins: Address[] = []
    let balances: BigInt[] = []

    let c: ethereum.CallResult<Address>
    let b: ethereum.CallResult<BigInt>

    for (let i = 0; i < coinCount; i++) {
        let ib = BigInt.fromI32(i)
        c = swapContract.try_coins(ib)
        b = swapContract.try_balances(ib)

        if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO && !b.reverted) {
            coins.push(c.value)
            balances.push(b.value)
        }
    }

    return {
        coins,
        underlyingCoins,
        balances,
        fee: swapContract.fee(),
        adminFee: swapContract.admin_fee()
    }
}

export function getPlainLendingInfo(pool: Address, coinCount: i32): PoolInfo {
    let swapContract = StableSwapLending3.bind(pool)

    let coins: Address[] = []
    let underlyingCoins: Address[] = []
    let balances: BigInt[] = []

    let c: ethereum.CallResult<Address>
    let u: ethereum.CallResult<Address>
    let b: ethereum.CallResult<BigInt>

    for (let i = 0; i < coinCount; i++) {
        let ib = BigInt.fromI32(i)
        c = swapContract.try_coins(ib)
        u = swapContract.try_underlying_coins(ib)
        b = swapContract.try_balances(ib)

        if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO && !b.reverted) {
            coins.push(c.value)
            balances.push(b.value)
        }
    }

    return {
        coins,
        underlyingCoins,
        balances,
        fee: swapContract.fee(),
        adminFee: swapContract.admin_fee()
    }
}

export function getOtCreateAccountLiquidity(account: AccountEntity, pool: PoolEntity): AccountLiquidityEntity {
    let id = account.id.concat("-").concat(pool.id)
    let liquidity = AccountLiquidityEntity.load(id)
    if (liquidity != null) {
        return liquidity as AccountLiquidityEntity
    }
    liquidity = new AccountLiquidityEntity(id)
    liquidity.pool = pool.id
    liquidity.account = account.id
    liquidity.balance = BigInt.fromI32(0)
    liquidity.save()
    return liquidity as AccountLiquidityEntity
}