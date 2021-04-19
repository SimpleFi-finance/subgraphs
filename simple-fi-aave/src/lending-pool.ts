/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import {
  Deposit,
  Withdraw,
  InitReserveCall,
  ILendingPool,
  ReserveDataUpdated,
} from '../generated/templates/ILendingPool/ILendingPool'
import { ILendingPoolAddressesProvider } from '../generated/templates/ILendingPool/ILendingPoolAddressesProvider'
import { IPriceOracle } from '../generated/templates/ILendingPool/IPriceOracle'
import { IERC20 } from '../generated/templates/ILendingPool/IERC20'
import { IAToken } from '../generated/templates/ILendingPool/IAToken'
import { IAToken as IATokenTemplate } from '../generated/templates'
import { Pool, Position } from '../generated/schema'
import { createUserIfNotExists } from './user'
import { AAVE, LEND, RAY, USDC_ADDRESS, WAD } from './constants'
import {
  createPositionHistoryIfNotExist,
  createPositionIfNotExist,
} from './position'

function computeETHPrice(
  priceOracle: IPriceOracle,
  reserveAddress: Address,
  wei: BigInt,
): BigDecimal {
  let reservePrice = priceOracle.getAssetPrice(reserveAddress)
  let reserveAsERC20 = IERC20.bind(reserveAddress)
  let decimalsResult = reserveAsERC20.try_decimals()
  let decimals = !decimalsResult.reverted
    ? BigInt.fromI32(10)
        .pow(decimalsResult.value as u8)
        .toBigDecimal()
    : WAD.toBigDecimal()

  let ratio = reservePrice.divDecimal(decimals)

  return wei.divDecimal(WAD.toBigDecimal()).times(ratio)
}

/**
 * Given a price oracle and ETH, computes the USDc price
 */
function computeUSDcPrice(
  priceOracle: IPriceOracle,
  eth: BigDecimal,
): BigDecimal {
  let usdcPrice = priceOracle.getAssetPrice(USDC_ADDRESS)
  let usdcBalance = eth
    .div(usdcPrice.divDecimal(WAD.toBigDecimal()))
    .truncate(6)

  return usdcBalance
}

function getPositionAt(arr: BigInt[], pos: number): BigInt {
  let stack: BigInt[] = []
  let result = BigInt.fromI32(0)
  for (let i = 0; i <= pos; i++) {
    let val = arr.pop()
    if (val) {
      if (i == pos) {
        result = val
      }
      stack.push(val as BigInt)
    }
  }

  while (stack.length > 0) {
    let val = stack.pop()
    if (val) {
      arr.push(val as BigInt)
    }
  }

  return result
}

/**
 * Updates the current position balances and ROIs.
 *
 * Note this does not update the withdrawals/deposits of a position.
 * These are handled by aToken handlers instead.
 */
function upsertPosition(
  lendingPoolAddress: Address,
  userAddress: Address,
  reserveAddress: Address,
  timestamp: BigInt,
): Position {
  createUserIfNotExists(userAddress, timestamp)

  let lendingPool = ILendingPool.bind(lendingPoolAddress)
  let reserveData = lendingPool.getReserveData(reserveAddress)

  let aTokenAddress = reserveData.aTokenAddress

  let position = createPositionIfNotExist(aTokenAddress, userAddress, timestamp)
  let addressProvider = ILendingPoolAddressesProvider.bind(
    lendingPool.getAddressesProvider(),
  )
  let priceOracle = IPriceOracle.bind(addressProvider.getPriceOracle())

  let aToken = IAToken.bind(aTokenAddress)

  position.balances = [aToken.balanceOf(userAddress)]

  let roi = aToken
    .balanceOf(userAddress)
    .plus(getPositionAt(position.withdrawals, 0))
    .minus(getPositionAt(position.deposits, 0))
  let roiInETH = computeETHPrice(priceOracle, reserveAddress, roi)
  let roiInUSD = computeUSDcPrice(priceOracle, roiInETH)

  position.roi = [roi]
  position.roiInEth = [roiInETH]
  position.roiInUSD = [roiInUSD]

  let scaledBalance = aToken.scaledBalanceOf(userAddress)
  let ethBalance = computeETHPrice(priceOracle, reserveAddress, scaledBalance)
  position.balancesInEth = [ethBalance]
  position.balancesInUSD = [computeUSDcPrice(priceOracle, ethBalance)]

  position.updatedAt = timestamp.toI32()

  position.save()

  /// Save Position History
  let positionHistory = createPositionHistoryIfNotExist(
    userAddress,
    aTokenAddress,
    timestamp,
  )
  positionHistory.balances = position.balances
  positionHistory.balancesInEth = position.balancesInEth
  positionHistory.balancesInUSD = position.balancesInUSD
  positionHistory.roi = position.roi
  positionHistory.balancesInEth = position.balancesInEth
  positionHistory.balancesInUSD = position.balancesInUSD
  positionHistory.withdrawals = position.withdrawals
  positionHistory.deposits = position.deposits
  positionHistory.timestamp = timestamp.toI32()

  positionHistory.save()

  // TODO: Add Total Supply as well

  return position
}

/**
 * Handles deposits
 *
 * In a deposit situation, a user deposits a reserve asset and mints aTokens
 * to the `onBehalfOf` address. Hence we update the `onBehalfOf` position.
 */
export function handleDeposit(event: Deposit): void {
  upsertPosition(
    event.address,
    event.params.onBehalfOf,
    event.params.reserve,
    event.block.timestamp,
  )
}

/**
 * Handles withdrawals
 *
 * In a withdrawal situation, the user burns aTokens, so we update their
 * balance accordingly.
 */
export function handleWithdrawal(event: Withdraw): void {
  upsertPosition(
    event.address,
    event.params.to,
    event.params.reserve,
    event.block.timestamp,
  )
}

export function handleInitReserveCall(call: InitReserveCall): void {
  let aTokenAddress = call.inputs.aTokenAddress
  let aTokenAddressHex = aTokenAddress.toHexString()
  let aaveLendingPool = ILendingPool.bind(call.to)

  let pool = Pool.load(aTokenAddressHex)
  if (!pool) {
    IATokenTemplate.create(aTokenAddress)
    pool = new Pool(aTokenAddressHex)
    pool.createdAt = call.block.timestamp.toI32()
  }

  let reserveData = aaveLendingPool.getReserveData(call.inputs.reserve)

  pool.protocol = AAVE
  pool.poolType = LEND
  pool.apy = reserveData.currentLiquidityRate.divDecimal(RAY.toBigDecimal())
  pool.assets = [aTokenAddressHex]
  pool.updatedAt = call.block.timestamp.toI32()

  pool.save()
}

export function handleReserveDataUpdated(event: ReserveDataUpdated): void {
  let aaveLendingPool = ILendingPool.bind(event.address)
  let reserveData = aaveLendingPool.getReserveData(event.params.reserve)

  let pool = Pool.load(reserveData.aTokenAddress.toHexString())!!

  pool.apy = event.params.liquidityRate.divDecimal(RAY.toBigDecimal())

  pool.save()
}
