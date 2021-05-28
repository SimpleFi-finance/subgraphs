import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
    Account,
    AccountPosition,
    Block,
    Market,
    Position,
    PositionSnapshot,
    Token,
    Transaction
} from "../generated/schema"
import { ERC20 } from "../generated/UniswapV2Factory/ERC20"
import { AccountType, TokenStandard } from "./constants"


export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// TODO implement it after deploying contract to store reinvestment addresses
export function getAccountType(address: Address): string {
    return AccountType.EOA
}

// TODO imlement it. Return price of 1 token in wei
function getPriceInETH(address: string): BigInt {
    return BigInt.fromString("1000000000000000000")
}

export function getOrCreateBlock(ethereumBlock: ethereum.Block): Block {
    let hash = ethereumBlock.hash.toHexString()
    let block = Block.load(hash)
    if (block != null) {
        return block as Block
    }

    block = new Block(hash)
    block.number = ethereumBlock.number
    block.timestamp = ethereumBlock.timestamp
    block.save()
    return block as Block
}

export function getOrCreateAccount(address: Address): Account {
    let addressHex = address.toHexString()
    let account = Account.load(addressHex)
    if (account != null) {
        return account as Account
    }

    account = new Account(addressHex)
    account.type = getAccountType(address)
    account.save()
    return account as Account
}

export function getOrCreateERC20Token(address: Address, block: Block): Token {
    let addressHex = address.toHexString()
    let token = Token.load(addressHex)
    if (token != null) {
        return token as Token
    }

    token = new Token(addressHex)
    token.tokenStandard = TokenStandard.ERC20
    let tokenInstance = ERC20.bind(address)
    let tryName = tokenInstance.try_name()
    if (!tryName.reverted) {
        token.name = tryName.value
    }
    let trySymbol = tokenInstance.try_symbol()
    if (!trySymbol.reverted) {
        token.symbol = trySymbol.value
    }
    let tryDecimals = tokenInstance.try_decimals()
    if (!tryDecimals.reverted) {
        token.decimals = tryDecimals.value
    }
    token.createdAtBlock = block.id
    token.save()
    return token as Token
}

export function getOrCreateMarket(
    address: Address,
    protocolName: string,
    protocolType: string,
    inputTokens: Token[],
    outputToken: Token,
    rewardTokens: Token[],
    block: Block
): Market {
    let addressHex = address.toHexString()
    let market = Market.load(addressHex)
    if (market != null) {
        return market as Market
    }

    market = new Market(addressHex)
    market.account = getOrCreateAccount(address).id
    market.protocolName = protocolName
    market.protocolType = protocolType
    market.inputTokens = inputTokens.map<string>(t => t.id)
    market.outputToken = outputToken.id
    market.rewardTokens = rewardTokens.map<string>(t => t.id)
    market.canBeReinvestedInTo = []
    market.createdAtBlock = block.id
    market.save()
    return market as Market
}

export function getOrCreateOpenPosition(
    account: Account,
    market: Market,
    positionType: string,
    block: Block
): Position {
    let id = account.id.concat("-").concat(market.id).concat("-").concat(positionType)
    let accountPosition = AccountPosition.load(id)
    if (accountPosition == null) {
        accountPosition = new AccountPosition(id)
        accountPosition.save()
    }

    let positionLength = 0
    if (accountPosition.get("positions") != null) {
        positionLength = accountPosition.positions.length
    }

    let pid = accountPosition.id.concat("-").concat((positionLength).toString())
    let lastPosition = Position.load(pid)

    if (lastPosition === null || lastPosition.closed) {
        let newCounter = positionLength + 1
        let newPositionId = id.concat("-").concat(newCounter.toString())
        let position = new Position(newPositionId)
        position.accountPosition = accountPosition.id
        position.account = account.id
        position.market = market.id
        position.positionType = positionType
        position.outputTokenBalance = BigInt.fromI32(0)
        position.outputTokenBalanceInETH = BigInt.fromI32(0)
        position.inputTokenBalances = []
        position.rewardTokenBalances = []
        position.reinvestments = []
        position.roiInEth = BigInt.fromI32(0)
        position.roiPercentageInEth = BigDecimal.fromString("0")
        position.xirrInEth = BigDecimal.fromString("0")
        position.closed = false
        position.createdAtBlock = block.id
        position.updatedAtBlock = block.id
        position.save()
        return position
    }

    return lastPosition as Position
}

class TokenBalance {
    tokenAddress: string
    accountAddress: string
    balance: BigInt

    constructor(tb: string) {
        let parts = tb.split("|")
        this.tokenAddress = parts[0]
        this.accountAddress = parts[1]
        this.balance = BigInt.fromString(parts[2])
    }

