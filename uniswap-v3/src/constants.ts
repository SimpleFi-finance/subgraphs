import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

export namespace Blockchain {
  export const ETHEREUM = "ETHEREUM"
  export const BSC = "BSC"
  export const XDAI = "XDAI"
  export const POLYGON = "POLYGON"
  export const OPTIMISM = "OPTIMISM"
  export const AVALANCHE = "AVALANCE"
  export const NEAR = "NEAR"
}

export namespace TokenStandard {
  export const ERC20 = "ERC20"
  export const ERC721 = "ERC721"
  export const ERC1155 = "ERC1155"
}

export namespace ProtocolName {
  export const UNISWAP_V2 = "UNISWAP_V2"
  export const UNISWAP_V3 = "UNISWAP_V3"
}

export namespace ProtocolType {
  export const STAKING = "STAKING"
  export const LENDING = "LENDING"
  export const EXCHANGE = "EXCHANGE"
  export const INSURANCE = "INSURANCE"
  export const STABLECOIN = "STABLECOIN"
  export const DERIVATIVE = "DERIVATIVE"
  export const SYNTHETIC_TOKEN = "SYNTHETIC_TOKEN"
  export const TOKEN_MANAGEMENT = "TOKEN_MANAGEMENT"
  export const PREDICTION_MARKET = "PREDICTION_MARKET"
}

export namespace PositionType {
  export const INVESTMENT = "INVESTMENT"
  export const DEBT = "DEBT"
}

export namespace TransactionType {
  export const INVEST = "INVEST"
  export const REDEEM = "REDEEM"
  export const BORROW = "BORROW"
  export const REPAY = "REPAY"
  export const TRANSFER_IN = "TRANSFER_IN"
  export const TRANSFER_OUT = "TRANSFER_OUT"
}

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

// Uniswap V3 specifics

import {
  UniswapV3Factory
} from "../generated/templates/UniswapV3Pool/UniswapV3Factory"

// @todo: How to make this constant multichain (low priority: atm it's the same on L2s/sidechains)
export const FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"
export let factoryContract = UniswapV3Factory.bind(Address.fromString(FACTORY_ADDRESS))
