import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  Account,
  AccountPosition,
  Market,
  MarketSnapshot,
  Position,
  PositionSnapshot,
  Token,
  Transaction,
} from "../../generated/schema";
import { ERC20 } from "../../generated/LendingPoolAddressesProviderRegistry/ERC20";
import { PositionType, TokenStandard, TransactionType } from "./constants";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Fetch account entity, or create it if it doens't exist. Account can be either EOA or contract.
 *
 * @export
 * @param {Address} address Address of the account to load/create
 * @return {*}  {Account} Account entity
 */
export function getOrCreateAccount(address: Address): Account {
  let addressHex = address.toHexString();
  let account = Account.load(addressHex);
  if (account != null) {
    return account as Account;
  }

  account = new Account(addressHex);
  account.save();
  return account as Account;
}

/**
 * Fetch token entity, or create it if not existing, for ERC20 token.
 * Token name, symbol and decimals are fetched by contract calls.
 *
 * @export
 * @param {ethereum.Event} event Event with block info for this token
 * @param {Address} address Address of the ERC20 token
 * @return {*}  {Token} Token entity
 */
export function getOrCreateERC20Token(event: ethereum.Event, address: Address): Token {
  let addressHex = address.toHexString();
  let token = Token.load(addressHex);
  if (token != null) {
    return token as Token;
  }

  token = new Token(addressHex);
  token.tokenStandard = TokenStandard.ERC20;
  let tokenInstance = ERC20.bind(address);
  let tryName = tokenInstance.try_name();
  if (!tryName.reverted) {
    token.name = tryName.value;
  }
  let trySymbol = tokenInstance.try_symbol();
  if (!trySymbol.reverted) {
    token.symbol = trySymbol.value;
  }
  let tryDecimals = tokenInstance.try_decimals();
  if (!tryDecimals.reverted) {
    token.decimals = tryDecimals.value;
  }
  token.blockNumber = event.block.number;
  token.timestamp = event.block.timestamp;
  token.save();
  return token as Token;
}

/**
 * Fetch market entity, or create it if it doesn't exist.
 *
 * @export
 * @param {ethereum.Event} event Event contains block info
 * @param {Address} address Address of the market
 * @param {string} protocolName Name of the protocol based on ProtocolName enum
 * @param {string} protocolType Type of the protocol based on ProtocolType enum
 * @param {Token[]} inputTokens List of tokens that can be deposited in this market as investment
 * @param {Token} outputToken Token that is minted by the market to track the position of a user in the market (e.g. an LP token)
 * @param {Token[]} rewardTokens List of reward tokens given out by protocol as incentives
 * @return {*}  {Market} Market entity
 */
export function getOrCreateMarket(
  event: ethereum.Event,
  address: Address,
  protocolName: string,
  protocolType: string,
  inputTokens: Token[],
  outputToken: Token,
  rewardTokens: Token[]
): Market {
  let addressHex = address.toHexString();
  let market = Market.load(addressHex);
  if (market != null) {
    return market as Market;
  }

  let inputTokenBalances: TokenBalance[] = [];
  for (let i = 0; i < inputTokens.length; i++) {
    let token = inputTokens[i];
    inputTokenBalances.push(new TokenBalance(token.id, addressHex, BigInt.fromI32(0)));
  }

  market = new Market(addressHex);
  market.account = getOrCreateAccount(address).id;
  market.protocolName = protocolName;
  market.protocolType = protocolType;
  market.inputTokens = inputTokens.map<string>((t) => t.id);
  market.outputToken = outputToken.id;
  market.rewardTokens = rewardTokens.map<string>((t) => t.id);
  market.inputTokenTotalBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  market.outputTokenTotalSupply = BigInt.fromI32(0);
  market.blockNumber = event.block.number;
  market.timestamp = event.block.timestamp;
  market.save();
  return market as Market;
}

/**
 * Update market with new input token balances and new supply of output token.
 * Before updating market create market snapshot and store it.
 *
 * @export
 * @param {ethereum.Event} event Event which triggered the change
 * @param {Market} market Market to be updated
 * @param {TokenBalance[]} inputTokenBalances Balances of the input tokens that can be redeemed by sending the outputTokenBalance back to the market.
 * @param {BigInt} outputTokenTotalSupply Total supply of output token
 * @return {*}  {MarketSnapshot} Market snapshot entity
 */
