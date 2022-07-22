import { BigInt, JSONValue, near, TypedMap } from "@graphprotocol/graph-ts"
import {
  Account,
  AccountPosition,
  Market,
  MarketSnapshot,
  Position,
  PositionSnapshot,
  ReceiptActions,
  Token,
  Transaction
} from "../generated/schema"
import { PositionType, TokenStandard, TransactionType } from "./constants"

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Fetch account entity, or create it if it doens't exist.
 *
 * @export
 * @param {String} _account AccountID of the account to load/create
 * @return {*}  {Account} Account entity
 */
export function getOrCreateAccount(_account: string): Account {
  let account = Account.load(_account)
  if (account != null) {
    return account as Account
  }

  account = new Account(_account)
  account.save()
  return account as Account
}

/**
 * Fetch token entity, or create it if not existing, for NEP141 token.
 * Token name, symbol and decimals could be fetched by contract calls but
 * contract calls are not yet supported in graph mapping code so these
 * values are null for now
 *
 * @export
 * @param {near.Block} block Block in which we received first receipt on this token
 * @param {String} _account AccountId of the NEP141 token
 * @return {*}  {Token} Token entity
 */
export function getOrCreateNEP141Token(block: near.Block, _account: string): Token {
  let token = Token.load(_account)
  if (token != null) {
    return token as Token
  }

  token = new Token(_account)
  token.tokenStandard = TokenStandard.NEP141
  // Can't implement becuase of lack of support for view function NEAR subgraphs
  // let tokenInstance = NEP141.bind(_account)
  // let tryName = tokenInstance.try_name()
  // if (!tryName.reverted) {
  //   token.name = tryName.value
  // }
  // let trySymbol = tokenInstance.try_symbol()
  // if (!trySymbol.reverted) {
  //   token.symbol = trySymbol.value
  // }
  // let tryDecimals = tokenInstance.try_decimals()
  // if (!tryDecimals.reverted) {
  //   token.decimals = tryDecimals.value
  // }
  token.blockNumber = BigInt.fromI64(block.header.height)
  token.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  token.save()
  return token as Token
}

/**
 * Fetch market entity, or create it if it doesn't exist. ID of the market is its AccountId.
 *
 * @export
 * @param {near.Block} block Block in which we received first receipt on this market
 * @param {String} _account AccountId of the Market
 * @param {string} protocolName Name of the protocol based on ProtocolName enum
 * @param {string} protocolType Type of the protocol based on ProtocolType enum
 * @param {Token[]} inputTokens List of tokens that can be deposited in this market as investment
 * @param {Token} outputToken Token that is minted by the market to track the position of a user in the market (e.g. an LP token)
 * @param {Token[]} rewardTokens List of reward tokens given out by protocol as incentives
 * @return {*}  {Market} Market entity
 */
export function getOrCreateMarket(
  block: near.Block,
  _account: string,
  protocolName: string,
  protocolType: string,
  inputTokens: Token[],
  outputToken: Token,
  rewardTokens: Token[]
): Market {
  let market = Market.load(_account)
  if (market != null) {
    return market as Market
  }

  let inputTokenBalances: TokenBalance[] = []
  for (let i = 0; i < inputTokens.length; i++) {
    let token = inputTokens[i]
    inputTokenBalances.push(new TokenBalance(token.id, _account, BigInt.fromI32(0)))
  }

  market = new Market(_account)
  market.account = getOrCreateAccount(_account).id
  market.protocolName = protocolName
  market.protocolType = protocolType
  market.inputTokens = inputTokens.map<string>(t => t.id)
  market.outputToken = outputToken.id
  market.rewardTokens = rewardTokens.map<string>(t => t.id)
  market.inputTokenTotalBalances = inputTokenBalances.map<string>(tb => tb.toString())
  market.outputTokenTotalSupply = BigInt.fromI32(0)
  market.blockNumber = BigInt.fromI64(block.header.height)
  market.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  market.save()
  return market as Market
}

