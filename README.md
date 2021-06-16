# Subgraph Entities Description

Purpose of all the subgraphs is to index user investment and debt positions in all the protocols in DeFi. We want to create a standard data structure for indexing all investment and debts in all protocols so that anyone can build application on this data without dealing with complexity of individual protocols.

We have created a graphql schema to represent this data structure so that it can be used in subgraph implementations. Below we describe all the entities and their attributes in this schema.

## Terminology

### Market

`Market` is used to describe any smart contract that allows users to invest in it or borrow from it. For example `Uniswap V2` is a protocol and all the pair contracts of `Uniswap V2` are `Markets` of this protocol. Every pair contract is an individual market. For example a DAI-ETH pair is a market where users can provite liquidity by depositing DAI and ETH thus investing in this market.

### Position

`Position` is used to describe any investment of debt in a market by a user. For example a user can deposit DAI in a Compound DAI market thus creating a `Position` of type `INVESTMENT` in DAI market of Compound protocol. Similarily a user can borrow USDT from an Aave market thus creating a `Position` of type `DEBT` in this market of Aave protocol.

## Enums

We have defined some enums to store common values -

### Enum Blockchain

This is used with every entity so that when we have subgraphs for same protocols on different blockchains.

### Enum TokenStandard

This is used to define Token standard of a Token entity. This is useful when we want to select ABI to interact with the token contract.

### Enum ProtocolName

This is used in Market entity to store UI friendly name of a protocol.

### Enum ProtocolType

This is used in Market entity. It can be useful when some logic needs to be implemented based on type of protocol while processing this data.

### Enum PositionType

This is used in Position entity. Possible values are -

- INVESTMENT : When a user invests funds in a market
- DEBT : When a user borrows funds from a market

Please note that withdrawal from a market can be one of the following -
 
 - Redemption of full/part of the investment that was made by the user earlier in the market
 - Borrow funds from the market

In case it's redemption we update the existing Position with type `INVESTMENT`. If it's borrowing funds then we create a new `DEBT` position if user is borrowing for the first time from the market or update existing Positions with type `DEBT`

### Enum TransactionType

This is used in Transaction entity. When evenr we update a position we store current values of position in PositionSnapshot entity. In this PositionSnapshot entity we store a Transaction entity which stores information of the interaction by user that changes the position. Possible values for TransactionType are -

- INVEST : When a user invests funds in a market
- REDEEM : when a user redeems his earlier investments from a market
- BORROW : When a user borrows funds from a market
- REPAY : When a user repays part of the due amount to the market
- TRANSFER_IN : When a someone transfers a positional token (for example LP token) to current user
- TRANSFER_OUT : When a current user transfers a positional token (for example LP token) to someone

## Entities

### Account

This entity is used to store all ethereum addresses as accounts. We can't differentiate between a smart contract address and an externally owned address in subgraph mapping code therefore we are ignoring it.

### Token

This entity is used to store all ERC20, ERC721, ERC1155 tokens with their useful propeties like -

- id : Contract address of the token
- tokenStandard : One of values from `TokenStandard` enum
- name : Name of the token if available in contract
- symbol : Symbol of the token that is used in UI of exchanges and other application using this token
- decimals : Number of decimals of the token
- mintedByMarket : It is null by default. If the token is minted by a market to track share of the owner in the reserves of the market then we store the market id here
- blockNumber : Block number at which we created this entity in index. Please note that this is not always equal the block number in which the token contract deployed
- timestamp: Timestamp of the block with above block number

### Market

As described above this entity is used to store smart contracts that allow users to invest or borrow from it. It has following properties -

- id : Contract address of the market
- account : Id of the `Account` enity for this smart contract. This can be used to fetch positions of this market in other markets
- protocolName : One of the values of `ProtocolName` enum
- protocolType : One of the values of `ProtocolType` enum
- inputTokens : List of tokens that can be deposited in this market as investment. Please note that any one of the deposited tokens can be borrowed from the market therefore we are not storing it in a different property
- outputToken : Token that is minted by the market to track position of a user in the market
- rewardTokens : Some markets also provide some tokens as rewards to investors as an additional benefit. This property is used to store list of all such tokens
- blockNumber : Block number of the block in which this market smart contract was deployed
- timestamp : Timestamo of the above block number

### Position

This is the main entity which stores a position of a user in a market. Every time there is an action by a user which changes this user's investment or debt balance in the market we update this position and we create a PositionSnapshot entity to store previous values. Purpose of PositionSnapshot is to keep history of changes in position of a user. It has following properties -