export function updateMarket(
  event: ethereum.Event,
  market: Market,
  inputTokenBalances: TokenBalance[],
  outputTokenTotalSupply: BigInt
): MarketSnapshot {
  let transactionHash = event.transaction.hash.toHexString();
  let id = transactionHash.concat("-").concat(event.logIndex.toHexString());
  let marketSnapshot = MarketSnapshot.load(id);
  if (marketSnapshot != null) {
    return marketSnapshot as MarketSnapshot;
  }

  marketSnapshot = new MarketSnapshot(id);
  marketSnapshot.market = market.id;
  marketSnapshot.inputTokenBalances = market.inputTokenTotalBalances;
  marketSnapshot.outputTokenTotalSupply = market.outputTokenTotalSupply;
  marketSnapshot.blockNumber = event.block.number;
  marketSnapshot.timestamp = event.block.timestamp;
  marketSnapshot.transactionHash = transactionHash;
  marketSnapshot.transactionIndexInBlock = event.transaction.index;
  marketSnapshot.logIndex = event.logIndex;
  marketSnapshot.save();

  market.inputTokenTotalBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  market.outputTokenTotalSupply = outputTokenTotalSupply;
  market.save();

  return marketSnapshot as MarketSnapshot;
}

/**
 * Create market snapshot entity which stores balances of input tokens and supply of output token at given block.
 *
 * @export
 * @param {ethereum.Event} event Event which holds block and transaction info
 * @param {Market} market Market to create snapshot for
 * @return {*}  {MarketSnapshot} MarketSnapshot entity
 */
export function createMarketSnapshot(event: ethereum.Event, market: Market): MarketSnapshot {
  let transactionHash = event.transaction.hash.toHexString();
  let id = transactionHash.concat("-").concat(event.logIndex.toHexString());
  let marketSnapshot = MarketSnapshot.load(id);
  if (marketSnapshot != null) {
    return marketSnapshot as MarketSnapshot;
  }

  marketSnapshot = new MarketSnapshot(id);
  marketSnapshot.market = market.id;
  marketSnapshot.inputTokenBalances = market.inputTokenTotalBalances;
  marketSnapshot.outputTokenTotalSupply = market.outputTokenTotalSupply;
  marketSnapshot.blockNumber = event.block.number;
  marketSnapshot.timestamp = event.block.timestamp;
  marketSnapshot.transactionHash = transactionHash;
  marketSnapshot.transactionIndexInBlock = event.transaction.index;
  marketSnapshot.logIndex = event.logIndex;
  marketSnapshot.save();

  return marketSnapshot as MarketSnapshot;
}

/**
 * Fetch user's open position, or create a new one if user has no open positions.
 * Position stores user's balances of input, output and reward tokens for certain market.
 *
 * @export
 * @param {ethereum.Event} event Event which triggered change in user's position
 * @param {Account} account Account for which we fetch/create the position
 * @param {Market} market Market which position is tracking
 * @param {string} positionType Position type can be investment or debt
 * @return {*}  {Position} Position entity
 */
export function getOrCreateOpenPosition(
  event: ethereum.Event,
  account: Account,
  market: Market,
  positionType: string
): Position {
  let id = account.id
    .concat("-")
    .concat(market.id)
    .concat("-")
    .concat(positionType);
  let accountPosition = AccountPosition.load(id);
  if (accountPosition == null) {
    accountPosition = new AccountPosition(id);
    accountPosition.positionCounter = BigInt.fromI32(0);
    accountPosition.save();
  }

  let pid = accountPosition.id.concat("-").concat(accountPosition.positionCounter.toString());
  let lastPosition = Position.load(pid);

  if (lastPosition == null || lastPosition.closed) {
    let newCounter = accountPosition.positionCounter.plus(BigInt.fromI32(1));
    let newPositionId = id.concat("-").concat(newCounter.toString());
    let position = new Position(newPositionId);
    position.accountPosition = accountPosition.id;
    position.account = account.id;
    position.accountAddress = account.id;
    position.market = market.id;
    position.marketAddress = market.id;
    position.positionType = positionType;
    position.outputTokenBalance = BigInt.fromI32(0);
    position.inputTokenBalances = [];
    position.rewardTokenBalances = [];
    position.transferredTo = [];
    position.closed = false;
    position.blockNumber = event.block.number;
    position.timestamp = event.block.timestamp;
    position.historyCounter = BigInt.fromI32(0);
    position.save();

    accountPosition.positionCounter = newCounter;
    accountPosition.save();

    return position;
  }

  return lastPosition as Position;
}

/**
 * User's balance of specific token
 *
 * @export
 * @class TokenBalance
 */
export class TokenBalance {
  tokenAddress: string;
  accountAddress: string;
  balance: BigInt;

  constructor(tokenAddress: string, accountAddress: string, balance: BigInt) {
    this.tokenAddress = tokenAddress;
    this.accountAddress = accountAddress;
    this.balance = balance;
  }

  // Does not modify this or b TokenBalance, return new TokenBalance
  add(b: TokenBalance): TokenBalance {
    if (this.tokenAddress == b.tokenAddress) {
      return new TokenBalance(this.tokenAddress, this.accountAddress, this.balance.plus(b.balance));
    } else {
      return this;
    }
  }

