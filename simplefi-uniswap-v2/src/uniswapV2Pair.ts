import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
    Burn as BurnEntity,
    Market as MarketEntity,
    Mint as MintEntity,
    Pair as PairEntity,
    PairSnapshot as PairSnapshotEntity
} from "../generated/schema"
import { ERC20 } from "../generated/templates/UniswapV2Pair/ERC20"
import {
    Burn,
    Mint,
    Sync,
    Transfer,
    UniswapV2Pair
} from "../generated/templates/UniswapV2Pair/UniswapV2Pair"
import {
    ADDRESS_ZERO,
    createOrUpdatePosition,
    encodeToTokenBalance,

    getOrCreateAccount,
    getOrCreateBlock
} from "./common"
import { PositionType } from "./constants"


function getOrCreateMint(event: ethereum.Event, pair: PairEntity): MintEntity {
    let mint = MintEntity.load(event.transaction.hash.toHexString())
    if (mint != null) {
        return mint as MintEntity
    }

    mint = new MintEntity(event.transaction.hash.toHexString())
    mint.pair = pair.id
    mint.transferEventApplied = false
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
    burn.burnEventApplied = false
    burn.pair = pair.id
    burn.save()
    return burn as BurnEntity
}

function createOrUpdatePositionOnEvent(
    event: ethereum.Event,
    accountAddress: Address,
    pair: PairEntity,
    liquityAmount: BigInt,
    isTransfer: boolean,
    transferTo: Address
): void {
    let pairAddress = Address.fromString(pair.id)
    let pairInstance = UniswapV2Pair.bind(pairAddress)
    let token0Instance = ERC20.bind(Address.fromString(pair.token0))
    let token1Instance = ERC20.bind(Address.fromString(pair.token1))

    // Get LP token balance
    let lpBalance = pairInstance.balanceOf(accountAddress)
    let totalSupply = pairInstance.totalSupply()

    // Get token0 and token1 balance than can be redeemed for current LP token balance
    let balance0 = token0Instance.balanceOf(pairAddress)
    let balance1 = token1Instance.balanceOf(pairAddress)
    let amount0 = lpBalance.times(balance0).div(totalSupply)
    let amount1 = lpBalance.times(balance1).div(totalSupply)

    let inputTokenBalances: string[] = []
    inputTokenBalances.push(encodeToTokenBalance(pair.token0, accountAddress.toHexString(), amount0))
    inputTokenBalances.push(encodeToTokenBalance(pair.token1, accountAddress.toHexString(), amount1))

    let reinvestments: string[] = []
    if (isTransfer) {
        reinvestments.push(encodeToTokenBalance(pair.id, transferTo.toHexString(), liquityAmount))
    }

    // Create block and account entities
    let block = getOrCreateBlock(event.block)
    let account = getOrCreateAccount(accountAddress)
    let market = MarketEntity.load(pair.id) as MarketEntity

    // Call common position function
    let position = createOrUpdatePosition(
        event,
        account,
        market,
        PositionType.INVESTMENT,
        lpBalance,
        inputTokenBalances,
        [],
        reinvestments,
        block
    )
}

export function handleTransfer(event: Transfer): void {
    let pairAddressHex = event.address.toHexString()
    let fromHex = event.params.from.toHexString()
    let toHex = event.params.to.toHexString()

    let pair = PairEntity.load(pairAddressHex) as PairEntity

    // Skip it's emitted from internal _burn method
    if (fromHex == pairAddressHex && toHex == ADDRESS_ZERO) {
        return
    }

    // Check if transfer it's a mint or burn or transfer transaction
    if (fromHex == ADDRESS_ZERO) {
        if (toHex != ADDRESS_ZERO) {
            let mint = getOrCreateMint(event, pair)
            mint.transferEventApplied = true
            mint.to = getOrCreateAccount(event.params.to).id
            mint.liquityAmount = event.params.value
            mint.save()
            if (mint.mintEventApplied) {
                createOrUpdatePositionOnEvent(event, event.params.to, pair, event.params.value, false, event.params.to)
            }
        }
    } else if (toHex == pairAddressHex) {
        let burn = getOrCreateBurn(event, pair)
        burn.transferEventApplied = true
        burn.liquityAmount = event.params.value
        burn.save()
        if (burn.burnEventApplied) {
            createOrUpdatePositionOnEvent(event, Address.fromString(burn.to), pair, event.params.value, false, event.params.to)
        }
    } else {
        // Handle Transfer from one account to another
        createOrUpdatePositionOnEvent(event, event.params.from, pair, event.params.value, true, event.params.to)
        createOrUpdatePositionOnEvent(event, event.params.to, pair, event.params.value, false, event.params.to)
    }
}

export function handleMint(event: Mint): void {
    let pair = PairEntity.load(event.address.toHexString()) as PairEntity
    let mint = getOrCreateMint(event, pair)
    mint.mintEventApplied = true
    mint.amount0 = event.params.amount0
    mint.amount1 = event.params.amount1
    mint.save()
    let accountAddress = Address.fromString(mint.to)
    if (mint.transferEventApplied) {
        createOrUpdatePositionOnEvent(event, accountAddress, pair, mint.liquityAmount as BigInt, false, accountAddress)
    }
}

export function handleBurn(event: Burn): void {
    let pair = PairEntity.load(event.address.toHexString()) as PairEntity
    let burn = getOrCreateBurn(event, pair)
    burn.burnEventApplied = true
    burn.to = getOrCreateAccount(event.params.to).id
    burn.amount0 = event.params.amount0
    burn.amount1 = event.params.amount1
    burn.save()
    if (burn.transferEventApplied) {
        createOrUpdatePositionOnEvent(event, event.params.to, pair, burn.liquityAmount as BigInt, false, Address.fromString(pair.id))
    }
}

export function handleSync(event: Sync): void {
    let id = event.transaction.hash.toHexString().concat("-").concat(event.logIndex.toHexString())
    let pairSnapshot = PairSnapshotEntity.load(id)
    if (pairSnapshot != null) {
        return
    }

    let pair = PairEntity.load(event.address.toHexString()) as PairEntity

    pairSnapshot = new PairSnapshotEntity(id)
    pairSnapshot.pair = pair.id
    pairSnapshot.reserve0 = pair.reserve0
    pairSnapshot.reserve1 = pair.reserve1
    pairSnapshot.createdAtBlock = getOrCreateBlock(event.block).id
    pairSnapshot.transactionHash = event.transaction.hash.toHexString()
    pairSnapshot.transactionIndexInBlock = event.transaction.index
    pairSnapshot.logIndex = event.logIndex
    pairSnapshot.save()

    pair.reserve0 = event.params.reserve0
    pair.reserve1 = event.params.reserve1
    pair.save()
}
