import { Transfer } from '../generated/templates/IAToken/IAToken'
import { addDeposit, addWithdrawal, createPositionIfNotExist } from './position'
import { createUserIfNotExists } from './user'

/**
 * Handles transfers by changing the deposit and withdrawals amounts of both
 * positions.
 *
 * Does not update balances or ROIs because we don't have access to price
 * oracles here. Positions are updated frequently in Aave so it should not be
 * an issue.
 */
export function handleTransfer(event: Transfer): void {
  let aTokenAddress = event.address
  let senderAddress = event.params.from
  let receiverAddress = event.params.to

  createUserIfNotExists(senderAddress, event.block.timestamp)
  createUserIfNotExists(receiverAddress, event.block.timestamp)

  let senderPosition = createPositionIfNotExist(
    aTokenAddress,
    senderAddress,
    event.block.timestamp,
  )

  let receiverPosition = createPositionIfNotExist(
    aTokenAddress,
    receiverAddress,
    event.block.timestamp,
  )

  let amount = event.params.value.abs()

  addWithdrawal(senderPosition, amount)
  addDeposit(receiverPosition, amount)

  senderPosition.save()
  receiverPosition.save()
}
