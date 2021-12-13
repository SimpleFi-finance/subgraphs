import { PoolType } from "./constants"
import { Pool, PoolId } from "../generated/schema"
import { InvestmentPool } from "../generated/templates"
import { PoolCreated } from "../generated/InvestmentPoolFactory/InvestmentPoolFactory"
import { getOrCreateAccount } from "./common"

export function handlePoolCreated(event: PoolCreated): void {
  let poolId = PoolId.load(event.params.pool.toHexString())
  let pool = Pool.load(poolId.poolId)
  
  pool.factory = getOrCreateAccount(event.address).id
  pool.poolType = PoolType.INVESTMENT_POOL
  pool.save()

  InvestmentPool.create(event.params.pool)
}