/**
 * Update market with new input token balances and new supply of output token.
 * Before updating market create market snapshot and store it.
 *
 * @export
 * @param {near.ActionReceipt} NEAR receipt in which handle action to update this entity
 * @param {near.Block} block Block in which this receipt was included
 * @param {Market} market Market to be updated
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market.
 * @param {BigInt} outputTokenTotalSupply Total supply of output token
 * @return {*}  {Market} Updated Market entity
 */
export function updateMarket(
  receipt: near.ActionReceipt,
  block: near.Block,
  market: Market,
  inputTokenBalances: TokenBalance[],
  outputTokenTotalSupply: BigInt
): Market {
  market.inputTokenTotalBalances = inputTokenBalances.map<string>(tb => tb.toString())
  market.outputTokenTotalSupply = outputTokenTotalSupply
  market.save()

  createMarketSnapshot(receipt, block, market);

  return market;
}

/**
 * Create market snapshot entity which stores balances of input tokens and supply of output token at given block.
 *
 * @export
 * @param {near.ActionReceipt} NEAR receipt in which handle action to update market entity
 * @param {near.Block} block Block in which this receipt was included
 * @param {Market} market Market to create snapshot for
 * @return {*}  {MarketSnapshot} MarketSnapshot entity
 */
export function createMarketSnapshot(
  receipt: near.ActionReceipt,
  block: near.Block,
  market: Market,
): MarketSnapshot {
  let id = receipt.id.toBase58()
  let marketSnapshot = MarketSnapshot.load(id)
  if (marketSnapshot == null) {
    marketSnapshot = new MarketSnapshot(id)
    marketSnapshot.market = market.id
  }

  marketSnapshot.inputTokenBalances = market.inputTokenTotalBalances
  marketSnapshot.outputTokenTotalSupply = market.outputTokenTotalSupply
  marketSnapshot.blockNumber = BigInt.fromI64(block.header.height)
  marketSnapshot.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  marketSnapshot.save()

  return marketSnapshot as MarketSnapshot
}

/**
 * Fetch user's open position, or create a new one if user has no open positions.
 * Position stores user's balances of input, output and reward tokens for certain market.
 *
 * @export
 * @param {near.Block} block Block in which the receipt was included
 * @param {Account} account Account for which we fetch/create the position
 * @param {Market} market Market which position is tracking
 * @param {string} positionType Position type can be investment or debt
 * @return {*}  {Position} Position entity
 */
export function getOrCreateOpenPosition(
  block: near.Block,
  account: Account,
  market: Market,
  positionType: string
): Position {
  let id = account.id.concat("-").concat(market.id).concat("-").concat(positionType)
  let accountPosition = AccountPosition.load(id)
  if (accountPosition == null) {
    accountPosition = new AccountPosition(id)
    accountPosition.positionCounter = BigInt.fromI32(0)
    accountPosition.save()
  }

  let pid = accountPosition.id.concat("-").concat((accountPosition.positionCounter).toString())
  let lastPosition = Position.load(pid)

  if (lastPosition == null || lastPosition.closed) {
    let newCounter = accountPosition.positionCounter.plus(BigInt.fromI32(1))
    let newPositionId = id.concat("-").concat(newCounter.toString())
    let position = new Position(newPositionId)
    position.accountPosition = accountPosition.id
    position.account = account.id
    position.accountAddress = account.id
    position.market = market.id
    position.marketAddress = market.id
    position.positionType = positionType
    position.outputTokenBalance = BigInt.fromI32(0)
    position.inputTokenBalances = []
    position.rewardTokenBalances = []
    position.closed = false
    position.blockNumber = BigInt.fromI64(block.header.height)
    position.timestamp = BigInt.fromI64(block.header.timestampNanosec)
    position.historyCounter = BigInt.fromI32(0)
    position.save()

    accountPosition.positionCounter = newCounter
    accountPosition.save()

    return position
  }

  return lastPosition as Position
}

/**
 * User's balance of specific token
 *
 * @export
 * @class TokenBalance
 */
export class TokenBalance {
  tokenstring: string
  accountstring: string
  balance: BigInt

  constructor(tokenstring: string, accountstring: string, balance: BigInt) {
    this.tokenstring = tokenstring
    this.accountstring = accountstring
    this.balance = balance
  }

