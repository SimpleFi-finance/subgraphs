import { BigInt, near } from "@graphprotocol/graph-ts";
import { StableSwapPool } from "../../generated/schema";

const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);
const FEE_DEVISOR = BigInt.fromI32(10000);

// maximum iterations of newton's method approximation
const MAX_ITERS = 256;

function sumReducer(sum: BigInt, v: BigInt, i: i32, a: BigInt[]): BigInt {
  return sum.plus(v);
}

export class Fees {
  tradeFee: BigInt
  adminFee: BigInt

  constructor(tradeFee: BigInt, adminFee: BigInt) {
    this.tradeFee = tradeFee;
    this.adminFee = adminFee;
  }

  computeTradeFee(amount: BigInt): BigInt {
    return amount.times(this.tradeFee).div(FEE_DEVISOR);
  }

  computeAdminFee(amount: BigInt): BigInt {
    return amount.times(this.adminFee).div(FEE_DEVISOR);
  }

  // Used to normalize fee applid on difference amount with ideal balance
  normalizedTrafeFee(nCoins: BigInt, amount: BigInt): BigInt {
    const adjustedTradeFee = this.tradeFee.times(nCoins).div(BigInt.fromI32(4).times(nCoins.minus(ONE)));
    return amount.times(adjustedTradeFee).div(FEE_DEVISOR);
  }
}

export class SwapResult {
  newSourceAmount: BigInt
  newDestiantionAmount: BigInt
  amountSwapped: BigInt
  adminFee: BigInt
  fee: BigInt

  constructor(
    newSourceAmount: BigInt,
    newDestiantionAmount: BigInt,
    amountSwapped: BigInt,
    adminFee: BigInt,
    fee: BigInt,
  ) {
    this.newSourceAmount = newSourceAmount;
    this.newDestiantionAmount = newDestiantionAmount;
    this.amountSwapped = amountSwapped;
    this.adminFee = adminFee;
    this.fee = fee;
  }
}

export class StableSwap {
  initAmpFactor: BigInt
  targetAmpFactor: BigInt
  currentTime: BigInt
  initAmpTime: BigInt
  stopAmpTime: BigInt

  constructor(block: near.Block, stableSwapPool: StableSwapPool) {
    this.initAmpFactor = stableSwapPool.initAmpFactor;
    this.targetAmpFactor = stableSwapPool.targetAmpFactor;
    this.currentTime = BigInt.fromU64(block.header.timestampNanosec);
    this.initAmpTime = stableSwapPool.initAmpTime;
    this.stopAmpTime = stableSwapPool.stopAmpTime;
  }

  computeAmpFactor(): BigInt {
    if (this.currentTime > this.stopAmpTime) {
      return this.targetAmpFactor;
    }

    const timeRange = this.stopAmpTime.minus(this.initAmpTime);
    const timeDelta = this.currentTime.minus(this.initAmpTime);

    if (this.targetAmpFactor >= this.initAmpFactor) {
      // Ramp up
      const ampRange = this.targetAmpFactor.minus(this.initAmpFactor);
      const ampDelta = ampRange.times(timeDelta).div(timeRange);
      return this.initAmpFactor.plus(ampDelta);
    } else {
      // Ramp down
      const ampRange = this.initAmpFactor.minus(this.targetAmpFactor);
      const ampDelta = ampRange.times(timeDelta).div(timeRange);
      return this.initAmpFactor.minus(ampDelta);
    }
  }

  // Compute stable swap invariant (D)
  // Equation: A * sum(x_i) * n**n + D = A * D * n**n + D**(n+1) / (n**n * prod(x_i))
  computeD(cAmounts: BigInt[]): BigInt {
    const N_COINS = BigInt.fromI32(cAmounts.length);
    let sumX = cAmounts.reduce<BigInt>(sumReducer, ZERO);

    if (sumX == ZERO) {
      return ZERO;
    }

    const ampFactor = this.computeAmpFactor();
    let dPrev = BigInt.fromI32(0);
    let d = sumX;

    for (let i = 0; i < MAX_ITERS; i++) {
      let dProd = d;
      for (let j = 0; j < cAmounts.length; j++) {
        dProd = dProd.times(d).div(cAmounts[j].times(N_COINS));
      }

      dPrev = d;
      const ann = ampFactor.times(N_COINS.pow(N_COINS.toU32()));
      const leverage = sumX.times(ann);
      // d = (ann * sum_x + d_prod * n_coins) * d_prev / ((ann - 1) * d_prev + (n_coins + 1) * d_prod)
      const numerator = dPrev.times(dProd.times(N_COINS).plus(leverage));
      const denominator = dPrev.times(ann.minus(ONE)).plus(dProd.times(N_COINS.plus(ONE)));
      d = numerator.div(denominator);

      if (d.minus(dPrev).abs() <= ONE) {
        break;
      }
    }

    return d;
  }

