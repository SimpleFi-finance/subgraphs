## Classes

<dl>
<dt><a href="#TokenBalance">TokenBalance</a></dt>
<dd></dd>
</dl>

## Functions

<dl>
<dt><a href="#getOrCreateAccount">getOrCreateAccount(address)</a> ⇒ <code>*</code></dt>
<dd><p>Fetch account entity, or create it if it doens&#39;t exist. Account can be either EOA or contract.</p>
</dd>
<dt><a href="#getOrCreateERC20Token">getOrCreateERC20Token(event, address)</a> ⇒ <code>*</code></dt>
<dd><p>Fetch token entity, or create it if not existing, for ERC20 token.
Token name, symbol and decimals are fetched by contract calls.</p>
</dd>
<dt><a href="#getOrCreateMarket">getOrCreateMarket(event, address, protocolName, protocolType, inputTokens, outputToken, rewardTokens)</a> ⇒ <code>*</code></dt>
<dd><p>Fetch market entity, or create it if it doesn&#39;t exist.</p>
</dd>
<dt><a href="#updateMarket">updateMarket(event, market, inputTokenBalances, outputTokenTotalSupply)</a> ⇒ <code>*</code></dt>
<dd><p>Update market with new input token balances and new supply of output token.
Before updating market create market snapshot and store it.</p>
</dd>
<dt><a href="#createMarketSnapshot">createMarketSnapshot(event, market)</a> ⇒ <code>*</code></dt>
<dd><p>Create market snapshot entity which stores balances of input tokens and supply of output token at given block.</p>
</dd>
<dt><a href="#getOrCreateOpenPosition">getOrCreateOpenPosition(event, account, market, positionType)</a> ⇒ <code>*</code></dt>
<dd><p>Fetch user&#39;s open position, or create a new one if user has no open positions.
Position stores user&#39;s balances of input, output and reward tokens for certain market.</p>
</dd>
<dt><a href="#createPositionSnapshot">createPositionSnapshot(position, transaction)</a> ⇒ <code>*</code></dt>
<dd><p>Create snapshot of user&#39;s position at certain block</p>
</dd>
<dt><a href="#investInMarket">investInMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances, transferredFrom)</a> ⇒ <code>*</code></dt>
<dd><p>Store transaction and update user&#39;s position when user has invested in market (or received market
output token). Before transaction is stored and position updated, snapshots of market and
position are created for historical tracking. If new balance of user&#39;s market output tokens is 0,
position is closed.</p>
</dd>
<dt><a href="#redeemFromMarket">redeemFromMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances, transferredTo)</a> ⇒ <code>*</code></dt>
<dd><p>Store transaction and update user&#39;s position when user has withdrawn tokens from market (or sent out
market output token). Before transaction is stored and position updated, snapshots of market and
position are created for historical tracking. If new balance of user&#39;s market output tokens is 0,
position is closed.</p>
</dd>
<dt><a href="#borrowFromMarket">borrowFromMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances)</a> ⇒ <code>*</code></dt>
<dd><p>Store transaction and update user&#39;s position when user has borrowed from market. Before transaction
is stored and position updated, snapshots of market and position are created for historical tracking.</p>
</dd>
<dt><a href="#repayToMarket">repayToMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances)</a> ⇒ <code>*</code></dt>
<dd><p>Store transaction and update user&#39;s position when user has repayed debt to market. Before
transaction is stored and position updated, snapshots of market and position are created
for historical tracking.</p>
</dd>
</dl>

<a name="TokenBalance"></a>

## TokenBalance
**Kind**: global class  
<a name="new_TokenBalance_new"></a>

### new TokenBalance()
User's balance of specific token

<a name="getOrCreateAccount"></a>

## getOrCreateAccount(address) ⇒ <code>\*</code>
Fetch account entity, or create it if it doens't exist. Account can be either EOA or contract.

**Kind**: global function  
**Returns**: <code>\*</code> - {Account} Account entity  

