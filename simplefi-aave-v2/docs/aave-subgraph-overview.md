### Protocol

Aave has multiple lending pools. Every pool has number of tokens. Depositing a token gives you back aToken. User's balance of aTokens is constantly growing and in that way providing interest to user. Borowing against the collateral gives you stable/variable debt token, which is also constantly growing in balance. There is separate "incentive controller" contract which distributes rewards.

### Subgraph

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
- Is it a problem if WETH is used as input token of debt markets instead of array of all the collateral tokens?
- For debt markets (2nd and 3rd)
  - How can we track changes in inputTokenBalance (amount of collateral locked) in blocks where position is not updated by TX?
  - Same question for outputTokenBalance (amount of debt tokens) -> where can we put market level changes? We can't use market's inputTokenBalance (as in case with aTokens) because inputTokens here represent collateral locked
