import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";

import {
  AddLiquidity as AddLiquidity2Coins,
  AddLiquidity1 as AddLiquidity3Coins,
  AddLiquidity2 as AddLiquidity4Coins,
  AddLiquidity3 as AddLiquidityTriCrypto,
  RemoveLiquidity as RemoveLiquidity2Coins,
  RemoveLiquidity1 as RemoveLiquidity3Coins,
  RemoveLiquidity2 as RemoveLiquidity4Coins,
  RemoveLiquidity3 as RemoveLiquidityTriCrypto,
  RemoveLiquidityImbalance as RemoveLiquidityImbalance2Coins,
  RemoveLiquidityImbalance1 as RemoveLiquidityImbalance3Coins,
  RemoveLiquidityImbalance2 as RemoveLiquidityImbalance4Coins,
  RemoveLiquidityOne as RemoveLiquidityOne_v1,
  RemoveLiquidityOne1 as RemoveLiquidityOne_v2,
  Remove_liquidity_one_coinCall,
  Remove_liquidity_one_coin1Call as Remove_liquidity_one_coinCall_TriCrypto,
  TokenExchange,
  TokenExchange1 as TokenExchangeTriCrypto,
  TokenExchangeUnderlying,
} from "../generated/templates/CurvePool/CurvePool";

import { ERC20, Transfer } from "../generated/templates/PoolLPToken/ERC20";
import {
  LPToken,
  LPTokenTransferToZero as LPTokenTransferToZeroEntity,
  Market as MarketEntity,
  Pool as PoolEntity,
  RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity,
} from "../generated/schema";

import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket,
} from "./common";
import {
  getOrCreatePool,
  getOrCreateAccountLiquidity,
  getOrCreateRemoveLiquidityOneEvent,
  getPoolBalances,
} from "./curveUtil";

///// add liquidity

export function handleAddLiquidity2Coins(event: AddLiquidity2Coins): void {
  handleAddLiquidityCommon(
    event,
    event.address,
    event.params.token_supply,
    event.params.token_amounts,
    event.params.provider
  );
}

export function handleAddLiquidity3Coins(event: AddLiquidity3Coins): void {
  handleAddLiquidityCommon(
    event,
    event.address,
    event.params.token_supply,
    event.params.token_amounts,
    event.params.provider
  );
}

export function handleAddLiquidity4Coins(event: AddLiquidity4Coins): void {
  handleAddLiquidityCommon(
    event,
    event.address,
    event.params.token_supply,
    event.params.token_amounts,
    event.params.provider
  );
}

export function handleAddLiquidityTriCrypto(event: AddLiquidityTriCrypto): void {
  handleAddLiquidityCommon(
    event,
    event.address,
    event.params.token_supply,
    event.params.token_amounts,
    event.params.provider
  );
}

/**
 * Function receives unpacked event params (in order to support different
 * event signatures) and handles the AddLiquidity event.
 * @param event
 * @param poolAddress
 * @param newTotalSupply
 * @param inputTokenAmountProvided
 * @param provider
 */
function handleAddLiquidityCommon(
  event: ethereum.Event,
  poolAddress: Address,
  newTotalSupply: BigInt,
  inputTokenAmountProvided: BigInt[],
  provider: Address
): void {
  // fetch pool
  let pool = getOrCreatePool(event, poolAddress);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // Update pool entity balances and totalSupply of LP tokens
  let oldTotalSupply = pool.totalSupply;

  // add tokens provided to market's input token balance
  let market = MarketEntity.load(pool.id) as MarketEntity;
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newInputTokenBalances: BigInt[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    let oldBalance = TokenBalance.fromString(inputTokenTotalBalances[i]).balance;
    let newBalance = oldBalance.plus(inputTokenAmountProvided[i]);
    newInputTokenBalances.push(newBalance);
  }

  // If token supply in event is 0, then check directly from contract
  let currentTokenSupply = newTotalSupply;
  if (currentTokenSupply == BigInt.fromI32(0)) {
    let contract = ERC20.bind(pool.lpToken as Address);
    let supply = contract.try_totalSupply();
    if (!supply.reverted) {
      currentTokenSupply = supply.value;
    }
  }

  // update pool state
  pool.balances = newInputTokenBalances;
  pool.totalSupply = currentTokenSupply;
  pool.save();

  // update market state
  let coins = pool.coins;
  let inputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokenBalances.push(new TokenBalance(coins[i], pool.id, newInputTokenBalances[i]));
  }
  updateMarket(event, market, inputTokenBalances, currentTokenSupply);

  ///// update user position

  // Update AccountLiquidity to track LPToken balance of account
  let account = getOrCreateAccount(provider);
  let lpTokensMinted = newTotalSupply.minus(oldTotalSupply);

  let accountLiquidity = getOrCreateAccountLiquidity(account, pool);
  accountLiquidity.balance = accountLiquidity.balance.plus(lpTokensMinted);
  accountLiquidity.save();

  // Collect data for position update
  let lpTokensBalance = accountLiquidity.balance;
  let providedTokenAmounts = inputTokenAmountProvided;
  let inputTokensProvided: TokenBalance[] = [];
  let inputTokensBalance: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokensProvided.push(new TokenBalance(coins[i], account.id, providedTokenAmounts[i]));

    // number of pool input tokens that can be redeemed by account's LP tokens
    let inputBalance = newInputTokenBalances[i].times(lpTokensBalance).div(pool.totalSupply);
    inputTokensBalance.push(new TokenBalance(coins[i], account.id, inputBalance));
  }

  // use common function to update position and store transaction
  investInMarket(
    event,
    account,
    market,
    lpTokensMinted,
    inputTokensProvided,
    [],
    lpTokensBalance,
    inputTokensBalance,
    [],
    null
  );
}