  // Compute new amount of token 'y' with new amount of token 'x'
  // return new y_token amount according to the equation
  computeY(xCAmount: BigInt, currentCAmounts: BigInt[], indexX: u32, indexY: u32): BigInt {
    const N_COINS = BigInt.fromI32(currentCAmounts.length);
    const ampFactor = this.computeAmpFactor();
    const ann = ampFactor.times(N_COINS.pow(N_COINS.toU32()));

    // Invariant
    const d = this.computeD(currentCAmounts);
    let s = xCAmount;
    let c = d.times(d).div(xCAmount);
    for (let i = 0; i < currentCAmounts.length; i++) {
      if (i != indexX && i != indexY) {
        s = s.plus(currentCAmounts[i]);
        c = c.times(d).div(currentCAmounts[i]);
      }
    }
    c = c.times(d).div(ann.times(N_COINS.pow(N_COINS.toU32())));
    const b = d.div(ann).plus(s); // d will be subtracted later

    // Solve for y by approximating: y**2 + b*y = c
    let yPrev: BigInt;
    let y = d;
    for (let i = 0; i < MAX_ITERS; i++) {
      yPrev = y;
      const yNumerator = y.pow(2).plus(c);
      const yDenominator = y.times(BigInt.fromI32(2)).plus(b).minus(d);
      y = yNumerator.div(yDenominator);
      if (y.minus(yPrev).abs() <= ONE) {
        break;
      }
    }
    return y;
  }

  // Compute the amount of LP tokens to mint after a deposit
  // return <lp_amount_to_mint, lp_fees_part>
  computeLPAmountForDeposit(
    depositCAmounts: BigInt[],
    oldCAmounts: BigInt[],
    totalSupply: BigInt,
    fees: Fees
  ): BigInt[] | null {
    let nCoins = oldCAmounts.length;

    // Initial Invariant
    const d0 = this.computeD(oldCAmounts);

    const newCAmounts: BigInt[] = [];
    for (let i = 0; i < nCoins; i++) {
      newCAmounts.push(oldCAmounts[i].plus(depositCAmounts[i]));
    }
    // Invariant after change
    const d1 = this.computeD(newCAmounts);
    if (d1 <= d0) {
      return null;
    }

    // Recalculate the invariant accounting for fees
    for (let i = 0; i < nCoins; i++) {
      const idealBalance = d1.times(oldCAmounts[i]).div(d0);
      const difference = idealBalance.minus(newCAmounts[i]).abs();
      const fee = fees.normalizedTrafeFee(BigInt.fromI32(nCoins), difference);
      newCAmounts[i] = newCAmounts[i].minus(fee);
    }

    const d2 = this.computeD(newCAmounts);

    // d1 > d2 > d0, 
    // (d2-d0) => mint_shares (charged fee),
    // (d1-d0) => diff_shares (without fee),
    // (d1-d2) => fee part,
    // diff_shares = mint_shares + fee part
    const mintShares = totalSupply.times(d2.minus(d0)).div(d0);
    const diffShares = totalSupply.times(d1.minus(d0)).div(d0);

    return [mintShares, diffShares];
  }

  // given token_out user want get and total tokens in pool and lp token supply,
  // return <lp_amount_to_burn, lp_fees_part>
  // all amounts are in c_amount (comparable amount)
  computeLPAmountForWithdraw(
    withdrawCAmounts: BigInt[],
    oldCAmounts: BigInt[],
    totalSupply: BigInt,
    fees: Fees
  ): BigInt[] | null {
    let nCoins = oldCAmounts.length;

    // Initial Invariant
    const d0 = this.computeD(oldCAmounts);

    const newCAmounts: BigInt[] = [];
    for (let i = 0; i < nCoins; i++) {
      newCAmounts.push(oldCAmounts[i].minus(withdrawCAmounts[i]));
    }
    // Invariant after change
    const d1 = this.computeD(newCAmounts);
    if (d1 >= d0) {
      return null;
    }

    // Recalculate the invariant accounting for fees
    for (let i = 0; i < nCoins; i++) {
      const idealBalance = d1.times(oldCAmounts[i]).div(d0);
      const difference = idealBalance.minus(newCAmounts[i]).abs();
      const fee = fees.normalizedTrafeFee(BigInt.fromI32(nCoins), difference);
      newCAmounts[i] = newCAmounts[i].minus(fee);
    }

    const d2 = this.computeD(newCAmounts);

    // d0 > d1 > d2, 
    // (d0-d2) => burn_shares (plus fee),
    // (d0-d1) => diff_shares (without fee),
    // (d1-d2) => fee part,
    // burn_shares = diff_shares + fee part
    const burnShares = totalSupply.times(d0.minus(d2)).div(d0);
    const diffShares = totalSupply.times(d0.minus(d1)).div(d0);

    return [burnShares, diffShares];
  }

  // Compute SwapResult after an exchange
  // all tokens in and out with comparable precision
  swapTo(
    tokenInIndex: u32,
    tokenInAmount: BigInt,
    tokenOutIndex: u32,
    currentCAmounts: BigInt[],
    fees: Fees
  ): SwapResult {
    const y = this.computeY(
      tokenInAmount.plus(currentCAmounts[tokenInIndex]),
      currentCAmounts,
      tokenInIndex,
      tokenOutIndex
    );

    const dy = currentCAmounts[tokenOutIndex].minus(y);
    const tradeFee = fees.computeTradeFee(dy);
    const adminFee = fees.computeAdminFee(tradeFee);
    const amountSwapped = dy.minus(tradeFee);
    const newDestinationAmount = currentCAmounts[tokenOutIndex].minus(amountSwapped).minus(adminFee);
    const newSourceAmount = currentCAmounts[tokenInIndex].plus(tokenInAmount);

    return new SwapResult(
      newDestinationAmount,
      newSourceAmount,
      amountSwapped,
      adminFee,
      tradeFee
    );
  }
}