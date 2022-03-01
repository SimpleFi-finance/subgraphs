import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Account as AccountEntity,
  AccountLiquidity as AccountLiquidityEntity,
  Market as MarketEntity,
  Pool as PoolEntity,
  PoolSnapshot as PoolSnapshotEntity,
  RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity,
  Token,
  AddressProvider,
} from "../generated/schema";

import { PoolRegistry } from "../generated/templates/PoolRegistry/PoolRegistry";
import { MetaPoolFactory as FactoryContract } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { ERC20 as ERC20Contract } from "../generated/templates/PoolLPToken/ERC20";

import { PoolLPToken } from "../generated/templates";

import {
  ADDRESS_ZERO,
  getOrCreateERC20Token,
  getOrCreateMarket,
  TokenBalance,
  updateMarket,
} from "./common";

import {
  ProtocolName,
  ProtocolType,
  PoolStaticInfo,
  addressToPool,
  lpTokenToPool,
} from "./constants";
import { CurvePool } from "../generated/templates/CurvePool/CurvePool";
import { CurvePool as CurvePoolTemplate } from "../generated/templates";

export namespace CurvePoolType {
  export const PLAIN = "PLAIN";
  export const LENDING = "LENDING";
  export const META = "META";
}

class PoolInfo {
  coins: Address[];
  underlyingCoins: Address[];
  balances: BigInt[];
}

const ADDRESS_PROVIDER = "0x0000000022d53366457f9d5e68ec105046fc4383";
const METAPOOL_FACTORY = "metapool-factory";
const HARD_CODED = "hard-coded";
const REGISTRY = "registry";

