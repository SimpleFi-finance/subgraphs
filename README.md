# Overview

One of the biggest pain points for DeFi investors is to keep track of their profit and losses. SimpleFi offers a dashboard that does just that in an automated way: simply connect your wallet or provide an address and SimpleFi will find what you've invested in and how much money you've made or lost. If you have "multi-pool" strategies, such as providing liquidity on Uniswap and staking the LP token in a yield farm, then SimpleFi will aggregate the ROI from both.

# SimpleFi's data indexing

SimpleFi is supported by The Graph foundation to create an open source DeFi data access point. We use subgraphs (The Graph's method to index data) to make ROI calculations faster, and to allow any developer to integrate their own DeFi protocol into SimpleFi. All you need is knowledge of graphQL and smart contracts.

The use of the subgraph is particularly aimed at indexing the user invesment/debt positions in any DeFi protocol, from which their ROI can be easily derived.

# Why The Graph and why tailored subgraphs?

The Graph is a powerful indexing tool that allows us to pre-process data that make it blazing fast to calculate a user's DeFi ROI. The reason we developed a generalised graphing schema, and dedicated subgraphs for each protocol, rather than, say, recycling existing (and often excellent) subgraphs is because:
1. it makes it extremely easy for developers to integrate their own protocols into SimpleFi. They can simply follow the template, and avoid having to wait on the SimpleFi team to do it for them \#noBottlenecks
3. it ensures a consistent data structure across all protocols, and allows developers to build applications without the headache of having to implement slightly different calls and tailored data transformations for each protocol

# Subgraph Entities Description

We have created a graphql schema to represent this data structure so that it can be used in subgraph implementations. Below we describe all the entities and their attributes in this schema.

## Terminology

### Market

`Market` is used to describe any smart contract that allows users to invest in it or borrow from it. For example `Uniswap V2` is a protocol and all the pair contracts (liquididty pools) of `Uniswap V2` are `Markets` of this protocol. Every pair contract is an individual market. For example a DAI-ETH pair is a market where users can provide liquidity by depositing DAI and ETH thus investing in this market.

### Position

`Position` is used to describe any investment made, or debt taken, by a user in a market. For example a user can deposit DAI in a Compound DAI market thus creating a `Position` of type `INVESTMENT` in the DAI market of the Compound protocol. Similarily a user can borrow USDT from an Aave market thus creating a `Position` of type `DEBT` in this market of the Aave protocol.

## Enums

We have defined some enums to store common values:

### Enum Blockchain

This is used with every entity so that we can distinguish subgraphs for same protocols on different blockchains (e.g. Curve on Ethereum mainnet and Polygon).

### Enum TokenStandard

This is used to define the Token standard of a Token entity. This is useful when we want to select the correct ABI to interact with the token contract.

### Enum ProtocolName

This is used in the Market entity to store a UI-friendly name of the protocol.

### Enum ProtocolType

This is used in the Market entity. It can be useful when some logic needs to be implemented based on the type of protocol while processing this data.

### Enum PositionType

This is used in the Position entity. Possible values are:

- INVESTMENT : When a user invests funds in a market
- DEBT : When a user borrows funds from a market

Please note that withdrawal from a market can be one of the following:
 
 - Redemption of full/part of the investment that was made by the user earlier in the market
 - Borrow funds from the market

In case it's a redemption we update the existing Position with type `INVESTMENT`. If it's borrowing funds then we create a new `DEBT` position if the user is borrowing for the first time from the market or update existing Positions with type `DEBT`

### Enum TransactionType

This is used in the Transaction entity. Whenever we update a position we store current values of the position in the PositionSnapshot entity. In this PositionSnapshot entity we store a Transaction entity which stores information of the interaction by user that changes the position. Possible values for TransactionType are:

- INVEST : When a user invests funds in a market
- REDEEM : when a user redeems his earlier investments from a market
- BORROW : When a user borrows funds from a market
- REPAY : When a user repays part of the due amount to the market
- TRANSFER_IN : When a someone transfers a positional token (for example LP token) to current user
- TRANSFER_OUT : When a current user transfers a positional token (for example LP token) to someone

## Entities

### Account

This entity is used to store all addresses as accounts. We can't differentiate between a smart contract address and an externally owned address in a subgraph's mapping code therefore we are ignoring it.

### Token

This entity is used to store all ERC20, ERC721, ERC1155 tokens with their useful propeties like:

- id : Contract address of the token
- tokenStandard : One of values from `TokenStandard` enum
- name : Name of the token if available in contract
- symbol : Symbol of the token that is used in UI of exchanges and other application using this token
- decimals : Number of decimals of the token
- mintedByMarket : It is null by default. If the token is minted by a market to track share of the owner in the reserves of the market then we store the market id here
- blockNumber : Block number at which we created this entity in the index. Please note that this is not always equal to the block number in which the token contract was deployed
- timestamp: Timestamp of the block with above block number

### Market

As described above this entity is used to store smart contracts that allow users to invest in or borrow from it. It has the following properties:

- id : Contract address of the market
- account : Id of the `Account` entity for this smart contract. This can be used to fetch positions of this market in other markets (for example, the position that a yield farm holds in a Uniswap liquidity pool)
- protocolName : One of the values of `ProtocolName` enum
- protocolType : One of the values of `ProtocolType` enum
- inputTokens : List of tokens that can be deposited in this market as investment. Please note that any one of the deposited tokens can be borrowed from the market therefore we are not storing it in a different property
- outputToken : Token that is minted by the market to track the position of a user in the market (e.g. an LP token)
- rewardTokens : Some markets, such as yield farming contracts, provide some tokens as rewards to investors as an additional benefit. This property is used to store the list of all such tokens
- inputTokenBalances : Total balance of this market contract of all input tokens
- outputTokenTotalSupply : Total supply of output token
- blockNumber : Block number of the block in which this market smart contract was deployed
- timestamp : Timestamp of the above block number

### MarketSnapshot

This entity is used to store values of `Market` entity **before** every update to it. It has following properties:

- id : Combination of transaction hash and log index
- market : Id of the market for which this snapshot is created
- inputTokenBalances : Value of `inputTokenBalances` of `Market` entity
- outputTokenTotalSupply : same as above
- blockNumber : Number of the block in which this transaction was executed
- timestamp : Timestamp of above block
- transactionIndexInBlock : Index of the transaction in the block. It can be used to debug subgraphs
- logIndex : Log index of the event being processed


### Position

This is the main entity which stores a position of a user in a market. Every time there is an action by a user which changes this user's investment or debt balance in the market we update this position and we create a PositionSnapshot entity to store previous values. Purpose of PositionSnapshot is to keep a history of changes in position of a user. It has following properties:

- id : Combination of accountPositionId and autoIncrement number. This autoIncrement number is a value of `positionCounter` property of `AccountPosition` entity when creating this position entity
- accountPosition : Id of the `AccountPosition` entity
- account : Id of the `Account` entity which is created for the user address who created this position
- accountAddress : It is the address of the user who created this position. This can be used to filter positions based on addresses
- market : Id of the `Market` entity in which the user's position is created
- marketAddress : Smart contract address of the market. This can be used to filter positions based on market addresses
- positionType : One of the values of `PositionType` enum
- outputTokenBalance : Latest balance of the user of the market's `outputToken`
- inputTokenBalances : Balances of the input tokens that can be redeemed by sending the `outputTokenBalance` back to the market. Because of limitations in how subgraph mapping code makes contract calls, the values of `inputTokenBalances` are based on the market's state recorded by the relevant smart contract at the block level (after all the transaction in the block have been executed to update the smart contract address). This can cause an inaccurate value of inputTokenBalances for specific transactions which are followed by other transactions that affect the market's balances in the same block. We are working with The Graph to address this limitation and increase accuracy
- rewardTokenBalances : Balances of tokens that are provided by the market as rewards to users (e.g. yield farming markets). These values are also subject to the same limitation as `inputTokenBalances`
- transferredTo : List of addresses to which the user has part/full balance of outputToken. This can be used to connect movement of funds from one market to another while processing this data
- closed : Status of the position. More on this below
- blockNumber : Number of the block at which this position was created
- timestamp : Timestamp of above block
- historyCounter : An increamenting counter that is used as suffix to generate `PositionSnapshot` id

**Closed Positions**

A position is considered `closed` when:

- A user has redeemed all the funds from the market and his outputTokenBalance has become 0 for a postion of type `INVESTMENT`
- A user has repaid all the dues to the market and due amount becomes 0 for a position of type `DEBT`

In case a user again deposits funds to the market then we create a new `Position` instead of updating existing `closed` position. This way we keep track of historical positions as well. 

### AccountPosition

This entity is used to keep track of all historical positions of a user in a market. We cannot use the same ID for a user's new position after the existing one has been closed. To be able to fetch the current open position for a user + market + position type we need the ID to be dependent on only these three things. These three things will be the same for all positions of a specific user in a specfic market therefore we need this AccountPosition entity.

In this entity we keep a counter which keeps increasing as new positions are created by the same user on the same market of the same type. It has the following properties:

- id : Combination of user address, market address and position type
- positionCounter : Incrementing counter used as a suffix to create id for `Position` entity

### Transaction

This entity is used to track parameters of interaction that changes a user's position. We also include `gasUsed` and `gasPrice` in this entity, it can be used to calculate the cost of transaction when processing this data. It has the following properties:

- id : Combination of account address, transaction hash and log index
- transactionHash : Hash of transaction. Can be used to debug subgraphs or get other information from the blockchain if required
- market : Id of the market on which this transaction was done
- from : Account entity for address which sent this transaction. A transaction.from is always transaction origin (EOA) because outside EVM transaction.origin and msg.sender are same
- to : Account entity for the address to which this transaction was sent
- transactionType : One of the values of `TransactionType` enum
- inputTokenAmounts : Amounts of input tokens that are being deposited or withdrawn in this transaction
- outputTokenAmount : Amount of output token that is being deposited or withdrawn in this transaction
- rewardTokenAmounts : Amounts of reward tokens that are being withdrawn in this transaction
- transferredFrom : It is null by default. In case someone transfers his output token to the current user then we populate the address of that someone in this property
- transferredTo : It is null by default. In case the current user transfers his output token to someone then we populate the address of that someone in this property
- gasUsed : Amount of gas used in executing this transaction
- gasPrice : Price of per unit of gas in `gwei` while executing this transaction
- blockNumber : Number of the block in which this transaction was executed
- timestamp : Timestamp of above block
- transactionIndexInBlock : Index of transaction in the block. It can be used to debug subgraphs

### PositionSnapshot

As described above this entity is used to store values of the `Position` entity **before** every update to it. It has following properties:

- id : Combination of position id and historyCounter value in position entity
- position : Id of the position for which this snapshot is created
- transaction : Id of the transaction by which the above position is updated
- outputTokenBalance : Value of `outputTokenBalance` of `Position` entity when creating this snapshot
- inputTokenBalances : Same as above
- rewardTokenBalances : Same as above
- transferredTo : Same as above

## How to create a subgraph for a protocol?

Please create a fork of this repository. Then follow the steps below:

- Create a new branch with the name of the protocol
- Create a folder/directory with the name of the protocol
- Initialise the subgraph using theGraph's subgraph cli
- Copy contents of `schema-common.graphql` in `schema.graphql` in the protocol directory
- Add more entity definitions as requried to implement the subgraph
- Implement mapping code

Have a look at our uniswap-v2 subgraph as an example. You can also copy `common.ts` and `constants.ts` from the uniswap-v2 subgraph implementation. We have created these files as an independent library that can be used by any subgraph implementation that wants to populate entities deinfed in `schema-common.graphql`. Using `common.ts` will reduce the scope of errors while implementing a subgraph for your protocol.
