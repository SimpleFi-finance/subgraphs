import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { WeightedPool } from "../generated/templates"
import { PoolCreated } from "../generated/WeightedPoolFactory/WeightedPoolFactory"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.params.pool.toHexString())
  let pool = Pool.load(poolId.poolId)

  pool.poolType = PoolType.WEIGHTED_POOL
  pool.save()

  WeightedPool.create(event.params.pool)
}
