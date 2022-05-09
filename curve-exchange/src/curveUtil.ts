import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  LPToken,
  MetaPoolFactory,
  Pool as PoolEntity,
  RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity,
  Token,
} from "../generated/schema";

import { PoolRegistry } from "../generated/templates/PoolRegistry/PoolRegistry";
import { MetaPoolFactory as FactoryContract } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { ERC20 as ERC20Contract } from "../generated/templates/PoolLPToken/ERC20";

import { PoolLPToken } from "../generated/templates";

import { getOrCreateERC20Token, getOrCreateMarket } from "./common";

import { ProtocolName, ProtocolType, PoolStaticInfo, addressToPool } from "./constants";
import { CurvePool } from "../generated/templates/CurvePool/CurvePool";
import { CurvePool as CurvePoolTemplate } from "../generated/templates";

export namespace CurvePoolType {
  export const PLAIN = "PLAIN";
  export const LENDING = "LENDING";
  export const META = "META";
}

const OLD_FACTORY_ADDRESS = "0x0959158b6040d32d04c301a72cbfd6b39e21c9ae";

export namespace CurvePoolSource {
  export const METAPOOL_FACTORY = "metapool-factory";
  export const HARD_CODED = "hard-coded";
  export const REGISTRY = "registry";
}

/**
 * Fetch existing pool entity, or create a new one in case where pool "source" is the hard-coded subgraph data source
 * @param event
 * @param poolAddress
 * @returns
 */