  // Does not modify this or b TokenBalance, return new TokenBalance
  add(b: TokenBalance): TokenBalance {
    if (this.tokenstring == b.tokenstring) {
      return new TokenBalance(this.tokenstring, this.accountstring, this.balance.plus(b.balance))
    } else {
      return this
    }
  }

  toString(): string {
    return this.tokenstring.concat("|").concat(this.accountstring).concat("|").concat(this.balance.toString())
  }

  static fromString(tb: string): TokenBalance {
    let parts = tb.split("|")
    let tokenstring = parts[0]
    let accountstring = parts[1]
    let balance = BigInt.fromString(parts[2])
    return new TokenBalance(tokenstring, accountstring, balance)
  }
}

/**
 * Create snapshot of user's position at certain block
 *
 * @param {Position} position Position to create snapshot of
 * @param {Transaction} transaction Transaction which triggered the change in position
 * @return {*}  {PositionSnapshot} PositionSnapshot entity
 */
function createPostionSnapshot(position: Position, transaction: Transaction): PositionSnapshot {
  let newCounter = position.historyCounter.plus(BigInt.fromI32(1))
  let newSnapshot = new PositionSnapshot(position.id.concat("-").concat(newCounter.toString()))
  newSnapshot.position = position.id
  newSnapshot.transaction = transaction.id
  newSnapshot.outputTokenBalance = position.outputTokenBalance
  newSnapshot.inputTokenBalances = position.inputTokenBalances
  newSnapshot.rewardTokenBalances = position.rewardTokenBalances
  position.blockNumber = transaction.blockNumber
  position.timestamp = transaction.timestamp
  newSnapshot.save()

  position.historyCounter = newCounter
  position.save()

  return newSnapshot
}

/**
 * Helper function to get new action counter for a single receipt
 * We need to append action counter in ID of transaction entity
 * because there can be multiple actions in a single receipt which
 * update the position of a single or multiple users. If we don't use
 * this suffix then we will override transaction entity for earlier
 * actions and will save only last action.
 * 
 * @param {near.ActionReceipt} receipt NEAR receipt being processed
 * @returns {String} Receipt action counter as string
 */
function getReceiptActionCounter(receipt: near.ActionReceipt): string {
  let receiptActionsId = receipt.id.toBase58()
  let receiptAction = ReceiptActions.load(receiptActionsId)
  if (receiptAction == null) {
    receiptAction = new ReceiptActions(receiptActionsId)
    receiptAction.actionCounter = 0
    receiptAction.save()
  }
  receiptAction.actionCounter = receiptAction.actionCounter + 1
  receiptAction.save()
  return receiptAction.actionCounter.toString()
}

/**
 * Store transaction and update user's position when user has invested in market (or received market
 * output token). Before transaction is stored and position updated, snapshots of market and
 * position are created for historical tracking. If new balance of user's market output tokens is 0,
 * position is closed.
 * 
 * We don't want to have any logic to calculae balance with protocol specific logic here
 * Balance should be calculated in protocol specific evennt handlers and sent here
 *
 * @export
 * @param {near.ActionReceipt} receipt NEAR receipt in which handle action to update market entity
 * @param {near.ExecutionOutcome} outcome NEAR receipt oucome of above receipt
 * @param {near.Block} block Block in which this receipt was included
 * @param {Account} account Investor's account
 * @param {Market} market Market in which user invested
 * @param {BigInt} outputTokenAmount Change in user's output token balance as part of this transaction
 * @param {TokenBalance[]} inputTokenAmounts Amounts of input tokens that are deposited by user in this transaction
 * @param {TokenBalance[]} rewardTokenAmounts Amounts of reward tokens that are claimed by user in this transaction
 * @param {BigInt} outputTokenBalance Latest user's balance of the market's output token
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market
 * @param {TokenBalance[]} rewardTokenBalances Amounts of market's reward tokens claimable by user (not counting already claimed tokens)
 * @param {(string | null)} transferredFrom Null if investment was made by user; or address of sender in case when market ouput tokens were transferred to user
 * @return {*}  {Position} User's updated position in the market
 */
