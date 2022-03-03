# Daily market data

SimpleFi's main subgraphs are focused on tracking historical and current user positions. But we also want to track market-level (amm pair, lending pair, farm) volume data in order to have even more complete analytics. For that purpose we deploy complementray 'protocol-data' subgraph for every main subgraph.

These subgraphs are quite simpler. Focus is on collecting aggregate volume data on daily level. This is the main entity:

```
type MarketDayData @entity {
  " marketAddress + dayId "
  id: ID!

  " first trade of the day timestamp "
  timestamp: BigInt!

  " market id - pair address "
  market: String!

  " swap volume -> amount of input tokens swapped in or out  "
  inputTokensDailySwapVolume: [BigInt!]!

  " total amount of reserves per input token "
  inputTokenTotalBalances: [BigInt!]!

  " reserve amount per input token this day "
  inputTokenDailyInflow: [BigInt!]!

  " reserve amount per input token this day "
  inputTokenDailyOutflow: [BigInt!]!

  " total balance of LP tokens "
  outputTokenTotalBalance: BigInt!

  " amount of LP tokens minted this day "
  outputTokenDailyInflowVolume: BigInt!

  " amount of LP tokens burned this day "
  outputTokenDailyOutflowVolume: BigInt!

  " number of TXs this day swap "
  dailySwapTXs: BigInt!

  " number of TXs this day mint "
  dailyMintTXs: BigInt!

  " number of TXs this day burn "
  dailyBurnTXs: BigInt!

  " dayId - timestamp/86400 "
  dayId: BigInt!
}
```
