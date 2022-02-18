import { BigInt } from "@graphprotocol/graph-ts";

import { PoolAdded } from "../generated/templates/PoolRegistry/PoolRegistry";

import { Pool, Token } from "../generated/schema";

import { PoolRegistry } from "../generated/templates/PoolRegistry/PoolRegistry";

import { getOrCreateERC20Token, getOrCreateMarket } from "./common";
import { ProtocolName, ProtocolType } from "./constants";

export function handlePoolAdded(event: PoolAdded): void {
  let curvePoolAddress = event.params.pool;
  let registryAddress = event.address;

  let pool = Pool.load(curvePoolAddress.toHexString());

  if (pool == null) {
    pool = new Pool(curvePoolAddress.toHexString());

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

    // init to zero
    pool.totalSupply = BigInt.fromI32(0);

    // get LP token
    let lpTokenAddress = contract.get_lp_token(curvePoolAddress);
    let lpToken = getOrCreateERC20Token(event, lpTokenAddress);
    pool.lpToken = lpTokenAddress;

    // other
    pool.blockNumber = event.block.number;
    pool.timestamp = event.block.timestamp;
    pool.lastTransferToZero = null;

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
  }
}
