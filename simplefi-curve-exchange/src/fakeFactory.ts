import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import { StableSwap } from '../generated/CurveFakeFactory/StableSwap'
import { Pool as PoolEntity } from '../generated/schema'
import { CurvePool } from '../generated/templates'
import { ADDRESS_ZERO, getOrCreateERC20Token } from './common'


export function handleBlock(block: ethereum.Block): void {
    log.info("handle block {}", [block.number.toString()])
    let event = new ethereum.Event()
    event.block = block
    let poolAddress: Address
    let lpTokenAddress: Address
    if (block.number == BigInt.fromString("10809473")) {
        poolAddress = Address.fromString("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7")
        lpTokenAddress = Address.fromString("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")
        getOrCreatePool(event, poolAddress, lpTokenAddress)
    }
}

class PoolInfo {
    coins: Address[]
    underlyingCoins: Address[]
    balances: BigInt[]
    fee: BigInt
    adminFee: BigInt
}

export function getOrCreatePool(event: ethereum.Event, address: Address, lpTokenAddress: Address): PoolEntity {
    let pool = PoolEntity.load(address.toHexString())

    if (pool == null) {
        let info = getPoolInfo(address)

        pool = new PoolEntity(address.toHexString())
        pool.coinCount = info.coins.length
        pool.coins = []
        for(let i=0; i < info.coins.length; i++) {
            let coin = info.coins[i]
            log.info('creating coin for pool {} {}', [i.toString(), coin.toHexString()])
            let token = getOrCreateERC20Token(event, coin)
            pool.coins.push(token.id)
        }
        pool.underlyingCoins = []
        for(let i=0; i < info.coins.length; i++) {
            let coin = info.underlyingCoins[i]
            let token = getOrCreateERC20Token(event, coin)
            pool.underlyingCoins.push(token.id)
        }
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

    CurvePool.create(address)

    return pool as PoolEntity
}

// Gets poll info from swap contract
export function getPoolInfo(pool: Address): PoolInfo {
    let swapContract = StableSwap.bind(pool)

    let coins: Address[] = []
    let underlyingCoins: Address[] = []
    let balances: BigInt[] = []

    let c: ethereum.CallResult<Address>
    let u: ethereum.CallResult<Address>
    let b: ethereum.CallResult<BigInt>

    let i = BigInt.fromI32(0)

    do {
        c = swapContract.try_coins(i)
        u = swapContract.try_underlying_coins(i)
        b = swapContract.try_balances(i)

        if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO) {
            coins.push(c.value)
        }

        if (!u.reverted && u.value.toHexString() != ADDRESS_ZERO) {
            underlyingCoins.push(u.value)
        }

        if (!b.reverted) {
            balances.push(b.value)
        }

        i = i.plus(BigInt.fromI32(1))
    } while (!c.reverted && !u.reverted && !b.reverted)

    return {
        coins,
        underlyingCoins,
        balances,
        fee: swapContract.fee(),
        adminFee: swapContract.admin_fee()
    }
}