///// remove liquidity

export function handleRemoveLiquidity2Coins(event: RemoveLiquidity2Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidity3Coins(event: RemoveLiquidity3Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidity4Coins(event: RemoveLiquidity4Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidityTriCrypto(event: RemoveLiquidityTriCrypto): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidityImbalance2Coins(event: RemoveLiquidityImbalance2Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidityImbalance3Coins(event: RemoveLiquidityImbalance3Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

export function handleRemoveLiquidityImbalance4Coins(event: RemoveLiquidityImbalance4Coins): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update all relevant entities
  handleRemoveLiquidityCommon(
    event,
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.params.token_supply
  );
}

/**
 * Common function for entity update after liquidity removal
 * @param event
 * @param pool
 * @param provider
 * @param tokenAmountsWithdrawn
 * @param newTotalSupply
 */
function handleRemoveLiquidityCommon(
  event: ethereum.Event,
  pool: PoolEntity,
  provider: Address,
  tokenAmountsWithdrawn: BigInt[],
  newTotalSupply: BigInt
): void {
  //// update market state
  let oldTotalSupply = pool.totalSupply;

  let market = MarketEntity.load(pool.id) as MarketEntity;

  // substract withdrawn tokens from market's input token balance
  let inputTokenTotalBalances = market.inputTokenTotalBalances as string[];
  let newInputTokenBalances: BigInt[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    let oldBalance = TokenBalance.fromString(inputTokenTotalBalances[i]).balance;
    let newBalance = oldBalance.minus(tokenAmountsWithdrawn[i]);
    newInputTokenBalances.push(newBalance);
  }

  pool.balances = newInputTokenBalances;
  pool.totalSupply = newTotalSupply;
  pool.save();

  let coins = pool.coins;
  let inputTokenMarketBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokenMarketBalances.push(new TokenBalance(coins[i], pool.id, newInputTokenBalances[i]));
  }
  updateMarket(event, market, inputTokenMarketBalances, newTotalSupply);

  pool.lastTransferToZero = null;
  pool.save();

  //// update AccountLiquidity
  let account = getOrCreateAccount(provider);
  let lpTokenAmount = oldTotalSupply.minus(newTotalSupply);

  let accountLiquidity = getOrCreateAccountLiquidity(account, pool);
  accountLiquidity.balance = accountLiquidity.balance.minus(lpTokenAmount);
  accountLiquidity.save();

  //// update user position
  let accountLpTokenBalance = accountLiquidity.balance;
  let inputTokensWithdrawn: TokenBalance[] = [];
  let inputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokensWithdrawn.push(new TokenBalance(coins[i], account.id, tokenAmountsWithdrawn[i]));

    let inputBalance: BigInt;
    //in case there is no liquidity
    if (pool.totalSupply == BigInt.fromI32(0)) {
      inputBalance = BigInt.fromI32(0);
    } else {
      inputBalance = newInputTokenBalances[i].times(accountLiquidity.balance).div(pool.totalSupply);
    }
    inputTokenBalances.push(new TokenBalance(coins[i], account.id, inputBalance));
  }

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    account,
    market,
    lpTokenAmount,
    inputTokensWithdrawn,
    [],
    accountLpTokenBalance,
    inputTokenBalances,
    [],
    null
  );
}

///// token exchange

export function handleTokenExchange(event: TokenExchange): void {
  handleTokenExchangeCommon(event, event.address);
}

export function handleTokenExchangeTriCrypto(event: TokenExchangeTriCrypto): void {
  handleTokenExchangeCommon(event, event.address);
}

export function handleTokenExchangeUnderlying(event: TokenExchangeUnderlying): void {
  handleTokenExchangeCommon(event, event.address);
}

/**
 * Function receives unpacked event params (in order to support different
 * event signatures) and handles the TokenExchange event.
 * @param event
 * @param poolAddress
 */
function handleTokenExchangeCommon(event: ethereum.Event, poolAddress: Address): void {
  // create pool
  let pool = getOrCreatePool(event, poolAddress);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update pool entity with new token balances
  let newPoolBalances = getPoolBalances(pool, event.block.number);

  pool.balances = newPoolBalances;
  pool.save();

  let coins = pool.coins;
  let inputTokenMarketBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokenMarketBalances.push(new TokenBalance(coins[i], pool.id, newPoolBalances[i]));
  }

  let market = MarketEntity.load(pool.id) as MarketEntity;
  updateMarket(event, market, inputTokenMarketBalances, pool.totalSupply);
}

