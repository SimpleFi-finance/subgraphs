import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import { Pool as PoolEntity } from '../generated/schema'
import { StableSwapLending3 } from '../generated/TriPool/StableSwapLending3'
import { StableSwapPlain3 } from '../generated/TriPool/StableSwapPlain3'
import { ADDRESS_ZERO, getOrCreateERC20Token } from './common'


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
        let poolCoins: string[] = []
        for (let i = 0; i < info.coins.length; i++) {
            let coin = info.coins[i]
            let token = getOrCreateERC20Token(event, coin)
            poolCoins.push(token.id)
        }
        pool.coins = poolCoins
        let poolUnderlyingCoins: string[] = []
        for (let i = 0; i < info.underlyingCoins.length; i++) {
            let coin = info.underlyingCoins[i]
            let token = getOrCreateERC20Token(event, coin)
            pool.underlyingCoins.push(token.id)
        }
        pool.underlyingCoins = poolUnderlyingCoins
        pool.balances = info.balances
        pool.fee = info.fee
        pool.adminFee = info.adminFee
        pool.totalSupply = BigInt.fromI32(0)
        getOrCreateERC20Token(event, lpTokenAddress)
        pool.lpToken = lpTokenAddress

        pool.blockNumber = event.block.number
        pool.timestamp = event.block.timestamp
        pool.save()
    }

    return pool as PoolEntity
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

        if (c.reverted) {
            log.info("REVERTED COINS CONTRACTS CALL", [])
        }

        if (b.reverted) {
            log.info("REVERTED BALANCES CONTRACTS CALL", [])
        }

        if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO && !b.reverted) {
            log.info("ADDING COIN AND BALANCE {} {}", [c.value.toHexString(), b.value.toString()])
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