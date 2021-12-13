import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { MetastablePool } from "../generated/templates"
import { PoolCreated } from "../generated/MetastablePoolFactory/MetastablePoolFactory"
import { getOrCreateAccount } from "./common"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.params.pool.toHexString())
  let pool = Pool.load(poolId.poolId)
  
  pool.factory = getOrCreateAccount(event.address).id
  pool.poolType = PoolType.LIQUIDITY_BOOTSTRAPPING_POOL
  pool.save()

  MetastablePool.create(event.params.pool)
}
