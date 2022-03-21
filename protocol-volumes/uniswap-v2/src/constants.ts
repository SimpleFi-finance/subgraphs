import { BigInt, TypedMap } from "@graphprotocol/graph-ts";

export namespace Blockchain {
  export const ETHEREUM = "ETHEREUM";
  export const BSC = "BSC";
  export const XDAI = "XDAI";
  export const POLYGON = "POLYGON";
  export const OPTIMISM = "OPTIMISM";
  export const AVALANCHE = "AVALANCE";
  export const NEAR = "NEAR";
}

export namespace TokenStandard {
  export const ERC20 = "ERC20";
  export const ERC721 = "ERC721";
  export const ERC1155 = "ERC1155";
}

export namespace ProtocolName {
  export const UNISWAP_V2 = "UNISWAP_V2";
  export const SUSHISWAP = "SUSHISWAP";
  export const QUICKSWAP = "QUICKSWAP";
  export const TRISOLARIS = "TRISOLARIS";
  export const PANCAKESWAP = "PANCAKESWAP";
  export const APESWAP = "APESWAP";
  export const BISWAP = "BISWAP";
  export const COMETH = "COMETH";
  export const PANGOLIN = "PANGOLIN";
  export const TRADER_JOE = "TRADER_JOE";
  export const WANNASWAP = "WANNASWAP";
}

export namespace ProtocolType {
  export const STAKING = "STAKING";
  export const LENDING = "LENDING";
  export const EXCHANGE = "EXCHANGE";
  export const INSURANCE = "INSURANCE";
  export const STABLECOIN = "STABLECOIN";
  export const DERIVATIVE = "DERIVATIVE";
  export const SYNTHETIC_TOKEN = "SYNTHETIC_TOKEN";
  export const TOKEN_MANAGEMENT = "TOKEN_MANAGEMENT";
  export const PREDICTION_MARKET = "PREDICTION_MARKET";
}

export namespace PositionType {
  export const INVESTMENT = "INVESTMENT";
  export const DEBT = "DEBT";
}

export namespace TransactionType {
  export const INVEST = "INVEST";
  export const REDEEM = "REDEEM";
  export const BORROW = "BORROW";
  export const REPAY = "REPAY";
  export const TRANSFER_IN = "TRANSFER_IN";
  export const TRANSFER_OUT = "TRANSFER_OUT";
}

export const APESWAP_BSC_FACTORY = "0x0841bd0b734e4f5853f0dd8d7ea041c241fb0da6";
export const APESWAP_POLYGON_FACTORY = "0xcf083be4164828f00cae704ec15a36d711491284";
export const AURORASWAP_AURORA_FACTORY = "0xc5e1daec2ad401ebebdd3e32516d90ab251a3aa3";
export const BISWAP_BSC_FACTORY = "0x858e3312ed3a876947ea49d572a7c42de08af7ee";
export const COMETH_POLYGON_FACTORY = "0x800b052609c355ca8103e06f022aa30647ead60a";
export const PANCAKESWAP_BSC_FACTORY = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
export const PANGOLIN_AVALANCHE_FACTORY = "0xefa94de7a4656d787667c749f7e1223d71e9fd88";
export const QUICKSWAP_POLYOGON_FACTORY = "0x5757371414417b8c6caad45baef941abc7d3ab32";
export const SUSHISWAP_ARBITRUM_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_AVALANCHE_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_BSC_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_CELO_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_FANTOM_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_MAINNET_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac";
export const SUSHISWAP_POLYGON_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const SUSHISWAP_XDAI_FACTORY = "0xc35dadb65012ec5796536bd9864ed8773abc74c4";
export const TRADER_JOE_AVALANCHE_FACTORY = "0x9ad6c38be94206ca50bb0d90783181662f0cfa10";
export const TRISOLARIS_AURORA_FACTORY = "0xc66f594268041db60507f00703b152492fb176e7";
export const UNISWAP_V2_MAINNET_FACTORY = "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f";
export const WANNASWAP_AURORA_FACTORY = "0x7928d4fea7b2c90c732c10aff59cf403f0c38246";

// 0.1%
const FEE_1_BASE_POINTS = BigInt.fromI32(1);
// 0.2%
const FEE_2_BASE_POINTS = BigInt.fromI32(2);
// 0.3%
const FEE_3_BASE_POINTS = BigInt.fromI32(3);
// denominator
export const FEE_DENOMINATOR = BigInt.fromI32(1000);

// populate map
export let protocolToFee = new TypedMap<string, BigInt>();
protocolToFee.set(APESWAP_BSC_FACTORY, FEE_2_BASE_POINTS);
protocolToFee.set(APESWAP_POLYGON_FACTORY, FEE_2_BASE_POINTS);
protocolToFee.set(AURORASWAP_AURORA_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(BISWAP_BSC_FACTORY, FEE_1_BASE_POINTS);
protocolToFee.set(COMETH_POLYGON_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(PANCAKESWAP_BSC_FACTORY, FEE_2_BASE_POINTS);
protocolToFee.set(PANGOLIN_AVALANCHE_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(QUICKSWAP_POLYOGON_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_ARBITRUM_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_AVALANCHE_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_BSC_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_CELO_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_FANTOM_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_MAINNET_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_POLYGON_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(SUSHISWAP_XDAI_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(TRADER_JOE_AVALANCHE_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(TRISOLARIS_AURORA_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(UNISWAP_V2_MAINNET_FACTORY, FEE_3_BASE_POINTS);
protocolToFee.set(WANNASWAP_AURORA_FACTORY, FEE_2_BASE_POINTS);