export function investInMarket(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  account: Account,
  market: Market,
  outputTokenAmount: BigInt,
  inputTokenAmounts: TokenBalance[],
  rewardTokenAmounts: TokenBalance[],
  outputTokenBalance: BigInt,
  inputTokenBalances: TokenBalance[],
  rewardTokenBalances: TokenBalance[],
  transferredFrom: string | null
): Position {
  // Create marketSnapshot for transaction
  let marketSnapshot = createMarketSnapshot(receipt, block, market)

  // Create transaction for given event
  let receiptActionCounter = getReceiptActionCounter(receipt)
  let transactionId = account.id.concat("-").concat(market.id).concat("-").concat(receipt.id.toBase58()).concat("-").concat(receiptActionCounter)
  let transaction = new Transaction(transactionId)
  transaction.receiptId = receipt.id.toBase58()
  transaction.market = market.id
  transaction.marketSnapshot = marketSnapshot.id
  transaction.from = getOrCreateAccount(receipt.signerId).id
  transaction.to = getOrCreateAccount(receipt.receiverId).id
  if (transferredFrom == null) {
    transaction.transactionType = TransactionType.INVEST
  } else {
    transaction.transactionType = TransactionType.TRANSFER_IN
  }
  transaction.transferredFrom = transferredFrom
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>(tb => tb.toString())
  transaction.outputTokenAmount = outputTokenAmount
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>(tb => tb.toString())
  transaction.gasUsed = BigInt.fromI64(outcome.gasBurnt)
  transaction.gasPrice = receipt.gasPrice
  transaction.blockNumber = BigInt.fromI64(block.header.height)
  transaction.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  transaction.save()

  let position = getOrCreateOpenPosition(block, account, market, PositionType.INVESTMENT)

  position.inputTokenBalances = inputTokenBalances.map<string>(tb => tb.toString())
  position.outputTokenBalance = outputTokenBalance
  position.rewardTokenBalances = rewardTokenBalances.map<string>(tb => tb.toString())

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true
  }

  position.save()
  let postionSnapshot = createPostionSnapshot(position, transaction)

  return position
}

/**
 * Store transaction and update user's position when user has withdrawn tokens from market (or sent out
 * market output token). Before transaction is stored and position updated, snapshots of market and
 * position are created for historical tracking. If new balance of user's market output tokens is 0,
 * position is closed.
 *
 * @export
 * @param {near.ActionReceipt} receipt NEAR receipt in which handle action to update market entity
 * @param {near.ExecutionOutcome} outcome NEAR receipt oucome of above receipt
 * @param {near.Block} block Block in which this receipt was included
 * @param {Account} account Investor's account
 * @param {Market} market Market from which user withdrew
 * @param {BigInt} outputTokenAmount Change in user's output token balance as part of this transaction
 * @param {TokenBalance[]} inputTokenAmounts Amounts of input tokens that are received by user in this transaction
 * @param {TokenBalance[]} rewardTokenAmounts Amounts of reward tokens that are claimed by user in this transaction
 * @param {BigInt} outputTokenBalance Latest user's balance of the market's output token
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market
 * @param {TokenBalance[]} rewardTokenBalances Amounts of market's reward tokens claimable by user (not counting already claimed tokens)
 * @param {(string | null)} transferredTo Null if withdrawal was made by user; or address of receiver in case when user sent out marker output tokens
 * @return {*}  {Position} User's updated position in the market
 */