export function getOrCreatePool(event: ethereum.Event, address: Address): PoolEntity {
  let pool = PoolEntity.load(address.toHexString());

  if (pool != null) {
    return pool as PoolEntity;
  }

  let staticInfo: PoolStaticInfo = addressToPool.get(address.toHexString()) as PoolStaticInfo;
  let contractInfo: PoolInfo = getPoolInfo(address);

  pool = new PoolEntity(address.toHexString());
  pool.coinCount = contractInfo.coins.length;

  let poolCoins: Token[] = [];
  for (let i = 0; i < contractInfo.coins.length; i++) {
    let coin = contractInfo.coins[i];
    let token = getOrCreateERC20Token(event, coin);
    poolCoins.push(token);
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  let poolUnderlyingCoins: Token[] = [];
  for (let i = 0; i < contractInfo.underlyingCoins.length; i++) {
    let coin = contractInfo.underlyingCoins[i];
    let token = getOrCreateERC20Token(event, coin);
    poolUnderlyingCoins.push(token);
  }
  pool.underlyingCoins = poolUnderlyingCoins.map<string>((t) => t.id);

  pool.balances = contractInfo.balances;
  pool.initialBalances = contractInfo.balances;
  pool.totalSupply = BigInt.fromI32(0);
  let lpToken = getOrCreateERC20Token(event, Address.fromString(staticInfo.lpTokenAddress));
  pool.lpToken = Address.fromString(staticInfo.lpTokenAddress);

  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.source = HARD_CODED;
  pool.isInRegistry = false;

  pool.save();

  let poolRewardTokens: Token[] = [];

  // Create Market entity
  let market = getOrCreateMarket(
    event,
    address,
    ProtocolName.CURVE_POOL,
    ProtocolType.EXCHANGE,
    poolCoins,
    lpToken,
    poolRewardTokens
  );

  lpToken.mintedByMarket = market.id;
  lpToken.save();

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

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

  // n_coins
  let contract = FactoryContract.bind(factoryAddress);
  let n_coins = contract.try_get_n_coins(curvePoolAddress);

  let numOfCoins: BigInt;
  let numOfUnderlyingCoins: BigInt;

  if (!n_coins.reverted) {
    numOfCoins = n_coins.value.value0;
    numOfUnderlyingCoins = n_coins.value.value1;
  } else {
    // if there's no contract call available assume it's 1 coin + 1 LP (3 underlying) coin
    numOfCoins = BigInt.fromI32(2);
    numOfUnderlyingCoins = BigInt.fromI32(4);
  }
  pool.coinCount = numOfCoins.toI32();

  // coins
  let coins = contract.get_coins(curvePoolAddress);
  let poolCoins: Token[] = [];
  for (let i = 0; i < numOfCoins.toI32(); i++) {
    let coin = coins[i];
    let token = getOrCreateERC20Token(event, coin);
    poolCoins.push(token);
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  // underlying coins
  let underlyingCoins = contract.get_underlying_coins(curvePoolAddress);
  let poolUnderlyingCoins: Token[] = [];
  for (let i = 0; i < numOfUnderlyingCoins.toI32(); i++) {
    let underlyingCoin = underlyingCoins[i];
    let token = getOrCreateERC20Token(event, underlyingCoin);
    poolUnderlyingCoins.push(token);
  }
  pool.underlyingCoins = poolUnderlyingCoins.map<string>((t) => t.id);

  // get coin balances
  let coinBalances = contract.get_balances(curvePoolAddress);
  let balances: BigInt[] = [];
  for (let i = 0; i < numOfCoins.toI32(); i++) {
    balances.push(coinBalances[i]);
  }
  pool.balances = balances;
  pool.initialBalances = balances;

  // init to zero
  pool.totalSupply = BigInt.fromI32(0);

  // get LP token
  let lpToken = getOrCreateERC20Token(event, curvePoolAddress);
  pool.lpToken = curvePoolAddress;

  // other
  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.lastTransferToZero = null;
  pool.isInRegistry = false;
  pool.source = METAPOOL_FACTORY;

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

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

export function getOrCreatePoolViaRegistry(
  event: ethereum.Event,
  curvePoolAddress: Address
): PoolEntity {
  let pool = PoolEntity.load(curvePoolAddress.toHexString());
  if (pool != null) {
    return pool as PoolEntity;
  }

  pool = new PoolEntity(curvePoolAddress.toHexString());
  let addressProvider = AddressProvider.load(ADDRESS_PROVIDER);
  let registryAddress = Address.fromString(addressProvider.registry as string);

  let contract = PoolRegistry.bind(registryAddress);
  let n_coins = contract.get_n_coins(curvePoolAddress);
  let numOfCoins = n_coins[0];
  let numOfUnderlyingCoins = n_coins[1];

  // n_coins
  pool.coinCount = numOfCoins[0];

  // coins
  let coins = contract.get_coins(curvePoolAddress);
  let poolCoins: Token[] = [];
  for (let i = 0; i < numOfCoins.toI32(); i++) {
    let coin = coins[i];
    let token = getOrCreateERC20Token(event, coin);
    poolCoins.push(token);
  }
  pool.coins = poolCoins.map<string>((t) => t.id);

  // underlying coins
  let underlyingCoins = contract.get_underlying_coins(curvePoolAddress);
  let poolUnderlyingCoins: Token[] = [];
  for (let i = 0; i < numOfUnderlyingCoins.toI32(); i++) {
    let underlyingCoin = underlyingCoins[i];
    let token = getOrCreateERC20Token(event, underlyingCoin);
    poolUnderlyingCoins.push(token);
  }
  pool.underlyingCoins = poolUnderlyingCoins.map<string>((t) => t.id);

  // get coin balances
  let coinBalances = contract.get_balances(curvePoolAddress);
  let balances: BigInt[] = [];
  for (let i = 0; i < numOfCoins.toI32(); i++) {
    balances.push(coinBalances[i]);
  }
  pool.balances = balances;
  pool.initialBalances = balances;

  // get LP token
  let lpTokenAddress = contract.get_lp_token(curvePoolAddress);
  let lpToken = getOrCreateERC20Token(event, lpTokenAddress);
  pool.lpToken = lpTokenAddress;

  // get total supply using contract call
  let lpContract = ERC20Contract.bind(lpTokenAddress);
  pool.totalSupply = lpContract.totalSupply();

  // other
  pool.blockNumber = event.block.number;
  pool.timestamp = event.block.timestamp;
  pool.lastTransferToZero = null;
  pool.source = REGISTRY;
  pool.isInRegistry = true;

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

  // start indexing new pool
  CurvePoolTemplate.create(Address.fromString(pool.id));

  // start indexing LP token to track transfers
  PoolLPToken.create(pool.lpToken as Address);

  return pool as PoolEntity;
}

export function createPoolSnapshot(event: ethereum.Event, pool: PoolEntity): PoolSnapshotEntity {
  let transactionHash = event.transaction.hash.toHexString();
  let id = transactionHash.concat("-").concat(event.logIndex.toHexString());
  let poolSnapshot = PoolSnapshotEntity.load(id);
  if (poolSnapshot != null) {
    return poolSnapshot as PoolSnapshotEntity;
  }

  poolSnapshot = new PoolSnapshotEntity(id);
  poolSnapshot.pool = pool.id;
  poolSnapshot.balances = pool.balances;
  poolSnapshot.totalSupply = pool.totalSupply;
  poolSnapshot.blockNumber = event.block.number;
  poolSnapshot.timestamp = event.block.timestamp;
  poolSnapshot.transactionHash = transactionHash;
  poolSnapshot.transactionIndexInBlock = event.transaction.index;
  poolSnapshot.logIndex = event.logIndex;
  poolSnapshot.save();

  return poolSnapshot as PoolSnapshotEntity;
}

export function updatePool(
  event: ethereum.Event,
  pool: PoolEntity,
  balances: BigInt[],
  totalSupply: BigInt
): PoolEntity {
  createPoolSnapshot(event, pool);

  pool.balances = balances;
  pool.totalSupply = totalSupply;
  pool.save();

  let market = MarketEntity.load(pool.id) as MarketEntity;

  let coins = pool.coins;
  let inputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokenBalances.push(new TokenBalance(coins[i], pool.id, balances[i]));
  }
  updateMarket(event, market, inputTokenBalances, pool.totalSupply);

  return pool;
}

export function getPoolInfo(pool: Address): PoolInfo {
  let staticInfo: PoolStaticInfo = addressToPool.get(pool.toHexString()) as PoolStaticInfo;

  let coins: Address[] = [];
  let balances: BigInt[] = [];
  let underlyingCoins: Address[] = [];

  let c: ethereum.CallResult<Address>;
  let b: ethereum.CallResult<BigInt>;
  let u: ethereum.CallResult<Address>;

  let contract = CurvePool.bind(pool);
  for (let i = 0; i < staticInfo.coinCount; i++) {
    let ib = BigInt.fromI32(i);
    c = contract.try_coins(ib);
    b = contract.try_balances(ib);

    if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO && !b.reverted) {
      coins.push(c.value);
      balances.push(b.value);
    } else {
      c = contract.try_coins1(ib);
      b = contract.try_balances1(ib);

      if (!c.reverted && c.value.toHexString() != ADDRESS_ZERO && !b.reverted) {
        coins.push(c.value);
        balances.push(b.value);
      }
    }

    if (staticInfo.poolType == CurvePoolType.LENDING) {
      u = contract.try_underlying_coins(ib);
      if (!u.reverted) {
        underlyingCoins.push(u.value);
      }
    }
  }

  return {
    coins,
    underlyingCoins,
    balances,
  };
}

export function getOrCreateAccountLiquidity(
  account: AccountEntity,
  pool: PoolEntity
): AccountLiquidityEntity {
  let id = account.id.concat("-").concat(pool.id);
  let liquidity = AccountLiquidityEntity.load(id);
  if (liquidity != null) {
    return liquidity as AccountLiquidityEntity;
  }
  liquidity = new AccountLiquidityEntity(id);
  liquidity.pool = pool.id;
  liquidity.account = account.id;
  liquidity.balance = BigInt.fromI32(0);
  liquidity.save();
  return liquidity as AccountLiquidityEntity;
}

export function getPoolBalances(pool: PoolEntity, block: BigInt): BigInt[] {
  let balances: BigInt[] = [];

  let balance: ethereum.CallResult<BigInt>;
  let contract = CurvePool.bind(Address.fromString(pool.id));

  if (pool.coinCount > 0) {
    balance = contract.try_balances(BigInt.fromI32(0));
    // check if contract call is of type v1 or v2
    if (!balance.reverted) {
      balances.push(balance.value);
      for (let i = 1; i < pool.coinCount; i++) {
        balances.push(contract.balances(BigInt.fromI32(i)));
      }
    } else {
      balance = contract.try_balances1(BigInt.fromI32(0));
      if (!balance.reverted) {
        balances.push(balance.value);
        for (let i = 1; i < pool.coinCount; i++) {
          balances.push(contract.balances1(BigInt.fromI32(i)));
        }
      }
    }
  }

  // if (pool.source == REGISTRY) {
  //   let addressProvider = AddressProvider.load(ADDRESS_PROVIDER);
  //   let registryAddress = Address.fromString(addressProvider.registry as string);
  //   let contract = PoolRegistry.bind(registryAddress);

  //   // get coin balances
  //   let coinBalances = contract.get_balances(Address.fromString(pool.id));
  //   let balances: BigInt[] = [];
  //   for (let i = 0; i < pool.coinCount.toI32(); i++) {
  //     balances.push(coinBalances[i]);
  //   }
  // }

  pool.lastBlockBalanceUpdated = block;
  pool.save();

  return balances;
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
 * Get pool address from list of pre-defined pool to LpToken mapping
 * @param pool
 * @returns
 */
export function getPoolFromLpToken(lpToken: Address): Address {
  let poolAddress = lpTokenToPool.get(lpToken.toHexString()) as string;

  if (poolAddress == null) {
    return null;
  }

  return Address.fromString(poolAddress);
}