///// remove liquidity one coin event

export function handleRemoveLiquidityOne_v1(event: RemoveLiquidityOne_v1): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // create RemoveLiquidityOne entity
  let id = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(pool.id);
  let entity = getOrCreateRemoveLiquidityOneEvent(id, pool);
  entity.eventApplied = true;
  entity.account = getOrCreateAccount(event.params.provider).id;
  entity.tokenAmount = event.params.token_amount;
  entity.dy = event.params.coin_amount;
  entity.logIndex = event.logIndex;
  entity.save();

  handleRLOEEntityUpdate(event, entity, pool);
}

export function handleRemoveLiquidityOne_v2(event: RemoveLiquidityOne_v2): void {
  // create pool
  let pool = getOrCreatePool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // create RemoveLiquidityOne entity
  let id = event.transaction.hash
    .toHexString()
    .concat("-")
    .concat(pool.id);
  let entity = getOrCreateRemoveLiquidityOneEvent(id, pool);
  entity.eventApplied = true;
  entity.account = getOrCreateAccount(event.params.provider).id;
  entity.tokenAmount = event.params.token_amount;
  entity.dy = event.params.coin_amount;
  entity.logIndex = event.logIndex;
  entity.save();

  handleRLOEEntityUpdate(event, entity, pool);
}

/**
 * Collect data about one coin liquidity removal
 * @param event
 * @param entity
 * @param pool
 * @returns
 */
function handleRLOEEntityUpdate(
  event: ethereum.Event,
  entity: RemoveLiqudityOneEventEntity,
  pool: PoolEntity
): void {
  // handle liquidity removal only after both event and call are handled
  if (!entity.eventApplied || !entity.callApplied) {
    return;
  }

  // collect data from RemoveLiqudityOneEvent entity
  let tokenAmount = entity.tokenAmount as BigInt;
  let i = entity.i as i32;
  let dy = entity.dy as BigInt;
  let provider = Address.fromString(entity.account);

  let tokenAmounts: BigInt[] = [];
  for (let j = 0; j < pool.coinCount; j++) {
    if (j == i) {
      tokenAmounts[j] = dy;
    } else {
      tokenAmounts[j] = BigInt.fromI32(0);
    }
  }

  let totalSupply = pool.totalSupply.minus(tokenAmount);

  // use common function to update entities
  handleRemoveLiquidityCommon(event, pool, provider, tokenAmounts, totalSupply);
}

///// remove liquidity one coin call

export function handleRemoveLiquidityOneCall(call: Remove_liquidity_one_coinCall): void {
  handleRemoveLiquidityOneCallCommon(call, call.inputs.i);
}

export function handleRemoveLiquidityOneTriCryptoCall(
  call: Remove_liquidity_one_coinCall_TriCrypto
): void {
  handleRemoveLiquidityOneCallCommon(call, call.inputs.i);
}

/**
 * Function receives unpacked call params (in order to support different
 * event signatures) and handles the RemoveLiquidityOneCall event.
 * @param call
 * @param i
 */
function handleRemoveLiquidityOneCallCommon(call: ethereum.Call, i: BigInt): void {
  // load pool
  let pool = PoolEntity.load(call.to.toHexString()) as PoolEntity;

  // update RemoveLiquidityOne entity
  let id = call.transaction.hash
    .toHexString()
    .concat("-")
    .concat(pool.id);
  let entity = getOrCreateRemoveLiquidityOneEvent(id, pool);
  entity.i = i.toI32();
  entity.callApplied = true;
  entity.save();

  let event = new ethereum.Event();
  event.block = call.block;
  event.transaction = call.transaction;
  event.logIndex = entity.logIndex as BigInt;
  handleRLOEEntityUpdate(event, entity, pool);
}

///// LP token transfer

/**
 * Catch transfer of pool LP token.
 * @param event
 * @returns
 */
