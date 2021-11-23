### Protocol

Aave has multiple lending pools. Every pool has number of tokens. Depositing a token gives you back aToken. User's balance of aTokens is constantly growing and in that way providing interest to user. Borowing against the collateral gives you stable/variable debt token, which is also constantly growing in balance. There is separate "incentive controller" contract which distributes rewards.

### Subgraph

How is Aave mapped to SimpleFi's common model? We create 4 markets types:

- "deposit market" representing every token-aToken pair

  - id: lendingPoolAddress-tokenAddress
  - type LENDING
  - input tokens: token (i.e. USDC)
  - output token: aTokens (i.e. aUSDC)
  - reward token: none

- "variable rate debt market" representing the variable rate debt taken by user for every token

  - id: lendingPoolAddress-variableDebtTokenAddress
  - type LENDING
  - input tokens: WETH (input token in this market represents collateral locked due to debt taken. User can have multiple tokens locked as collateral and what is important is collective collateral price in ETH. For that reason input token is represented as WETH)
  - output token: stable debt token (i.e. stable debt USDC)
  - reward token: none

- "stable rate debt market" representing the debt taken by user for every token

  - id: lendingPoolAddress-stableDebtTokenAddress
  - type LENDING
  - input tokens: WETH (input token in this market represents collateral locked due to debt taken. User can have multiple tokens locked as collateral and what is important is collective collateral price in ETH. For that reason input token is represented as WETH)
  - output token: stable debt token (i.e. stable debt USDC)
  - reward token: none

- "reward market" representing incentive controller which distributes the rewards based on all deposits provided by users into the specific lending pool
  - id: lendingPoolAddress-incentiveControllerAddress
  - type: STAKING
  - input tokens: WETH (input token in this market represents all the collateral deposited by user to specific lending pool, priced in ETH. For that reason input token is represented as WETH)
  - output token: WETH (same as above, balance of input and output tokens will always be same)
  - reward token: token defined in incentive controller contract (i.e. StkAave)

Open questions:

- How will be 1st (investment) market be distinguished from 2nd and 3rd (debt) market in backend? Shall type of 1st market be something different than LENDING?
- Is it a problem if WETH is used as input token of debt markets instead of array of all the collateral tokens? There are couple of reasons for doing it this way - new collateral tokens are being added/removed constantly so that would require a lot of updates to the model dynamically; and it is not possible to say what amount of specific collateral token is locked, we can only say what ETH-denominated amount of collective collateral is locked.
- Let's say 2 years ago user deposited 1 WBTC and 1 LINK, and borrowed 100 DAI. His positions reflect his initial holdings: 1 aWBTC, 1 aLINK, 100 variableDebt DAI, 0.1 WETH amount of collateral locked ETH-denominated, 0 claimable reward tokens. Today, his actual balance of aETH, aLink, debt DAI, collateral amount locked and claimable rewards have all changed (by a lot possibly). But we don't have that info because in subgraph we only have positions from 2 years ago - that was the last time user interacted with Aave. This is part of generic version of "balance appreciation due to time passed" issue we have with farm rewards in other protocols.
