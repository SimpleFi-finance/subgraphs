import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import { Pool as PoolEntity } from "../generated/schema"


export namespace CurvePoolType {
    export const PLAIN = "PLAIN"
    export const LENDING = "LENDING"
    export const META = "META"
}

export class PoolConstants {
    coinCount: i32
    feeDenominator: BigInt
    precision: BigInt
    lendingPrecision: BigInt
    precisionMul: BigInt[]
    rates: BigInt[]
    lpTokenAddress: Address
    poolAddress: Address
    poolType: string
}

export function getA(block: ethereum.Block, pool: PoolEntity): BigInt {
    let timestamp = block.timestamp
    let t1 = pool.futureATime
    let a1 = pool.futureA
    let a = a1

    if (timestamp.lt(t1)) {
        let t0 = pool.initialATime
        let a0 = pool.initialA
        let time = timestamp.minus(t0).div(t1.minus(t0))
        if (a1.gt(a0)) {
            a = a0.plus(a1.minus(a0).times(time))
        } else {
            a = a0.minus(a0.minus(a1).times(time))
        }
    }

    return a
}

export function getXp(balances: BigInt[], c: PoolConstants): BigInt[] {
    let result = c.rates
    for (let i = 0; i < c.coinCount; i++) {
        result[i] = result[i].times(balances[i]).div(c.lendingPrecision)
    }
    return result
}

export function getD(xp: BigInt[], amp: BigInt, c: PoolConstants): BigInt {
    let zero = BigInt.fromI32(0)
    let one = BigInt.fromI32(1)
    let n = BigInt.fromI32(c.coinCount)

    let S = BigInt.fromI32(0)
    for (let i = 0; i < c.coinCount; i++) {
        S = S.plus(xp[i])
    }

    if (S == zero) {
        return zero
    }

    let Dprev = zero
    let D = S
    let Ann = amp.times(n)
    for (let i = 0; i < 256; i++) {
        let D_P = D
        for (let i = 0; i < c.coinCount; i++) {
            // D_P = D_P * D / (_x * N_COINS)
            D_P = D_P.times(D.div(xp[i].times(n)))
        }
        Dprev = D
        // D = (Ann * S + D_P * N_COINS) * D / ((Ann - 1) * D + (N_COINS + 1) * D_P)
        // (Ann * S + D_P * N_COINS) * D
        let numerator = Ann.times(S).plus(D_P.times(n)).times(D)
        // (Ann - 1) * D + (N_COINS + 1) * D_P
        let denomminator = Ann.minus(one).times(D).plus(n.plus(one).times(D_P))
        D = numerator.div(denomminator)
        // Equality with the precision of 1
        if (D.gt(Dprev)) {
            if (D.minus(D_P).le(one)) {
                break
            }
        } else {
            if (D_P.minus(D).le(one)) {
                break
            }
        }
    }
    return D
}

/**
    Calculate x[i] if one reduces D from being calculated for xp to D

    Done by solving quadratic equation iteratively.
    x_1**2 + x1 * (sum' - (A*n**n - 1) * D / (A * n**n)) = D ** (n + 1) / (n ** (2 * n) * prod' * A)
    x_1**2 + b*x_1 = c

    x_1 = (x_1**2 + c) / (2*x_1 + b)
 */
export function getYD(A_: BigInt, i: i32, xp: BigInt[], D: BigInt, constants: PoolConstants): BigInt {
    let zero = BigInt.fromI32(0)
    let one = BigInt.fromI32(1)
    let n = BigInt.fromI32(constants.coinCount)

    let c = D
    let S_ = zero
    let Ann = A_.times(n)

    let _x = zero
    for (let _i = 0; _i < constants.coinCount; _i++) {
        if (_i != i) {
            _x = xp[_i]
            S_ = S_.plus(_x)
            // c = c * D / (_x * N_COINS)
            c = c.times(D).div(_x.times(n))
        }
    }
    // c = c * D / (Ann * N_COINS)
    c = c.times(D).div(Ann.times(n))
    let b = S_.plus(D.div(Ann))
    let y_prev = zero
    let y = D
    for (let _i = 0; _i < 256; _i++) {
        y_prev = y
        // y = (y*y + c) / (2 * y + b - D)
        let numerator = y.times(y).plus(c)
        let denominator = y.times(BigInt.fromI32(2)).plus(b).minus(D)
        y = numerator.div(denominator)
        // Equality with the precision of 1
        if (y.gt(y_prev)) {
            if (y.minus(y_prev).le(one)) {
                break
            }
        } else {
            if (y_prev.minus(y).le(one)) {
                break
            }
        }
    }
    return y
}

export function getDYFeeOnOneCoinWithdrawal(
    block: ethereum.Block,
    pool: PoolEntity,
    c: PoolConstants,
    token_amount: BigInt,
    i: i32,
    dy: BigInt
): BigInt {
    let rates = c.rates

    let amp = getA(block, pool)
    let totalSupply = pool.totalSupply

    let xp = getXp(pool.balances, c)
    let D0 = getD(xp, amp, c)
    let D1 = D0.minus(token_amount.times(D0).div(totalSupply))

    let new_y = getYD(amp, i, xp, D1, c)
    let dy_0 = xp[i].minus(new_y).times(c.precision).div(rates[i])

    let fee = dy_0.minus(dy)

    return fee
}