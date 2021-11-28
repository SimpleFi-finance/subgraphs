import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { WeightedPool2Tokens } from "../generated/templates"
import { PoolCreated } from "../generated/WeightedPool2TokensFactory/WeightedPool2TokensFactory"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.address.toHexString())
  let pool = Pool.load(poolId.poolId)
  
  pool.poolType = PoolType.WEIGHTED_POOL_2_TOKENS
  pool.save()

  WeightedPool2Tokens.create(event.params.pool)
}