- id : Combination of accountPositionId and autoIncrement number. This autoIncrement number is value of `positionCounter` property of `AccountPosition` entity when creating this position entity
- accountPosition : Id of the `AccountPosition` entity
- account : Id of the `Account` entity which is created for the user address who created this position
- accountAddress : It is address of the user who created this position. This can be used to filter positions based on addresses
- market : Id of the `Market` entity in which is position is created
- marketAddress : Smart contract address of the market. This can be used to filter positions based on market addresses
- positionType : One of the values of `PositionType` enum
- outputTokenBalance : Latest balance of user of the `outputToken` of the market
- inputTokenBalances : Balances of the input tokens that can be redeemed by depositing `outputTokenBalance` to the market. Because of limitations of the contracts call in mapping code of subgraph values of input token balance are based on market smart contract state at the block (after all the transaction in the block have been executed to update the smart contract address). This can cause an inaccurate value of inputTokenBalances for specific transaction which are followed other transaction in same block. We are working on making this more accurate
- rewardTokenBalances : Balances of reward tokens that are credited by the market as an additional benefit. These values are also subject same limitation as `inputTokenBalances`
- transferredTo : List of addresses to which the user has part/full balance of outputToken. This can be used to connect movement of funds from market to another while processing this data
- closed : Status of the position. More on it in below
- blockNumber : Number of the block at which this position was created
- timestamp : Timestamp of above block
- historyCounter : An increamenting counter that is used as suffix to generate `PositionSnapshot` id

**Closed Positions**

A position is considered `closed` when -

- A user has redeemed all the funds from the market and his outputTokenBalance has become 0 for a postion of type `INVESTMENT`
- A user has paid all the dues to the market and due amount becomes 0 for a position of type `DEBT`

In case a user again deposits funds to the market then we create a new `Position` instead of updating existing `closed` position. This way we keep track of of historical positions as well. 

### AccountPosition

This entity is used to keep track of all historical position of a user in a market. We can not use same ID for a user's new position after existing one has been closed. To be able to fetch current open position for a user + market + position type we need the ID to be dependent on only these three things. These three things will be same for all positions of a specific user in specfic market therefore we need this AccountPosition entity. In this entity we keep a counter which keeps increasing as new positions are created by same user on same market of same type. It has following properties -

- id : Combination of user address, market address and position type
- positionCounter : Increamenting counter used as suffix to create id for `Position` entity

### Transaction

This entity is used to track parameters of interaction that changes a position. We also include `gasUsed` and `gasPrice` in this entity, it can be used to calculate cost of transaction when processing this data. It has following properties -

- id : Combination of account address, transaction hash and log index
- transactionHash : Hash of transaction. Can be used to debug subgraphs or get other information from the blockchain if required
- market : Id of the market on which this transaction was done
- from : Account entity for address which sent this transaction. A transaction.from is always transaction origin (EOA) because outside EVM transaction.origin and msg.sender are same
- to : Account entity for address to which this transaction was sent
- transactionType : One of the values of `TransactionType` enum
- inputTokenAmounts : Amounts of input tokens that are being deposited or withdarwan in this transaction
- outputTokenAmount : Amount of output token that is being deposited or withdarwan in this transaction
- rewardTokenAmounts : Amounts of reward tokens that are being withdrawan in this transaction
- transferredFrom : It is null by default. In case someone transfers his output token to the current user then we populate address of that someone in this property
- transferredTo : It is null by default. In case the current user transfers his output token to someone then we populate address of that someone in this property
- gasUsed : Amount of gas used in executing this blockchain transaction
- gasPrice : Price of per unit of a gas in `gwei` while executing this transaction
- blockNumber : Number of the block in which this transaction was executed
- timestamp : Timestamp of above block
- transactionIndexInBlock : Index of transaction the block. It can be used to debug subgraphs

### PositionSnapshot

As described above this entity is used to store values of `Position` entity **before** every update to it. It has following properties -

- id : Combination of position id and historyCounter value in position entity
- position : Id of the position for which this snapshot is created
- transaction : Id of the transaction by which above position is updated
- outputTokenBalance : Value of `outputTokenBalance` of `Position` entity when creating this snapshot
- inputTokenBalances : Same as above
- rewardTokenBalances : Same as above
- transferredTo : same as above

## How to create subgraph for a protocol?

Please create a fork of this repository. Then follow steps below -

- Create a new branch with the name of the protocol
- Create a folder/directory with the name of the protocol
- Initialise the subgraph using subgraph cli
- Copy contents of `schema-cmmon.graphql` in `schema.graphql` in protocl directory
- Add more entity definitions as requried to implement the subgraph
- Implement mapping code

Have a look at uniswap-v2 subgraph for example. You can also copy `common.ts` and `constants.ts` from uniswap-v2 subgraph implementation. We have created these files as an independent library that can be used by any subgraph implementation that want to populate entities deinfed in `schema-common.graphql`. Using `common.ts` will reduce scope of errors while implementing subgraph for your protocol.