export function redeemFromMarket(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  account: Account,
  market: Market,
  outputTokenAmount: BigInt,
  inputTokenAmounts: TokenBalance[],
  rewardTokenAmounts: TokenBalance[],
  outputTokenBalance: BigInt,
  inputTokenBalances: TokenBalance[],
  rewardTokenBalances: TokenBalance[],
  transferredTo: string | null
): Position {
  // Create marketSnapshot for transaction
  let marketSnapshot = createMarketSnapshot(receipt, block, market)

  // Create transaction for given event
  let receiptActionCounter = getReceiptActionCounter(receipt)
  let transactionId = account.id.concat("-").concat(market.id).concat("-").concat(receipt.id.toBase58()).concat("-").concat(receiptActionCounter)
  let transaction = new Transaction(transactionId)
  transaction.receiptId = receipt.id.toBase58()
  transaction.market = market.id
  transaction.marketSnapshot = marketSnapshot.id
  transaction.from = getOrCreateAccount(receipt.signerId).id
  transaction.to = getOrCreateAccount(receipt.receiverId).id
  if (transferredTo == null) {
    transaction.transactionType = TransactionType.REDEEM
  } else {
    transaction.transactionType = TransactionType.TRANSFER_OUT
  }
  transaction.transferredTo = transferredTo
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>(tb => tb.toString())
  transaction.outputTokenAmount = outputTokenAmount
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>(tb => tb.toString())
  transaction.gasUsed = BigInt.fromI64(outcome.gasBurnt)
  transaction.gasPrice = receipt.gasPrice
  transaction.blockNumber = BigInt.fromI64(block.header.height)
  transaction.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  transaction.save()

  let position = getOrCreateOpenPosition(block, account, market, PositionType.INVESTMENT)

  // No change in investment amount as no new investment has been made
  position.inputTokenBalances = inputTokenBalances.map<string>(tb => tb.toString())
  position.outputTokenBalance = outputTokenBalance
  position.rewardTokenBalances = rewardTokenBalances.map<string>(tb => tb.toString())

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true
  }

  position.save()
  let postionSnapshot = createPostionSnapshot(position, transaction)

  return position
}

/**
 * Store transaction and update user's position when user has borrowed from market. Before transaction
 * is stored and position updated, snapshots of market and position are created for historical tracking.
 *
 * @export
 * @param {near.ActionReceipt} receipt NEAR receipt in which handle action to update market entity
 * @param {near.ExecutionOutcome} outcome NEAR receipt oucome of above receipt
 * @param {near.Block} block Block in which this receipt was included
 * @param {Account} account Investor's account
 * @param {Market} market Market from which user borrowed
 * @param {BigInt} outputTokenAmount Change in user's output token balance as part of this transaction
 * @param {TokenBalance[]} inputTokenAmounts Amounts of input tokens borrowed by user in this transaction
 * @param {TokenBalance[]} rewardTokenAmounts Amounts of reward tokens that are claimed by user in this transaction
 * @param {BigInt} outputTokenBalance Latest user's balance of the market's output token
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market
 * @param {TokenBalance[]} rewardTokenBalances Amounts of market's reward tokens claimable by user (not counting already claimed tokens)
 * @return {*}  {Position} User's updated position in the market
 */
export function borrowFromMarket(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  account: Account,
  market: Market,
  outputTokenAmount: BigInt,
  inputTokenAmounts: TokenBalance[],
  rewardTokenAmounts: TokenBalance[],
  outputTokenBalance: BigInt,
  inputTokenBalances: TokenBalance[],
  rewardTokenBalances: TokenBalance[]
): Position {
  // Create marketSnapshot for transaction
  let marketSnapshot = createMarketSnapshot(receipt, block, market)

  // Create transaction for given event
  let receiptActionCounter = getReceiptActionCounter(receipt)
  let transactionId = account.id.concat("-").concat(market.id).concat("-").concat(receipt.id.toBase58()).concat("-").concat(receiptActionCounter)
  let transaction = new Transaction(transactionId)
  transaction.receiptId = receipt.id.toBase58()
  transaction.market = market.id
  transaction.marketSnapshot = marketSnapshot.id
  transaction.from = getOrCreateAccount(receipt.signerId).id
  transaction.to = getOrCreateAccount(receipt.receiverId).id
  transaction.transactionType = TransactionType.BORROW
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>(tb => tb.toString())
  transaction.outputTokenAmount = outputTokenAmount
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>(tb => tb.toString())
  transaction.gasUsed = BigInt.fromI64(outcome.gasBurnt)
  transaction.gasPrice = receipt.gasPrice
  transaction.blockNumber = BigInt.fromI64(block.header.height)
  transaction.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  transaction.save()

  let position = getOrCreateOpenPosition(block, account, market, PositionType.DEBT)

  position.inputTokenBalances = inputTokenBalances.map<string>(tb => tb.toString())
  position.outputTokenBalance = outputTokenBalance
  position.rewardTokenBalances = rewardTokenBalances.map<string>(tb => tb.toString())

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true
  }

  position.save()
  let postionSnapshot = createPostionSnapshot(position, transaction)

  return position
}