    add(b: TokenBalance): void {
        if (this.tokenAddress == b.tokenAddress) {
            this.balance = this.balance.plus(b.balance)
        }
    }

    balanceInEth(): BigInt {
        return this.balance.times(getPriceInETH(this.tokenAddress))
    }

    toString(): string {
        return this.tokenAddress.concat("|").concat(this.accountAddress).concat("|").concat(this.balance.toString()).concat("|").concat(this.balanceInEth().toString())
    }
}

export function encodeToTokenBalance(tokenAddress: string, accountAddress: string, balance: BigInt): string {
    let tokenBalance = new TokenBalance(tokenAddress.concat("|").concat(accountAddress).concat("|").concat(balance.toString()))
    return tokenBalance.toString()
}

function addTokenBalances(a: string[], b: string[]): string[] {
    if (a.length == 0) {
        return b
    }

    if (b.length == 0) {
        return a
    }

    let atbs = a.map<TokenBalance>(v => new TokenBalance(v))
    let btbs = b.map<TokenBalance>(v => new TokenBalance(v))

    let atbsLength = atbs.length
    let btbsLength = btbs.length

    for (let i = 0; i < btbsLength; i = i + 1) {
        let bv = btbs[i]
        for (let j = 0; j < atbsLength; j = j + 1) {
            let av = atbs[j]
            if (bv.tokenAddress == av.tokenAddress) {
                av.add(bv)
            } else {
                atbs.push(bv)
            }
        }
    }

    let sum = atbs.map<string>(v => v.toString())

    return sum
}

function createPostionSnapshot(position: Position, transaction: Transaction): PositionSnapshot {
    let historyLength = 0
    if (position.get("history") != null) {
        historyLength = position.history.length
    }

    let newCounter = historyLength + 1
    let newSnapshot = new PositionSnapshot(position.id.concat("-").concat(newCounter.toString()))
    newSnapshot.position = position.id
    newSnapshot.transaction = transaction.id
    newSnapshot.outputTokenBalance = position.outputTokenBalance
    newSnapshot.outputTokenBalanceInETH = position.outputTokenBalanceInETH
    newSnapshot.inputTokenBalances = position.inputTokenBalances
    newSnapshot.rewardTokenBalances = position.rewardTokenBalances
    newSnapshot.reinvestments = position.reinvestments
    newSnapshot.roiInEth = position.roiInEth
    newSnapshot.roiPercentageInEth = position.roiPercentageInEth
    newSnapshot.xirrInEth = position.xirrInEth
    newSnapshot.save()
    return newSnapshot
}

export function createOrUpdatePosition(
    event: ethereum.Event,
    account: Account,
    market: Market,
    positionType: string,
    outputTokenBalance: BigInt,
    inputTokenBalances: string[],   // JSON string of type TokenBalance
    rewardTokenBalances: string[],  // JSON string of type TokenBalance
    reinvestments: string[],         // JSON string of type TokenBalance
    block: Block
): Position {
    // Create transaction for given event
    let transaction = new Transaction(event.transaction.hash.toHexString())
    transaction.market = market.id
    transaction.from = getOrCreateAccount(event.transaction.from).id
    if (event.transaction.to) {
        transaction.to = getOrCreateAccount(event.transaction.to as Address).id
    }
    transaction.gasUsed = event.transaction.gasUsed
    transaction.gasPrice = event.transaction.gasPrice
    transaction.createdAtBlock = block.id
    transaction.transactionIndexInBlock = event.transaction.index
    transaction.save()

    let position = getOrCreateOpenPosition(account, market, positionType, block)
    let postionSnapshot = createPostionSnapshot(position, transaction)

    // Update input, output, reward and reinvestment token balances for the position
    position.inputTokenBalances = inputTokenBalances
    position.outputTokenBalance = outputTokenBalance
    position.rewardTokenBalances = rewardTokenBalances

    if (reinvestments.length > 0) {
        position.reinvestments = addTokenBalances(position.reinvestments, reinvestments)
        let reinvestmentsTo = reinvestments.map<TokenBalance>(r => new TokenBalance(r)).map<string>(r => r.accountAddress)
        market.canBeReinvestedInTo = market.canBeReinvestedInTo.concat(reinvestmentsTo)
        market.save()
    }

    // Compute new return values for the position
    // roiInEth: BigInt!
    // roiPercentageInEth: BigDecimal!
    // xirrInEth: BigDecimal!

    // Check if postion is closed
    if (position.outputTokenBalance == BigInt.fromI32(0)) {
        position.closed = true
    }

    position.updatedAtBlock = block.id
    position.save()

    return position
}
