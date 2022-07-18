import {
  PairCreated, SetFeeToCall
} from "../../generated/UniswapV2Factory/UniswapV2Factory"

import { ProtocolName } from "../constants"
import { handlePairCreated as PairCreatedHandler } from "../uniswapV2Factory"
import { handleSetFeeTo as SetFeeToHandler } from "../uniswapV2Factory"

export function handlePairCreated(event: PairCreated): void {
  PairCreatedHandler(event, ProtocolName.SUSHISWAP)
}

export function handleSetFeeTo(call: SetFeeToCall): void {
  SetFeeToHandler(call)
}