/**
 * Store transaction and update user's position when user has repayed debt to market. Before
 * transaction is stored and position updated, snapshots of market and position are created
 * for historical tracking.
 *
 * @export
 * @param {near.ActionReceipt} receipt NEAR receipt in which handle action to update market entity
 * @param {near.ExecutionOutcome} outcome NEAR receipt oucome of above receipt
 * @param {near.Block} block Block in which this receipt was included
 * @param {Account} account Investor's account
 * @param {Market} market Market to which user repayed
 * @param {BigInt} outputTokenAmount Change in user's output token balance as part of this transaction
 * @param {TokenBalance[]} inputTokenAmounts Amounts of input tokens repayed by user in this transaction
 * @param {TokenBalance[]} rewardTokenAmounts Amounts of reward tokens that are claimed by user in this transaction
 * @param {BigInt} outputTokenBalance Latest user's balance of the market's output token
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market
 * @param {TokenBalance[]} rewardTokenBalances Amounts of market's reward tokens claimable by user (not counting already claimed tokens)
 * @return {*}  {Position} User's updated position in the market
 */
export function repayToMarket(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  account: Account,
  market: Market,
  outputTokenAmount: BigInt,
  inputTokenAmounts: TokenBalance[],
  rewardTokenAmounts: TokenBalance[],
  outputTokenBalance: BigInt,
  inputTokenBalances: TokenBalance[],
  rewardTokenBalances: TokenBalance[]
): Position {
  // Create marketSnapshot for transaction
  let marketSnapshot = createMarketSnapshot(receipt, block, market)

  // Create transaction for given event
  let receiptActionCounter = getReceiptActionCounter(receipt)
  let transactionId = account.id.concat("-").concat(market.id).concat("-").concat(receipt.id.toBase58()).concat("-").concat(receiptActionCounter)
  let transaction = new Transaction(transactionId)
  transaction.receiptId = receipt.id.toBase58()
  transaction.market = market.id
  transaction.marketSnapshot = marketSnapshot.id
  transaction.from = getOrCreateAccount(receipt.signerId).id
  transaction.to = getOrCreateAccount(receipt.receiverId).id
  transaction.transactionType = TransactionType.REPAY
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>(tb => tb.toString())
  transaction.outputTokenAmount = outputTokenAmount
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>(tb => tb.toString())
  transaction.gasUsed = BigInt.fromI64(outcome.gasBurnt)
  transaction.gasPrice = receipt.gasPrice
  transaction.blockNumber = BigInt.fromI64(block.header.height)
  transaction.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  transaction.save()

  let position = getOrCreateOpenPosition(block, account, market, PositionType.DEBT)

  // Loan amount is not changed on repayment
  position.inputTokenBalances = inputTokenBalances.map<string>(tb => tb.toString())
  position.outputTokenBalance = outputTokenBalance
  position.rewardTokenBalances = rewardTokenBalances.map<string>(tb => tb.toString())

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true
  }

  position.save()
  let postionSnapshot = createPostionSnapshot(position, transaction)

  return position
}

/**
 * Helper function to parse a nullable attribute JSON object.
 * This attribute may not be there in the Map or it may have a
 * null JSON value.
 * 
 * @param obj {TypedMap<string, JSONValue>} A JSON object
 * @param key {string} Name of the attribute to be parsed
 * @param parser {*} Function to parse the attribute if it's not null
 * @returns {*} Parsed value of the attribute
 */
export function parseNullableJSONAtrribute<T>(
  obj: TypedMap<string, JSONValue>,
  key: string,
  parser: (jv: JSONValue) => T
): T | null {
  if (!obj.isSet(key)) {
    return null;
  }
  const value = obj.get(key) as JSONValue;
  if (value.isNull()) {
    return null;
  }
  return parser(value);
}