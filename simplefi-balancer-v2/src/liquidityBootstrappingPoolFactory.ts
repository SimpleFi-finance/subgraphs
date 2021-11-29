import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { LiquidityBootstrappingPool } from "../generated/templates"
import { PoolCreated } from "../generated/LiquidityBootstrappingPoolFactory/LiquidityBootstrappingPoolFactory"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.params.pool.toHexString())
  let pool = Pool.load(poolId.poolId)
  
  pool.poolType = PoolType.LIQUIDITY_BOOTSTRAPPING_POOL
  pool.save()

  LiquidityBootstrappingPool.create(event.params.pool)
}
