import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { StablePool } from "../generated/templates"
import { PoolCreated } from "../generated/StablePoolFactory/StablePoolFactory"
import { getOrCreateAccount } from "./common"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.params.pool.toHexString())
  let pool = Pool.load(poolId.poolId)
  
  pool.factory = getOrCreateAccount(event.address).id
  pool.poolType = PoolType.LIQUIDITY_BOOTSTRAPPING_POOL
  pool.save()

  StablePool.create(event.params.pool)
}
