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

export function getOrCreateAccount(_account: string): Account {
  let account = Account.load(_account)
  if (account != null) {
    return account as Account
  }

  account = new Account(_account)
  account.save()
  return account as Account
}

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

export function getOrCreateMarket(
  block: near.Block,
  _account: string,
  protocolName: string,
  protocolType: string,
  inputTokens: Token[],
  outputToken: Token | null,
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
  market.outputToken = outputToken ? outputToken.id : null;
  market.rewardTokens = rewardTokens.map<string>(t => t.id)
  market.inputTokenTotalBalances = inputTokenBalances.map<string>(tb => tb.toString())
  market.outputTokenTotalSupply = BigInt.fromI32(0)
  market.blockNumber = BigInt.fromI64(block.header.height)
  market.timestamp = BigInt.fromI64(block.header.timestampNanosec)
  market.save()
  return market as Market
}

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

function addTokenBalances(atbs: TokenBalance[], btbs: TokenBalance[]): TokenBalance[] {
  if (atbs.length == 0) {
    return btbs
  }

  if (btbs.length == 0) {
    return atbs
  }

  let atbsLength = atbs.length
  let btbsLength = btbs.length

  let sum: TokenBalance[] = []

  for (let i = 0; i < btbsLength; i = i + 1) {
    let bv = btbs[i]
    let found = false
    for (let j = 0; j < atbsLength; j = j + 1) {
      let av = atbs[j]
      if (av.tokenstring == bv.tokenstring) {
        found = true
        sum.push(av.add(bv))
      }
    }
    if (!found) {
      sum.push(bv)
    }
  }

  return sum
}

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

// We don't want to have any logic to calculae balance with protocol specific logic here
// Balance should be calculated in protocol specific evennt handlers and sent here
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