import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
    Account as AccountEntity,
    Burn as BurnEntity,
    Market as MarketEntity,
    Mint as MintEntity,
    Pair as PairEntity,
    PairSnapshot as PairSnapshotEntity
} from "../generated/schema"
import {
    Burn,
    Mint,
    Sync,
    Transfer,
    UniswapV2Pair
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair"
import {
    ADDRESS_ZERO,
    getOrCreateAccount,
    investInMarket,
    redeemFromMarket,
    TokenBalance
} from "./common"


function getOrCreateMint(event: ethereum.Event, pair: PairEntity): MintEntity {
    let mint = MintEntity.load(event.transaction.hash.toHexString())
    if (mint != null) {
        return mint as MintEntity
    }

    mint = new MintEntity(event.transaction.hash.toHexString())
    mint.pair = pair.id
    mint.transferEventApplied = false
    mint.syncEventApplied = false
    mint.mintEventApplied = false
    mint.save()
    return mint as MintEntity
}

function getOrCreateBurn(event: ethereum.Event, pair: PairEntity): BurnEntity {
    let burn = BurnEntity.load(event.transaction.hash.toHexString())
    if (burn != null) {
        return burn as BurnEntity
    }

    burn = new BurnEntity(event.transaction.hash.toHexString())
    burn.transferEventApplied = false
    burn.syncEventApplied = false
    burn.burnEventApplied = false
    burn.pair = pair.id
    burn.save()
    return burn as BurnEntity
}

function createOrUpdatePositionOnMint(event: ethereum.Event, pair: PairEntity, mint: MintEntity): void {
    let isComplete = mint.transferEventApplied && mint.syncEventApplied && mint.mintEventApplied
    if (!isComplete) {
        return
    }

    let accountAddress = Address.fromString(mint.to)
    let pairAddress = Address.fromString(mint.pair)
    let pairInstance = UniswapV2Pair.bind(pairAddress)

    let account = new AccountEntity(mint.to)
    let market = new MarketEntity(mint.pair)

    let outputTokenAmount = mint.liquityAmount as BigInt
    let inputTokenAmounts: TokenBalance[] = []
    inputTokenAmounts.push(new TokenBalance(pair.token0, mint.to, mint.amount0 as BigInt))
    inputTokenAmounts.push(new TokenBalance(pair.token1, mint.to, mint.amount1 as BigInt))

    let outputTokenBalance = pairInstance.balanceOf(accountAddress)
    let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
    let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
    let inputTokenBalances: TokenBalance[] = []
    inputTokenBalances.push(new TokenBalance(pair.token0, mint.to, token0Balance))
    inputTokenBalances.push(new TokenBalance(pair.token1, mint.to, token1Balance))

    investInMarket(
        event,
        account,
        market,
        outputTokenAmount,
        inputTokenAmounts,
        [],
        outputTokenBalance,
        inputTokenBalances,
        []
    )
}

function createOrUpdatePositionOnBurn(event: ethereum.Event, pair: PairEntity, burn: BurnEntity): void {
    let isComplete = burn.transferEventApplied && burn.syncEventApplied && burn.burnEventApplied
    if (!isComplete) {
        return
    }

    let accountAddress = Address.fromString(burn.to)
    let pairAddress = Address.fromString(burn.pair)
    let pairInstance = UniswapV2Pair.bind(pairAddress)

    let account = new AccountEntity(burn.to)
    let market = new MarketEntity(burn.pair)

    let outputTokenAmount = burn.liquityAmount as BigInt
    let inputTokenAmounts: TokenBalance[] = []
    inputTokenAmounts.push(new TokenBalance(pair.token0, burn.to, burn.amount0 as BigInt))
    inputTokenAmounts.push(new TokenBalance(pair.token1, burn.to, burn.amount1 as BigInt))

    let outputTokenBalance = pairInstance.balanceOf(accountAddress)
    let token0Balance = outputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
    let token1Balance = outputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
    let inputTokenBalances: TokenBalance[] = []
    inputTokenBalances.push(new TokenBalance(pair.token0, burn.to, token0Balance))
    inputTokenBalances.push(new TokenBalance(pair.token1, burn.to, token1Balance))

    redeemFromMarket(
        event,
        account,
        market,
        outputTokenAmount,
        inputTokenAmounts,
        [],
        outputTokenBalance,
        inputTokenBalances,
        [],
        null
    )
}

function transferLPToken(event: ethereum.Event, pair: PairEntity, from: Address, to: Address, amount: BigInt): void {
    let pairAddress = Address.fromString(pair.id)
    let pairInstance = UniswapV2Pair.bind(pairAddress)
    let market = new MarketEntity(pair.id)

    let fromAccount = getOrCreateAccount(from)
    let fromOutputTokenBalance = pairInstance.balanceOf(from)
    let fromInputTokenBalances: TokenBalance[] = []
    let fromToken0Balance = fromOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
    let fromToken1Balance = fromOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
    fromInputTokenBalances.push(new TokenBalance(pair.token0, fromAccount.id, fromToken0Balance))
    fromInputTokenBalances.push(new TokenBalance(pair.token1, fromAccount.id, fromToken1Balance))

    redeemFromMarket(
        event,
        fromAccount,
        market,
        amount,
        [],
        [],
        fromOutputTokenBalance,
        fromInputTokenBalances,
        [],
        to.toHexString()
    )

    let toAccount = getOrCreateAccount(to)
    let toOutputTokenBalance = pairInstance.balanceOf(to)
    let toInputTokenBalances: TokenBalance[] = []
    let toToken0Balance = toOutputTokenBalance.times(pair.reserve0).div(pair.totalSupply)
    let toToken1Balance = toOutputTokenBalance.times(pair.reserve1).div(pair.totalSupply)
    toInputTokenBalances.push(new TokenBalance(pair.token0, toAccount.id, toToken0Balance))
    toInputTokenBalances.push(new TokenBalance(pair.token1, toAccount.id, toToken1Balance))

    investInMarket(
        event,
        toAccount,
        market,
        amount,
        [],
        [],
        toOutputTokenBalance,
        toInputTokenBalances,
        []
    )
}

export function handleTransfer(event: Transfer): void {
    let pairAddressHex = event.address.toHexString()
    let fromHex = event.params.from.toHexString()
    let toHex = event.params.to.toHexString()

    let pair = PairEntity.load(pairAddressHex) as PairEntity

    // Check if transfer it's a mint or burn or transfer transaction
    if (fromHex == ADDRESS_ZERO) {
        pair.totalSupply = pair.totalSupply.plus(event.params.value)
        pair.save()

        let mint = getOrCreateMint(event, pair)
        mint.transferEventApplied = true
        mint.to = getOrCreateAccount(event.params.to).id
        mint.liquityAmount = event.params.value
        mint.save()
        createOrUpdatePositionOnMint(event, pair, mint)
    }

    if (toHex == ADDRESS_ZERO) {
        if (fromHex == pairAddressHex) {
            pair.totalSupply = pair.totalSupply.minus(event.params.value)
            pair.save()
        }

        let burn = getOrCreateBurn(event, pair)
        burn.transferEventApplied = true
        burn.liquityAmount = event.params.value
        burn.save()
        createOrUpdatePositionOnBurn(event, pair, burn)
    }

    if (fromHex != ADDRESS_ZERO && fromHex != pairAddressHex && toHex != ADDRESS_ZERO && toHex != pairAddressHex) {
        transferLPToken(event, pair, event.params.from, event.params.to, event.params.value)
    }
}

export function handleMint(event: Mint): void {
    let pair = PairEntity.load(event.address.toHexString()) as PairEntity
    let mint = getOrCreateMint(event, pair)
    mint.mintEventApplied = true
    mint.amount0 = event.params.amount0
    mint.amount1 = event.params.amount1
    mint.save()
    createOrUpdatePositionOnMint(event, pair, mint)
}

export function handleBurn(event: Burn): void {
    let pair = PairEntity.load(event.address.toHexString()) as PairEntity
    let burn = getOrCreateBurn(event, pair)
    burn.burnEventApplied = true
    burn.to = getOrCreateAccount(event.params.to).id
    burn.amount0 = event.params.amount0
    burn.amount1 = event.params.amount1
    burn.save()
    createOrUpdatePositionOnBurn(event, pair, burn)
}

export function handleSync(event: Sync): void {
    let transactionHash = event.transaction.hash.toHexString()
    let id = transactionHash.concat("-").concat(event.logIndex.toHexString())
    let pairSnapshot = PairSnapshotEntity.load(id)
    if (pairSnapshot != null) {
        return
    }

    let pair = PairEntity.load(event.address.toHexString()) as PairEntity

    pairSnapshot = new PairSnapshotEntity(id)
    pairSnapshot.pair = pair.id
    pairSnapshot.reserve0 = pair.reserve0
    pairSnapshot.reserve1 = pair.reserve1
    pairSnapshot.totalSupply = pair.totalSupply
    pairSnapshot.blockNumber = event.block.number
    pairSnapshot.timestamp = event.block.timestamp
    pairSnapshot.transactionHash = event.transaction.hash.toHexString()
    pairSnapshot.transactionIndexInBlock = event.transaction.index
    pairSnapshot.logIndex = event.logIndex
    pairSnapshot.save()

    pair.reserve0 = event.params.reserve0
    pair.reserve1 = event.params.reserve1
    pair.save()

    let possibleMint = MintEntity.load(transactionHash)
    if (possibleMint != null) {
        let mint = possibleMint as MintEntity
        mint.syncEventApplied = true
        mint.save()
        createOrUpdatePositionOnMint(event, pair, mint)
    }

    let possibleBurn = BurnEntity.load(transactionHash)
    if (possibleBurn != null) {
        let burn = possibleBurn as BurnEntity
        burn.syncEventApplied = true
        burn.save()
        createOrUpdatePositionOnBurn(event, pair, burn)
    }
}
