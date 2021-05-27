import { Pair as PairEntity } from "../generated/schema"
import { UniswapV2Pair } from "../generated/templates"
import {
    PairCreated,
    UniswapV2Factory
} from "../generated/UniswapV2Factory/UniswapV2Factory"
import {
    getOrCreateAccount,
    getOrCreateBlock,
    getOrCreateERC20Token,
    getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"

export function handlePairCreated(event: PairCreated): void {
    let block = getOrCreateBlock(event.block)

    // Create a tokens and market entity
    let token0 = getOrCreateERC20Token(event.params.token0, block)
    let token1 = getOrCreateERC20Token(event.params.token1, block)
    let lpToken = getOrCreateERC20Token(event.params.pair, block)

    let market = getOrCreateMarket(
        event.params.pair,
        ProtocolName.UNISWAP_V2,
        ProtocolType.EXCHANGE,
        [token0, token1],
        lpToken,
        [],
        block
    )

    // create account for factory and fee to
    let factoryAccount = getOrCreateAccount(event.address)
    let factoryInstance = UniswapV2Factory.bind(event.address)
    let feeTo = factoryInstance.feeTo()
    let feeToAccount = getOrCreateAccount(feeTo)

    // Create pair
    let pair = new PairEntity(event.params.pair.toHexString())
    pair.factory = factoryAccount.id
    pair.feeTo = feeToAccount.id
    pair.token0 = token0.id
    pair.token1 = token1.id
    pair.createdAtBlock = block.id
    pair.save()

    // Start listening for market events
    UniswapV2Pair.create(event.params.pair)
}
