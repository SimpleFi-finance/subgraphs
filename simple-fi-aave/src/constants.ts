import { Address, BigInt } from '@graphprotocol/graph-ts'

export let RAY = BigInt.fromI32(10).pow(27)
export let WAD = BigInt.fromI32(10).pow(18)

export const LEND = 'LEND'

export const AAVE = 'AAVE'
export const DERIVATIVE = 'DERIVATIVE'
export const RESERVE = 'RESERVE'

export let USDC_ADDRESS = Address.fromString(
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
)