| Param | Type | Description |
| --- | --- | --- |
| address | <code>Address</code> | Address of the account to load/create |

<a name="getOrCreateERC20Token"></a>

## getOrCreateERC20Token(event, address) ⇒ <code>\*</code>
Fetch token entity, or create it if not existing, for ERC20 token.
Token name, symbol and decimals are fetched by contract calls.

**Kind**: global function  
**Returns**: <code>\*</code> - {Token} Token entity  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event with block info for this token |
| address | <code>Address</code> | Address of the ERC20 token |

<a name="getOrCreateMarket"></a>

## getOrCreateMarket(event, address, protocolName, protocolType, inputTokens, outputToken, rewardTokens) ⇒ <code>\*</code>
Fetch market entity, or create it if it doesn't exist.

**Kind**: global function  
**Returns**: <code>\*</code> - {Market} Market entity  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event contains block info |
| address | <code>Address</code> | Address of the market |
| protocolName | <code>string</code> | Name of the protocol based on ProtocolName enum |
| protocolType | <code>string</code> | Type of the protocol based on ProtocolType enum |
| inputTokens | <code>Array.&lt;Token&gt;</code> | List of tokens that can be deposited in this market as investment |
| outputToken | <code>Token</code> | Token that is minted by the market to track the position of a user in the market (e.g. an LP token) |
| rewardTokens | <code>Array.&lt;Token&gt;</code> | List of reward tokens given out by protocol as incentives |

<a name="updateMarket"></a>

## updateMarket(event, market, inputTokenBalances, outputTokenTotalSupply) ⇒ <code>\*</code>
Update market with new input token balances and new supply of output token.
Before updating market create market snapshot and store it.

**Kind**: global function  
**Returns**: <code>\*</code> - {MarketSnapshot} Market snapshot entity  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event which triggered the change |
| market | <code>Market</code> | Market to be updated |
| inputTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market. |
| outputTokenTotalSupply | <code>BigInt</code> | Total supply of output token |

<a name="createMarketSnapshot"></a>

## createMarketSnapshot(event, market) ⇒ <code>\*</code>
Create market snapshot entity which stores balances of input tokens and supply of output token at given block.

**Kind**: global function  
**Returns**: <code>\*</code> - {MarketSnapshot} MarketSnapshot entity  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event which holds block and transaction info |
| market | <code>Market</code> | Market to create snapshot for |

<a name="getOrCreateOpenPosition"></a>

## getOrCreateOpenPosition(event, account, market, positionType) ⇒ <code>\*</code>
Fetch user's open position, or create a new one if user has no open positions.
Position stores user's balances of input, output and reward tokens for certain market.

**Kind**: global function  
**Returns**: <code>\*</code> - {Position} Position entity  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event which triggered change in user's position |
| account | <code>Account</code> | Account for which we fetch/create the position |
| market | <code>Market</code> | Market which position is tracking |
| positionType | <code>string</code> | Position type can be investment or debt |

<a name="createPositionSnapshot"></a>

## createPositionSnapshot(position, transaction) ⇒ <code>\*</code>
Create snapshot of user's position at certain block

**Kind**: global function  
**Returns**: <code>\*</code> - {PositionSnapshot} PositionSnapshot entity  

| Param | Type | Description |
| --- | --- | --- |
| position | <code>Position</code> | Position to create snapshot of |
| transaction | <code>Transaction</code> | Transaction which triggered the change in position |

<a name="investInMarket"></a>

## investInMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances, transferredFrom) ⇒ <code>\*</code>
Store transaction and update user's position when user has invested in market (or received market
output token). Before transaction is stored and position updated, snapshots of market and
position are created for historical tracking. If new balance of user's market output tokens is 0,
position is closed.

