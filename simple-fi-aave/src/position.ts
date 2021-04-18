import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { Position, PositionHistory } from '../generated/schema'

export function createPositionIfNotExist(
  aTokenAddress: Address,
  userAddress: Address,
  timestamp: BigInt,
): Position {
  let id = positionId(aTokenAddress, userAddress)
  let position = Position.load(id)
  if (!position) {
    position = new Position(id)
    position.user = userAddress.toHexString()
    position.pool = aTokenAddress.toHexString()
    position.balances = [BigInt.fromI32(0)]
    position.deposits = [BigInt.fromI32(0)]
    position.withdrawals = [BigInt.fromI32(0)]
    position.balancesInEth = [BigDecimal.fromString('0')]
    position.balancesInUSD = [BigDecimal.fromString('0')]
    position.roi = [BigInt.fromI32(0)]
    position.roiInEth = [BigDecimal.fromString('0')]
    position.roiInUSD = [BigDecimal.fromString('0')]
    position.createdAt = timestamp.toI32()
    position.updatedAt = timestamp.toI32()

    position.save()
  }

  return position!!
}

export function positionId(
  aTokenAddress: Address,
  userAddress: Address,
): string {
  return aTokenAddress.toHexString() + '-' + userAddress.toHexString()
}

export function createPositionHistoryIfNotExist(
  aTokenAddress: Address,
  userAddress: Address,
  timestamp: BigInt,
): PositionHistory {
  let id = positionHistoryId(aTokenAddress, userAddress, timestamp)
  let positionHistory = PositionHistory.load(id)
  if (!positionHistory) {
    positionHistory = new PositionHistory(id)
    positionHistory.user = userAddress.toHexString()
    positionHistory.pool = aTokenAddress.toHexString()
    positionHistory.balances = [BigInt.fromI32(0)]
    positionHistory.deposits = [BigInt.fromI32(0)]
    positionHistory.withdrawals = [BigInt.fromI32(0)]
    positionHistory.balancesInEth = [BigDecimal.fromString('0')]
    positionHistory.balancesInUSD = [BigDecimal.fromString('0')]
    positionHistory.roi = [BigInt.fromI32(0)]
    positionHistory.roiInEth = [BigDecimal.fromString('0')]
    positionHistory.roiInUSD = [BigDecimal.fromString('0')]

    positionHistory.timestamp = timestamp.toI32()

    positionHistory.save()
  }

  return positionHistory!!
}

export function positionHistoryId(
  aTokenAddress: Address,
  userAddress: Address,
  timestamp: BigInt,
): string {
  return (
    aTokenAddress.toHexString() +
    '-' +
    userAddress.toHexString() +
    '-' +
    timestamp.toString()
  )
}

export function addDeposit(position: Position, amount: BigInt): void {
  let currentDeposits = position.deposits.pop()
  if (!currentDeposits) {
    currentDeposits = BigInt.fromI32(0)
  }
  position.deposits = [currentDeposits.plus(amount.abs())]
}

export function addWithdrawal(position: Position, amount: BigInt): void {
  let currentWithdrawals = position.withdrawals.pop()
  if (!currentWithdrawals) {
    currentWithdrawals = BigInt.fromI32(0)
  }
  position.withdrawals = [currentWithdrawals.plus(amount.abs())]
}
