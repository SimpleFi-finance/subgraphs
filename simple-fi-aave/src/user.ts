import { Address, BigInt } from '@graphprotocol/graph-ts'
import { User } from '../generated/schema'

export function createUserIfNotExists(
  userAddress: Address,
  timestamp: BigInt,
): User {
  let user = User.load(userAddress.toHexString())
  if (!user) {
    user = new User(userAddress.toHexString())
    user.createdAt = timestamp.toI32()
    user.updatedAt = timestamp.toI32()

    user.save()
  }

  return user!!
}