**Kind**: global function  
**Returns**: <code>\*</code> - {Position} User's updated position in the market  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event emitted after user's investment |
| account | <code>Account</code> | Investor's account |
| market | <code>Market</code> | Market in which user invested |
| outputTokenAmount | <code>BigInt</code> | Change in user's output token balance as part of this transaction |
| inputTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of input tokens that are deposited by user in this transaction |
| rewardTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of reward tokens that are claimed by user in this transaction |
| outputTokenBalance | <code>BigInt</code> | Latest user's balance of the market's output token |
| inputTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market |
| rewardTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of market's reward tokens claimable by user (not counting already claimed tokens) |
| transferredFrom | <code>string</code> \| <code>null</code> | Null if investment was made by user; or address of sender in case when market ouput tokens were transferred to user |

<a name="redeemFromMarket"></a>

## redeemFromMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances, transferredTo) ⇒ <code>\*</code>
Store transaction and update user's position when user has withdrawn tokens from market (or sent out
market output token). Before transaction is stored and position updated, snapshots of market and
position are created for historical tracking. If new balance of user's market output tokens is 0,
position is closed.

**Kind**: global function  
**Returns**: <code>\*</code> - {Position} User's updated position in the market  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event emitted after user's withdrawal |
| account | <code>Account</code> | Investor's account |
| market | <code>Market</code> | Market from which user withdrew |
| outputTokenAmount | <code>BigInt</code> | Change in user's output token balance as part of this transaction |
| inputTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of input tokens that are received by user in this transaction |
| rewardTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of reward tokens that are claimed by user in this transaction |
| outputTokenBalance | <code>BigInt</code> | Latest user's balance of the market's output token |
| inputTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market |
| rewardTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of market's reward tokens claimable by user (not counting already claimed tokens) |
| transferredTo | <code>string</code> \| <code>null</code> | Null if withdrawal was made by user; or address of receiver in case when user sent out marker output tokens |

<a name="borrowFromMarket"></a>

## borrowFromMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances) ⇒ <code>\*</code>
Store transaction and update user's position when user has borrowed from market. Before transaction
is stored and position updated, snapshots of market and position are created for historical tracking.

**Kind**: global function  
**Returns**: <code>\*</code> - {Position} User's updated position in the market  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event emitted after user's borrowing |
| account | <code>Account</code> | Investor's account |
| market | <code>Market</code> | Market from which user borrowed |
| outputTokenAmount | <code>BigInt</code> | Change in user's output token balance as part of this transaction |
| inputTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of input tokens borrowed by user in this transaction |
| rewardTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of reward tokens that are claimed by user in this transaction |
| outputTokenBalance | <code>BigInt</code> | Latest user's balance of the market's output token |
| inputTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market |
| rewardTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of market's reward tokens claimable by user (not counting already claimed tokens) |

<a name="repayToMarket"></a>

## repayToMarket(event, account, market, outputTokenAmount, inputTokenAmounts, rewardTokenAmounts, outputTokenBalance, inputTokenBalances, rewardTokenBalances) ⇒ <code>\*</code>
Store transaction and update user's position when user has repayed debt to market. Before
transaction is stored and position updated, snapshots of market and position are created
for historical tracking.

**Kind**: global function  
**Returns**: <code>\*</code> - {Position} User's updated position in the market  

| Param | Type | Description |
| --- | --- | --- |
| event | <code>ethereum.Event</code> | Event emitted after user's repayment |
| account | <code>Account</code> | Investor's account |
| market | <code>Market</code> | Market to which user repayed |
| outputTokenAmount | <code>BigInt</code> | Change in user's output token balance as part of this transaction |
| inputTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of input tokens repayed by user in this transaction |
| rewardTokenAmounts | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of reward tokens that are claimed by user in this transaction |
| outputTokenBalance | <code>BigInt</code> | Latest user's balance of the market's output token |
| inputTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market |
| rewardTokenBalances | [<code>Array.&lt;TokenBalance&gt;</code>](#TokenBalance) | Amounts of market's reward tokens claimable by user (not counting already claimed tokens) |