export function getOrCreatePool(event: ethereum.Event, poolAddress: Address): PoolEntity {
  let pool = PoolEntity.load(poolAddress.toHexString());
  if (pool != null) {
    return pool as PoolEntity;
  }

  ////// create new pool entity based on hard-coded info, as registry or factory are not available here

  let poolStaticInfo: PoolStaticInfo = addressToPool.get(
    poolAddress.toHexString()
  ) as PoolStaticInfo;

  pool = new PoolEntity(poolAddress.toHexString());

  //// n_coins
  pool.coinCount = poolStaticInfo.coinCount;

  //// coins
  let poolContract = CurvePool.bind(poolAddress);
  let poolCoins: Token[] = [];

  // try fetching first coin. If ok fetch remaining coins, otherwise use older ABI call to fetch all coins
  let coin0 = poolContract.try_coins(BigInt.fromI32(0));
  if (!coin0.reverted) {
    poolCoins.push(getOrCreateERC20Token(event, coin0.value));
    for (let i = 1; i < pool.coinCount; i++) {
      poolCoins.push(getOrCreateERC20Token(event, poolContract.coins(BigInt.fromI32(i))));
    }
  } else {
    for (let i = 0; i < pool.coinCount; i++) {
      poolCoins.push(getOrCreateERC20Token(event, poolContract.coins1(BigInt.fromI32(i))));
    }
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  //// balances
  let balances: BigInt[] = [];
  let balanceCoin0 = poolContract.try_balances(BigInt.fromI32(0));
  // check if contract call is of type v1 or v2
  if (!balanceCoin0.reverted) {
    pool.isOldAbiVersion = false;
    balances.push(balanceCoin0.value);
    for (let i = 1; i < pool.coinCount; i++) {
      balances.push(poolContract.balances(BigInt.fromI32(i)));
    }
  } else {
    pool.isOldAbiVersion = true;
    balanceCoin0 = poolContract.try_balances1(BigInt.fromI32(0));
    if (!balanceCoin0.reverted) {
      balances.push(balanceCoin0.value);
      for (let i = 1; i < pool.coinCount; i++) {
        balances.push(poolContract.balances1(BigInt.fromI32(i)));
      }
    }
  }
  pool.balances = balances;
  pool.initialBalances = balances;
  pool.lastBlockBalanceUpdated = event.block.number;

  //// total LP supply
  pool.totalSupply = BigInt.fromI32(0);
  let lpToken = getOrCreateERC20Token(event, Address.fromString(poolStaticInfo.lpTokenAddress));
  pool.lpToken = Address.fromString(poolStaticInfo.lpTokenAddress);

  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.source = CurvePoolSource.HARD_CODED;
  pool.isInRegistry = false;

  pool.save();

  let poolRewardTokens: Token[] = [];

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    poolAddress,
    ProtocolName.CURVE_POOL,
    ProtocolType.EXCHANGE,
    poolCoins,
    lpToken,
    poolRewardTokens
  );

  lpToken.mintedByMarket = market.id;
  lpToken.save();

  // create LP token entitiy in order to have token-pool mapping
  let lpTokenEntity = new LPToken(lpToken.id);
  lpTokenEntity.token = lpToken.id;
  lpTokenEntity.pool = pool.id;
  lpTokenEntity.save();

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

/**
 * Fetch existing pool entity, or create a new one in case where pool "source" is the Curve MetaPool factory contract.
 * @param event
 * @param curvePoolAddress
 * @param factoryAddress
 * @returns
 */
export function getOrCreatePoolViaFactory(
  event: ethereum.Event,
  curvePoolAddress: Address,
  factoryAddress: Address
): PoolEntity {
  let pool = PoolEntity.load(curvePoolAddress.toHexString());
  if (pool != null) {
    return pool as PoolEntity;
  }

  pool = new PoolEntity(curvePoolAddress.toHexString());

  //// n_coins
  let factoryContract = FactoryContract.bind(factoryAddress);
  let numOfCoins: BigInt;
  let coins: Address[];

  // old factory returns 2 values - number of coins, number of underlying coins
  if (factoryAddress.toHexString() == OLD_FACTORY_ADDRESS) {
    let n_coins = factoryContract.try_get_n_coins1(curvePoolAddress);
    if (!n_coins.reverted) {
      numOfCoins = n_coins.value.value0;
    }
    // old factory also returns Address[2] instead of Address[4]
    coins = factoryContract.get_coins1(curvePoolAddress);
  } else {
    // new factory return only number of coins
    numOfCoins = factoryContract.get_n_coins(curvePoolAddress);
    coins = factoryContract.get_coins(curvePoolAddress);
  }
  pool.coinCount = numOfCoins.toI32();

  //// coins
  let poolCoins: Token[] = [];
  for (let i = 0; i < numOfCoins.toI32(); i++) {
    let coin = coins[i];
    let token = getOrCreateERC20Token(event, coin);
    poolCoins.push(token);
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  //// balances
  let poolBalances: BigInt[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    poolBalances.push(BigInt.fromI32(0));
  }
  pool.balances = poolBalances;
  pool.initialBalances = poolBalances;
  pool.lastBlockBalanceUpdated = event.block.number;

  //// total LP supply
  pool.totalSupply = BigInt.fromI32(0);

  //// get LP token
  let lpToken = getOrCreateERC20Token(event, curvePoolAddress);
  pool.lpToken = curvePoolAddress;

  // other
  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.lastTransferToZero = null;
  pool.isInRegistry = false;
  pool.source = CurvePoolSource.METAPOOL_FACTORY;
  pool.factory = factoryAddress.toHexString();

  pool.save();

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    curvePoolAddress,
    ProtocolName.CURVE_POOL,
    ProtocolType.EXCHANGE,
    poolCoins,
    lpToken,
    []
  );

  lpToken.mintedByMarket = market.id;
  lpToken.save();

  // create LP token entitiy in order to have token-pool mapping
  let lpTokenEntity = new LPToken(lpToken.id);
  lpTokenEntity.token = lpToken.id;
  lpTokenEntity.pool = pool.id;
  lpTokenEntity.save();

  // start indexing new pool
  CurvePoolTemplate.create(Address.fromString(pool.id));

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

/**
 * Fetch existing pool entity, or create a new one in case where pool "source" is the Curve registry contract.
 * @param event
 * @param curvePoolAddress
 * @param registryAddress
 * @returns
 */
export function getOrCreatePoolViaRegistry(
  event: ethereum.Event,
  curvePoolAddress: Address,
  registryAddress: Address
): PoolEntity {
  let pool = PoolEntity.load(curvePoolAddress.toHexString());
  if (pool != null) {
    return pool as PoolEntity;
  }

  pool = new PoolEntity(curvePoolAddress.toHexString());
  let registryContract = PoolRegistry.bind(registryAddress);

  //// n_coins
  let n_coins = registryContract.get_n_coins(curvePoolAddress);
  pool.coinCount = n_coins[0].toI32();

  //// coins
  let coins = registryContract.get_coins(curvePoolAddress);
  let poolCoins: Token[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    poolCoins.push(getOrCreateERC20Token(event, coins[i]));
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  // set ABI version
  let poolContract = CurvePool.bind(curvePoolAddress);
  pool.isOldAbiVersion = poolContract.try_balances(BigInt.fromI32(0)).reverted;

  //// get coin balances
  let balances = registryContract.get_balances(curvePoolAddress);
  let poolBalances: BigInt[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    poolBalances.push(balances[i]);
  }
  pool.balances = poolBalances;
  pool.initialBalances = poolBalances;
  pool.lastBlockBalanceUpdated = event.block.number;

  //// get LP token
  let lpTokenAddress = registryContract.get_lp_token(curvePoolAddress);
  let lpToken = getOrCreateERC20Token(event, lpTokenAddress);
  pool.lpToken = lpTokenAddress;

  //// get total supply using contract call
  let lpContract = ERC20Contract.bind(lpTokenAddress);
  pool.totalSupply = lpContract.totalSupply();

  // other
  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.lastTransferToZero = null;
  pool.source = CurvePoolSource.REGISTRY;
  pool.isInRegistry = true;
  pool.registry = registryAddress.toHexString();

  pool.save();

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    curvePoolAddress,
    ProtocolName.CURVE_POOL,
    ProtocolType.EXCHANGE,
    poolCoins,
    lpToken,
    []
  );

  lpToken.mintedByMarket = market.id;
  lpToken.save();

  // create LP token entitiy in order to have token-pool mapping
  let lpTokenEntity = new LPToken(lpTokenAddress.toHexString());
  lpTokenEntity.token = lpTokenAddress.toHexString();
  lpTokenEntity.pool = pool.id;
  lpTokenEntity.save();

  // start indexing new pool
  CurvePoolTemplate.create(Address.fromString(pool.id));

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

/**
 * Create tracker for number of LP token owned by user.
 * @param account
 * @param pool
 * @returns
 */
export function getOrCreateAccountLiquidity(
  account: AccountEntity,
  pool: PoolEntity
): AccountLiquidityEntity {
  let id = account.id.concat("-").concat(pool.id);
  let liquidity = AccountLiquidityEntity.load(id);
  if (liquidity != null) {
    return liquidity as AccountLiquidityEntity;
  }

  // init account balance tracker
  liquidity = new AccountLiquidityEntity(id);
  liquidity.pool = pool.id;
  liquidity.account = account.id;
  liquidity.balance = BigInt.fromI32(0);

  if (pool.source == CurvePoolSource.REGISTRY) {
    liquidity.isPositionPossiblyIncomplete = true;
  } else {
    liquidity.isPositionPossiblyIncomplete = false;
  }

  liquidity.save();
  return liquidity as AccountLiquidityEntity;
}

/**
 * Get pool balances of input tokens using contract call. Contract to be queried depends on the source of the Curve pool.
 * @param pool
 * @param block
 * @returns
 */
export function getPoolBalances(pool: PoolEntity, block: BigInt): BigInt[] {
  log.info("XXXXX getPoolBalances at pool={}", [pool.id]);
  log.info("XXXXX pool.source={}", [pool.source]);
  log.info("XXXXX pool.blockNumber={}", [pool.blockNumber.toString()]);
  log.info("XXXXX pool.lastBlockBalanceUpdated={}", [pool.lastBlockBalanceUpdated.toString()]);

  // no action needed if balances are up-to-date
  if (block == pool.lastBlockBalanceUpdated) {
    return pool.balances;
  }

  let poolAddress = Address.fromString(pool.id);
  let poolBalances: BigInt[] = [];

  // if pool is created from metapool factory, query factory for balances with single call
  if (pool.source == CurvePoolSource.METAPOOL_FACTORY) {
    let factoryAddress = Address.fromString(pool.factory as string);
    let factoryContract = FactoryContract.bind(factoryAddress);
    let balances: BigInt[];

    log.info("XXXXX pool.factory={}", [pool.factory]);
    log.info("XXXXX factoryAddress={}", [factoryAddress.toHexString()]);

    if (factoryAddress.toHexString() == OLD_FACTORY_ADDRESS) {
      // old factory contract uses BigInt[2] instead of BigInt[4]
      balances = factoryContract.get_balances1(poolAddress);
    } else {
      log.info("XXXXX doing call on get_balances", []);

      balances = factoryContract.get_balances(poolAddress);

      log.info("XXXXX DONE!", []);
    }

    for (let i = 0; i < pool.coinCount; i++) {
      log.info("XXXXX add....", [balances[i].toString()]);

      poolBalances.push(balances[i]);
    }
  }
  // if pool is part of registry, query factory for balances with single call
  else if (pool.isInRegistry) {
    log.info("XXXXX IN REGISTRY", []);

    let registryContract = PoolRegistry.bind(Address.fromString(pool.registry as string));
    let balances = registryContract.get_balances(poolAddress);
    for (let i = 0; i < pool.coinCount; i++) {
      poolBalances.push(balances[i]);
    }
  }
  // else query the pool contract directly, per every coin
  else {
    log.info("XXXXX ELSE", []);

    let poolContract = CurvePool.bind(poolAddress);

    if (!pool.isOldAbiVersion) {
      for (let i = 0; i < pool.coinCount; i++) {
        poolBalances.push(poolContract.balances(BigInt.fromI32(i)));
      }
    } else {
      for (let i = 0; i < pool.coinCount; i++) {
        poolBalances.push(poolContract.balances1(BigInt.fromI32(i)));
      }
    }
  }

  pool.lastBlockBalanceUpdated = block;
  pool.save();

  return poolBalances;
}

/**
 * Create RemoveLiquidityOne entity with pool ID
 * @param id
 * @param pool
 * @returns
 */
export function getOrCreateRemoveLiquidityOneEvent(
  id: string,
  pool: PoolEntity
): RemoveLiqudityOneEventEntity {
  let removeLiquidityEvent = RemoveLiqudityOneEventEntity.load(id);
  if (removeLiquidityEvent != null) {
    return removeLiquidityEvent as RemoveLiqudityOneEventEntity;
  }
  removeLiquidityEvent = new RemoveLiqudityOneEventEntity(id);
  removeLiquidityEvent.pool = pool.id;
  removeLiquidityEvent.eventApplied = false;
  removeLiquidityEvent.callApplied = false;
  removeLiquidityEvent.save();

  return removeLiquidityEvent as RemoveLiqudityOneEventEntity;
}

/**
 * Get LpToken address from pre-defined pool to LpToken map
 * @param pool
 * @returns
 */
export function getLpTokenOfPool(pool: Address): Address {
  let p: PoolStaticInfo = addressToPool.get(pool.toHexString()) as PoolStaticInfo;
  let lpTokenAddress = p.lpTokenAddress;

  if (lpTokenAddress == null) {
    return null;
  }

  return Address.fromString(lpTokenAddress);
}

/**
 * Create LPToken entity and save reference to pool it belongs to.
 * @param lpTokenAddress
 * @param poolAddress
 * @returns
 */
export function getOrCreateLpToken(lpTokenAddress: string, poolAddress: string): LPToken {
  let lpToken = LPToken.load(lpTokenAddress);
  if (lpToken != null) {
    return lpToken as LPToken;
  }

  lpToken = new LPToken(lpTokenAddress);
  lpToken.token = lpTokenAddress;
  lpToken.pool = poolAddress;
  lpToken.save();

  return lpToken as LPToken;
}

/**
 * Create MetaPoolFactory entity. Source of MetaPoolFactory can be hard-coded dataSource in manifest or template created on AddressProvider event.
 * @param factoryAddress
 * @returns
 */
export function getOrCreateMetaPoolFactory(factoryAddress: Address): MetaPoolFactory {
  let factory = MetaPoolFactory.load(factoryAddress.toHexString());
  if (factory != null) {
    return factory as MetaPoolFactory;
  }

  factory = new MetaPoolFactory(factoryAddress.toHexString());
  factory.poolCount = BigInt.fromI32(0);

  factory.save();

  return factory as MetaPoolFactory;
}
