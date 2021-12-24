### Protocol

Aave has multiple lending pools. Every pool has number of tokens. Depositing a token gives you back aToken. User's balance of aTokens is constantly growing and in that way providing interest to user. Borowing against the collateral gives you stable/variable debt token, which is also constantly growing in balance. There is separate "incentive controller" contract which distributes rewards.

## Subgraph

How is Aave mapped to SimpleFi's common model? We create 4 markets types:

- "deposit market" representing every token-aToken pair

  - id: lendingPoolAddress-tokenAddress
  - type LENDING
  - input tokens: token (i.e. USDC)
    - balance of input tokens = amount of output tokens times `liquidityIndex`
  - output token: aTokens (i.e. aUSDC)
    - balance: "scaled" amount of aTokens -> amount of input tokens divided by `liquidityIndex`
  - reward token: none

- "variable rate debt market" representing the variable rate debt taken by user for every token

  - id: lendingPoolAddress-variableDebtTokenAddress
  - type DEBT
  - input tokens: WETH (input token in this market represents collateral locked due to debt taken. User can have multiple tokens locked as collateral and what is important is collective collateral price in ETH. For that reason input token is represented as WETH)
  - output token: stable debt token (i.e. stable debt USDC)
  - reward token: none

- "stable rate debt market" representing the debt taken by user for every token

  - id: lendingPoolAddress-stableDebtTokenAddress
  - type DEBT
  - input tokens: WETH (input token in this market represents collateral locked due to debt taken. User can have multiple tokens locked as collateral and what is important is collective collateral price in ETH. For that reason input token is represented as WETH)
  - output token: stable debt token (i.e. stable debt USDC)
  - reward token: none

- "reward market" representing incentive controller which distributes the rewards based on all deposits provided by users into the specific lending pool
  - id: lendingPoolAddress-incentiveControllerAddress
  - type: STAKING
  - input tokens: WETH (input token in this market represents all the collateral deposited by user to specific lending pool, priced in ETH. For that reason input token is represented as WETH)
  - output token: WETH (same as above, balance of input and output tokens will always be same)
  - reward token: token defined in incentive controller contract (i.e. StkAave)

## Limitations of our current data model

1. Our subgraphs can only update user's data in TXs where user interacts with contract. How can we derive user's position at all the other times?

- in protocols like AMM pools we can do it because user has fixed number of LP shares, so if we know total number of shares in market at every TX, we can easily calculate balance of redeemable input tokens for user
- that approach often doesn't work for data like reward balances because it's not possible to derive user's amount of claimable rewards from the state of market reserves
  - current solution -> make custom contract calls from backend to get reward balances for user - it requires ABI, function signature, parameters. Not generic or scalable solution atm

2. Idea for debt (borrow) markets in our model is following:

- input token = collateral locked
- output token = debt token for asset being borrowed

Taking Aave as example, collateral is not actually being locked. We can just calculate (at the time of user's interaction with contract) minimal amount of collateral needed, priced in ETH, to take a debt of certain amount without being liquidatable.

Amount of collateral needed is specific to very user and depends on:

- assets being part of collateral
- amount of every asset
- price of every asset in ETH

2a) How to track input token balance - amount of collateral locked?

It is changed at every block for every user, because prices are constantly changing. There's no way to update every position in subgraph at every block.

But can we use market reserves to derive it, like in exchange (amm) or lend (deposit) market? Not really, there's no direct way to measure amount of collateral locked accross all positions...

- one possible solution is to use contract calls as in the rewards case?

2b) How to track actual amount of tokens user owes to protocol, based on output token balance?

Since we can't use market reserves of input token to derive it (because input token is collateral), we need to extend the model.

- current solution -> market/marketSnapshot entities are extended with optional `balanceMultiplier` param. So if we know that user has 100 debt tokens, actual amount owed by user is 100 x `balanceMultiplier`. This logic needs to be reflected in backend integration. From subgraph side we need to make sure that market's `balanceMultiplier` is up-to-date every time it changes in contract storage.

3. Add weights of input tokens to Market entity
4. How to calculate volume
