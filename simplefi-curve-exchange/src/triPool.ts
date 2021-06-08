import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
    AddLiquidity,
    NewFee,
    RemoveLiquidity,
    RemoveLiquidityImbalance,
    RemoveLiquidityOne,
    TokenExchange
} from "../generated/TriPool/StableSwapPlain3";
import { CurvePoolType, getOrCreatePool } from "./pools";


const coinCount = 3
const lpTokenAddress = Address.fromString("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490")

export function handleBlock(block: ethereum.Block): void {
    let event = new ethereum.Event()
    event.block = block
    if (block.number == BigInt.fromString("10809473")) {
        let poolAddress = Address.fromString("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7")
        getOrCreatePool(event, poolAddress, lpTokenAddress, CurvePoolType.PLAIN, 3)
    }
}

export function handleTokenExchange(event: TokenExchange): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["TokenExchange"])
}

export function handleAddLiquidity(event: AddLiquidity): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["AddLiquidity"])
}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["RemoveLiquidity"])
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["RemoveLiquidityOne"])
}

export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["RemoveLiquidityImbalance"])
}

export function handleNewFee(event: NewFee): void {
    let pool = getOrCreatePool(event, event.address, lpTokenAddress, CurvePoolType.PLAIN, coinCount)
    log.info("handle event {}", ["NewFee"])
}