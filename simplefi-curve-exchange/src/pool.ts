import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  AddLiquidity,
  RemoveLiquidity,
  RemoveLiquidityOne,
  Remove_liquidity_one_coinCall,
  RemoveLiquidityImbalance,
  TokenExchange,
} from "../generated/templates/PoolLPToken/StableSwapLending3";
import { Transfer } from "../generated/templates/PoolLPToken/ERC20";
import {
  LPTokenTransferToZero as LPTokenTransferToZeroEntity,
  Market as MarketEntity,
  Pool as PoolEntity,
  RemoveLiqudityOneEvent as RemoveLiqudityOneEventEntity,
} from "../generated/schema";
import { PoolLPToken } from "../generated/templates";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
} from "./common";
import {
  getOrCreateLendingPool,
  getOtCreateAccountLiquidity,
  getPoolBalances,
  updatePool,
  getPoolFromLpToken,
  getOrCreateRemoveLiquidityOneEvent,
} from "./curveUtil";

export function handleAddLiquidity(event: AddLiquidity): void {
  // create pool
  let pool = getOrCreateLendingPool(event, event.address);

  // create LPToken entity from template when pool is createed
  if (pool.totalSupply == BigInt.fromI32(0)) {
    PoolLPToken.create(pool.lpToken as Address);
  }

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // Update pool entity balances and totalSupply of LP tokens
  let oldTotalSupply = pool.totalSupply;
  let newPoolBalances = getPoolBalances(pool);
  pool = updatePool(event, pool, newPoolBalances, event.params.token_supply);

  // Update AccountLiquidity to track LPToken balance of account
  let account = getOrCreateAccount(event.params.provider);
  let lpTokenAmount = event.params.token_supply.minus(oldTotalSupply);

  let accountLiquidity = getOtCreateAccountLiquidity(account, pool);
  accountLiquidity.balance = accountLiquidity.balance.plus(lpTokenAmount);
  accountLiquidity.save();

  // Collect data for position update
  let market = MarketEntity.load(pool.id) as MarketEntity;
  let accountLpTokenBalance = accountLiquidity.balance;
  let providedTokenAmounts = event.params.token_amounts;
  let inputTokenAmounts: TokenBalance[] = [];
  let inputTokenBalances: TokenBalance[] = [];
  let coins = pool.coins;
  for (let i = 0; i < pool.coinCount; i++) {
    inputTokenAmounts.push(new TokenBalance(coins[i], account.id, providedTokenAmounts[i]));

    // number of pool input tokens that can be redeemed by account's LP tokens
    let inputBalance = newPoolBalances[i].times(accountLpTokenBalance).div(pool.totalSupply);
    inputTokenBalances.push(new TokenBalance(coins[i], account.id, inputBalance));
  }

  // use common function to update position and store transaction
  investInMarket(
    event,
    account,
    market,
    lpTokenAmount,
    inputTokenAmounts,
    [],
    accountLpTokenBalance,
    inputTokenBalances,
    [],
    null
  );
}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  // create pool
  let pool = getOrCreateLendingPool(event, event.address);

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

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
  // create pool
  let pool = getOrCreateLendingPool(event, event.address);

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

export function handleTokenExchange(event: TokenExchange): void {
  // create pool
  let pool = getOrCreateLendingPool(event, event.address);

  // handle any pending LP token tranfers to zero address
  checkPendingTransferToZero(event, pool);

  // update pool entity with new token balances
  let newPoolBalances = getPoolBalances(pool);
  updatePool(event, pool, newPoolBalances, pool.totalSupply);
}

export function handleTransfer(event: Transfer): void {
  // don't handle zero-value tranfers or transfers from zero-address
  if (event.params.value == BigInt.fromI32(0) || event.params.from.toHexString() == ADDRESS_ZERO) {
    return;
  }

  let pool = getOrCreateLendingPool(event, getPoolFromLpToken(event.address));

  // if receiver is zero-address create tranferToZero entity and return - position updates are done in add/remove liquidity handlers
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

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
  // create pool
  let pool = getOrCreateLendingPool(event, event.address);

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

export function handleRemoveLiquidityOneCall(call: Remove_liquidity_one_coinCall): void {
  // load pool
  let pool = PoolEntity.load(call.to.toHexString()) as PoolEntity;

  // update RemoveLiquidityOne entity
  let id = call.transaction.hash
    .toHexString()
    .concat("-")
    .concat(pool.id);
  let entity = getOrCreateRemoveLiquidityOneEvent(id, pool);
  entity.i = call.inputs.i.toI32();
  entity.callApplied = true;
  entity.save();

  let event = new ethereum.Event();
  event.block = call.block;
  event.transaction = call.transaction;
  event.logIndex = entity.logIndex as BigInt;
  handleRLOEEntityUpdate(event, entity, pool);
}

/**
 * Common function for entity update after liquidity removal
 * @param event
 * @param pool
 * @param provider
 * @param tokenAmounts
 * @param lpTokenSupply
 */
function handleRemoveLiquidityCommon(
  event: ethereum.Event,
  pool: PoolEntity,
  provider: Address,
  tokenAmounts: BigInt[],
  lpTokenSupply: BigInt
): void {
  // Update balances and totalSupply
  let oldTotalSupply = pool.totalSupply;
  let newBalances = getPoolBalances(pool);
  pool = updatePool(event, pool, newBalances, lpTokenSupply);
  pool.lastTransferToZero = null;
  pool.save();

  // Update AccountLiquidity to track LPToken balance of account
  let account = getOrCreateAccount(provider);
  let lpTokenAmount = oldTotalSupply.minus(lpTokenSupply);

  let accountLiquidity = getOtCreateAccountLiquidity(account, pool);
  accountLiquidity.balance = accountLiquidity.balance.minus(lpTokenAmount);
  accountLiquidity.save();

  // Collect data for position update
  let market = MarketEntity.load(pool.id) as MarketEntity;
  let accountLpTokenBalance = accountLiquidity.balance;
  let inputTokenAmounts: TokenBalance[] = [];
  let inputTokenBalances: TokenBalance[] = [];
  let coins = pool.coins;
  for (let i = 0; i < pool.coinCount; i++) {
    let token = coins[i];
    let inputAmount = tokenAmounts[i];
    let inputBalance: BigInt;
    //in case there is no liquidity
    if (pool.totalSupply == BigInt.fromI32(0)) {
      inputBalance = BigInt.fromI32(0);
    } else {
      inputBalance = newBalances[i].times(accountLiquidity.balance).div(pool.totalSupply);
    }
    inputTokenAmounts.push(new TokenBalance(token, account.id, inputAmount));
    inputTokenBalances.push(new TokenBalance(token, account.id, inputBalance));
  }

  // use common function to update position and store transaction
  redeemFromMarket(
    event,
    account,
    market,
    lpTokenAmount,
    inputTokenAmounts,
    [],
    accountLpTokenBalance,
    inputTokenBalances,
    [],
    null
  );
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

  let fromAccountLiquidity = getOtCreateAccountLiquidity(fromAccount, pool);
  fromAccountLiquidity.balance = fromAccountLiquidity.balance.minus(fromLpTokensTransferred);
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

  let toAccountLiquidity = getOtCreateAccountLiquidity(toAccount, pool);
  toAccountLiquidity.balance = toAccountLiquidity.balance.plus(toLpTokensReceived);
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