  toString(): string {
    return this.tokenAddress
      .concat("|")
      .concat(this.accountAddress)
      .concat("|")
      .concat(this.balance.toString());
  }

  static fromString(tb: string): TokenBalance {
    let parts = tb.split("|");
    let tokenAddress = parts[0];
    let accountAddress = parts[1];
    let balance = BigInt.fromString(parts[2]);
    return new TokenBalance(tokenAddress, accountAddress, balance);
  }
}

/**
 * Create snapshot of user's position at certain block
 *
 * @param {Position} position Position to create snapshot of
 * @param {Transaction} transaction Transaction which triggered the change in position
 * @return {*}  {PositionSnapshot} PositionSnapshot entity
 */
function createPositionSnapshot(position: Position, transaction: Transaction): PositionSnapshot {
  let newCounter = position.historyCounter.plus(BigInt.fromI32(1));
  let newSnapshot = new PositionSnapshot(position.id.concat("-").concat(newCounter.toString()));
  newSnapshot.position = position.id;
  newSnapshot.transaction = transaction.id;
  newSnapshot.outputTokenBalance = position.outputTokenBalance;
  newSnapshot.inputTokenBalances = position.inputTokenBalances;
  newSnapshot.rewardTokenBalances = position.rewardTokenBalances;
  newSnapshot.transferredTo = position.transferredTo;
  position.blockNumber = transaction.blockNumber;
  position.timestamp = transaction.timestamp;
  newSnapshot.save();

  position.historyCounter = newCounter;
  position.save();

  return newSnapshot;
}

