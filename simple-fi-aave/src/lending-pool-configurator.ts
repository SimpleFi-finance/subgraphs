import { ReserveInitialized } from '../generated/templates/ILendingPoolConfigurator/ILendingPoolConfigurator'
import { Asset } from '../generated/schema'
import { DERIVATIVE, RESERVE } from './constants'

/**
 * Handles the initialization of a reserve asset and its pool.
 *
 * A reserve asset is the token that backs the derivative of the aToken.
 * We don't expect this function to be called more than once per reserve asset,
 * but in the case it is, the data will be overwrriten.
 */
export function handleReserveInitialized(event: ReserveInitialized): void {
  let aTokenAddress = event.params.aToken
  let reserveAddress = event.params.asset

  let reserve = Asset.load(reserveAddress.toHexString())
  if (!reserve) {
    reserve = new Asset(reserveAddress.toHexString())
    reserve.createdAt = event.block.timestamp.toI32()
  }
  reserve.assetType = RESERVE
  reserve.updatedAt = event.block.timestamp.toI32()

  reserve.save()

  let aToken = Asset.load(aTokenAddress.toHexString())
  if (!aToken) {
    aToken = new Asset(aTokenAddress.toHexString())
    aToken.createdAt = event.block.timestamp.toI32()
  }
  aToken.assetType = DERIVATIVE
  aToken.reserveAsset = reserve.id

  aToken.updatedAt = event.block.timestamp.toI32()

  aToken.save()
}