export function handleTransfer(event: Transfer): void {
  // don't handle zero-value tranfers or transfers from zero-address
  if (event.params.value == BigInt.fromI32(0) || event.params.from.toHexString() == ADDRESS_ZERO) {
    return;
  }

  let lpToken = LPToken.load(event.address.toHexString());
  let pool = getOrCreatePool(event, Address.fromString(lpToken.pool));

  // if receiver is zero-address create tranferToZero entity and return
  if (event.params.to.toHexString() == ADDRESS_ZERO) {
    let transferToZero = new LPTokenTransferToZeroEntity(event.transaction.hash.toHexString());
    transferToZero.from = event.params.from;
    transferToZero.to = event.params.to;
    transferToZero.value = event.params.value;
    transferToZero.save();

    pool.lastTransferToZero = transferToZero.id;
    pool.save();

    return;
  }

  // update all relevant entities
  transferLPToken(event, pool, event.params.from, event.params.to, event.params.value);
}

/**
 * Update sender's and receiver's positions when LP token is transferred
 * @param event
 * @param pool
 * @param from
 * @param to
 * @param value
 */
function transferLPToken(
  event: ethereum.Event,
  pool: PoolEntity,
  from: Address,
  to: Address,
  value: BigInt
): void {
  // Substract transferred LP tokens from sender's account
  let fromAccount = getOrCreateAccount(from);
  let fromLpTokensTransferred = value;

  let fromAccountLiquidity = getOrCreateAccountLiquidity(fromAccount, pool);
  let newFromBalance = fromAccountLiquidity.balance.minus(fromLpTokensTransferred);
  fromAccountLiquidity.balance = newFromBalance;
  fromAccountLiquidity.save();

  // Collect data for position update
  let market = MarketEntity.load(pool.id) as MarketEntity;
  let fromLpTokenBalance = fromAccountLiquidity.balance;
  let fromInputTokenBalances: TokenBalance[] = [];
  let coins = pool.coins;
  let balances = pool.balances;
  for (let i = 0; i < pool.coinCount; i++) {
    // number of pool input tokens that can be redeemed by account's LP tokens
    let inputBalance = balances[i].times(fromAccountLiquidity.balance).div(pool.totalSupply);
    fromInputTokenBalances.push(new TokenBalance(coins[i], fromAccount.id, inputBalance));
  }

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    fromAccount,
    market,
    fromLpTokensTransferred,
    [],
    [],
    fromLpTokenBalance,
    fromInputTokenBalances,
    [],
    to.toHexString()
  );

  // Add transferred LP tokens to receiver's account
  let toAccount = getOrCreateAccount(to);
  let toLpTokensReceived = value;
  let toAccountLiquidity = getOrCreateAccountLiquidity(toAccount, pool);
  let newToBalance = toAccountLiquidity.balance.plus(toLpTokensReceived);
  toAccountLiquidity.balance = newToBalance;
  toAccountLiquidity.save();

  // Collect data for position update
  let toOutputTokenBalance = toAccountLiquidity.balance;
  let toInputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < pool.coinCount; i++) {
    // number of pool input tokens that can be redeemed by account's LP tokens
    let inputBalance = balances[i].times(toAccountLiquidity.balance).div(pool.totalSupply);
    toInputTokenBalances.push(new TokenBalance(coins[i], toAccount.id, inputBalance));
  }

  // use common function to update position and store transaction
  investInMarket(
    event,
    toAccount,
    market,
    toLpTokensReceived,
    [],
    [],
    toOutputTokenBalance,
    toInputTokenBalances,
    [],
    from.toHexString()
  );
}

/**
 * Check if there is a pending transfer of LP tokens to zero address.
 * If yes, and it is not part of add/remove liquidity events, then update sender's position
 * Otherwise positions will be updated in add/remove liquidity handlers
 * @param event
 * @param pool
 * @returns
 */
function checkPendingTransferToZero(event: ethereum.Event, pool: PoolEntity): void {
  // This no ongoing LP token transfer to zero address
  if (pool.lastTransferToZero == null) {
    return;
  }

  // This LP token transfer to zero address is part of add/remove liquidity event, don't handle it here
  if (pool.lastTransferToZero == event.transaction.hash.toHexString()) {
    return;
  }

  // It's a manual transfer to zero address, not part of add/remove liquidity events
  // Update sender's position accordingly
  let transferTozero = LPTokenTransferToZeroEntity.load(
    pool.lastTransferToZero
  ) as LPTokenTransferToZeroEntity;
  transferLPToken(
    event,
    pool,
    transferTozero.from as Address,
    transferTozero.to as Address,
    transferTozero.value
  );

  pool.lastTransferToZero = null;
  pool.save();
}