/**
 * Store transaction and update user's position when user has invested in market (or received market
 * output token). Before transaction is stored and position updated, snapshots of market and
 * position are created for historical tracking. If new balance of user's market output tokens is 0,
 * position is closed.
 *
 * @export
 * @param {ethereum.Event} event Event emitted after user's investment
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
  event: ethereum.Event,
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
  let marketSnapshot = createMarketSnapshot(event, market);

  // Create transaction for given event
  let transactionId = account.id
    .concat("-")
    .concat(event.transaction.hash.toHexString())
    .concat("-")
    .concat(event.logIndex.toHexString());
  let transaction = new Transaction(transactionId);
  transaction.transactionHash = event.transaction.hash;
  transaction.market = market.id;
  transaction.marketSnapshot = marketSnapshot.id;
  transaction.from = getOrCreateAccount(event.transaction.from).id;
  if (event.transaction.to) {
    transaction.to = getOrCreateAccount(event.transaction.to as Address).id;
  }
  if (transferredFrom == null) {
    transaction.transactionType = TransactionType.INVEST;
  } else {
    transaction.transactionType = TransactionType.TRANSFER_IN;
  }
  transaction.transferredFrom = transferredFrom;
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>((tb) => tb.toString());
  transaction.outputTokenAmount = outputTokenAmount;
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>((tb) => tb.toString());
  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.blockNumber = event.block.number;
  transaction.timestamp = event.block.timestamp;
  transaction.transactionIndexInBlock = event.transaction.index;
  transaction.save();

  let position = getOrCreateOpenPosition(event, account, market, PositionType.INVESTMENT);
  let positionSnapshot = createPositionSnapshot(position, transaction);

  position.inputTokenBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  position.outputTokenBalance = outputTokenBalance;
  position.rewardTokenBalances = rewardTokenBalances.map<string>((tb) => tb.toString());

  // Check if position is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true;
  }

  position.save();

  return position;
}

/**
 * Store transaction and update user's position when user has withdrawn tokens from market (or sent out
 * market output token). Before transaction is stored and position updated, snapshots of market and
 * position are created for historical tracking. If new balance of user's market output tokens is 0,
 * position is closed.
 *
 * @export
 * @param {ethereum.Event} event Event emitted after user's withdrawal
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
  event: ethereum.Event,
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
  let marketSnapshot = createMarketSnapshot(event, market);

  // Create transaction for given event
  let transactionId = account.id
    .concat("-")
    .concat(event.transaction.hash.toHexString())
    .concat("-")
    .concat(event.logIndex.toHexString());
  let transaction = new Transaction(transactionId);
  transaction.transactionHash = event.transaction.hash;
  transaction.market = market.id;
  transaction.marketSnapshot = marketSnapshot.id;
  transaction.from = getOrCreateAccount(event.transaction.from).id;
  if (event.transaction.to) {
    transaction.to = getOrCreateAccount(event.transaction.to as Address).id;
  }
  if (transferredTo == null) {
    transaction.transactionType = TransactionType.REDEEM;
  } else {
    transaction.transactionType = TransactionType.TRANSFER_OUT;
  }
  transaction.transferredTo = transferredTo;
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>((tb) => tb.toString());
  transaction.outputTokenAmount = outputTokenAmount;
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>((tb) => tb.toString());
  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.blockNumber = event.block.number;
  transaction.timestamp = event.block.timestamp;
  transaction.transactionIndexInBlock = event.transaction.index;
  transaction.save();

  let position = getOrCreateOpenPosition(event, account, market, PositionType.INVESTMENT);
  let postionSnapshot = createPositionSnapshot(position, transaction);

  // No change in investment amount as no new investment has been made
  position.inputTokenBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  position.outputTokenBalance = outputTokenBalance;
  position.rewardTokenBalances = rewardTokenBalances.map<string>((tb) => tb.toString());

  // Check if it is transferred to some other account
  if (transferredTo != null) {
    let exists = position.transferredTo.includes(transferredTo);
    if (!exists) {
      let newTransferredTo = position.transferredTo;
      newTransferredTo.push(transferredTo);
      position.transferredTo = newTransferredTo;
    }
  }

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true;
  }

  position.save();

  return position;
}

/**
 * Store transaction and update user's position when user has borrowed from market. Before transaction
 * is stored and position updated, snapshots of market and position are created for historical tracking.
 *
 * @export
 * @param {ethereum.Event} event Event emitted after user's borrowing
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
  event: ethereum.Event,
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
  let marketSnapshot = createMarketSnapshot(event, market);

  // Create transaction for given event
  let transactionId = account.id
    .concat("-")
    .concat(event.transaction.hash.toHexString())
    .concat("-")
    .concat(event.logIndex.toHexString());
  let transaction = new Transaction(transactionId);
  transaction.transactionHash = event.transaction.hash;
  transaction.market = market.id;
  transaction.marketSnapshot = marketSnapshot.id;
  transaction.from = getOrCreateAccount(event.transaction.from).id;
  if (event.transaction.to) {
    transaction.to = getOrCreateAccount(event.transaction.to as Address).id;
  }
  transaction.transactionType = TransactionType.BORROW;
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>((tb) => tb.toString());
  transaction.outputTokenAmount = outputTokenAmount;
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>((tb) => tb.toString());
  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.blockNumber = event.block.number;
  transaction.timestamp = event.block.timestamp;
  transaction.transactionIndexInBlock = event.transaction.index;
  transaction.save();

  let position = getOrCreateOpenPosition(event, account, market, PositionType.DEBT);
  let positionSnapshot = createPositionSnapshot(position, transaction);

  position.inputTokenBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  position.outputTokenBalance = outputTokenBalance;
  position.rewardTokenBalances = rewardTokenBalances.map<string>((tb) => tb.toString());

  // Check if position is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true;
  }

  position.save();

  return position;
}

/**
 * Store transaction and update user's position when user has repayed debt to market. Before
 * transaction is stored and position updated, snapshots of market and position are created
 * for historical tracking.
 *
 * @export
 * @param {ethereum.Event} event Event emitted after user's repayment
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
  event: ethereum.Event,
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
  let marketSnapshot = createMarketSnapshot(event, market);

  // Create transaction for given event
  let transactionId = account.id
    .concat("-")
    .concat(event.transaction.hash.toHexString())
    .concat("-")
    .concat(event.logIndex.toHexString());
  let transaction = new Transaction(transactionId);
  transaction.transactionHash = event.transaction.hash;
  transaction.market = market.id;
  transaction.marketSnapshot = marketSnapshot.id;
  transaction.from = getOrCreateAccount(event.transaction.from).id;
  if (event.transaction.to) {
    transaction.to = getOrCreateAccount(event.transaction.to as Address).id;
  }
  transaction.transactionType = TransactionType.REPAY;
  transaction.inputTokenAmounts = inputTokenAmounts.map<string>((tb) => tb.toString());
  transaction.outputTokenAmount = outputTokenAmount;
  transaction.rewardTokenAmounts = rewardTokenAmounts.map<string>((tb) => tb.toString());
  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.blockNumber = event.block.number;
  transaction.timestamp = event.block.timestamp;
  transaction.transactionIndexInBlock = event.transaction.index;
  transaction.save();

  let position = getOrCreateOpenPosition(event, account, market, PositionType.DEBT);
  let postionSnapshot = createPositionSnapshot(position, transaction);

  // Loan amount is not changed on repayment
  position.inputTokenBalances = inputTokenBalances.map<string>((tb) => tb.toString());
  position.outputTokenBalance = outputTokenBalance;
  position.rewardTokenBalances = rewardTokenBalances.map<string>((tb) => tb.toString());

  // Check if postion is closed
  if (position.outputTokenBalance == BigInt.fromI32(0)) {
    position.closed = true;
  }

  position.save();

  return position;
}
