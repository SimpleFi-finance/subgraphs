## Harvest Finance subgraph

https://harvest.finance

This subgraph tracks user positions in Harvest vaults, reward pools and profit sharing pools. Currently only mainnet version of protocol is indexed.

There are 3 types of Market entities:

- HARVEST_FINANCE (vaults)
  - type TOKEN_MANAGEMENT
  - input token - underlying base token (ie. DAI)
  - output token - fToken (ie. fDAI)
- HARVEST_FINANCE_REWARD_POOL (reward pools, every reward pools matches one vault)
  - type LP_FARMING
  - input token - fToken
  - output token - no actual token, but represented with reward pool address
  - reward token - mostly FARM token
- HARVEST_FINANCE_STAKING_POOL (profit sharing pools)
  - type STAKING
  - input token - FARM
  - output token - no actual token, but represented with profit sharing pool address
  - reward token - FARM token
