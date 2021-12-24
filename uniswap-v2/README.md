# Uniswap V2 Positions

## Usecase

This subgraph is used track invstments of liquidity providers in Uniswap V2 pools. In this subgraph we track all the positions ever taken by an account. How this position changes over time. What are the returns on this position over time in ETH currency

## Mappings

A position's lifecycle starts with `Mint` or `Transfer` event on a pool contrat with a new address as `to` argument.

Once a new position has been added this position is updated on `Mint`, `Burn`, `Transfer` events based on amount argument of these events.

If we find that `Burn` or `Transfer` has same amount as current saved `outputTokenBalance` then we close this position and once it is closed we create a new one on new `Mint` or `Transfer` event.

In uniswap returns of an account's positions also change when other accounts do activity on the pool. Pool contract emits `Sync` event everything there is a change in reserves of assets in a pool. We can not have indexer update all positions on every `Sync` event therefore we store changes in pool variables on every `Sync` event. Our backend can then fetch list of all poolVariables between specific blockNumbers to calcualte changes in postions over time.

**Note:** We are not handling `Swap` event. Every `swap` action emits `Sync` event before `Swap` event so changes in reserves on `swap` call has been taken care of by handling `Sync` event.

Ordering of events in calls -

* Mint call - 
    * Transfer with from = zero, to = feeTo - changes total supply
    * Transfer with from = zero, to != feeTo - start MintTransaction - changes total supply
    * Sync - updates reserves
    * Mint with sender, amount0, amount1 transferred to pool - Complete MintTransaction

* Burn call -
    * Transfer with from = any, to = pair - start BurnTransaction
    * Transfer with from = zero, to = feeTo - ignore
    * Transfer with from = pair, to = zero - changes total supply
    * Sync - updates reserves
    * Burn with sender, amount0, amount1, to - complete BurnTransaction

* Transfer call-
    * Transfer with from = any, to = any - it effects two positions

So when we receive a transfer event we check -
* if it is from zero address then it starts MintTransaction
* if it is to pair address then it starts BurnTransaction
* otherwise it is a transfer between two external accounts

and start a MintTransaction or BurnTransaction accordingly and then -
* Mint event completes a MintTransaction
* Burn event completes a BurnTransaction

Because we can not rely on ordering of event triggers in graph node we need to implement reverse order of events as well in which - 
* Mint event starts a MintTransaction and then Transfer event completes it
* Burn event starts a BurnTransaction and then Transfer event completes it