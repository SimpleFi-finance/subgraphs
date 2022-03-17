import { TypedMap } from "@graphprotocol/graph-ts";

export namespace Blockchain {
  export const ETHEREUM = "ETHEREUM";
  export const BSC = "BSC";
  export const XDAI = "XDAI";
  export const ARBITRUM = "ARBITRUM";
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
  export const CURVE_POOL = "CURVE_POOL";
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

// for some contracts it's not possible to get LP token address or coin count
// from pool contract, so static mapping is defined here
export class PoolStaticInfo {
  poolAddress: string;
  lpTokenAddress: string;
  coinCount: i32;
  poolType: string;
  is_v1: boolean;
  rewardTokens: string[];

  constructor(
    poolAddress: string,
    lpTokenAddress: string,
    coinCount: i32,
    poolType: string,
    is_v1: boolean,
    rewardTokens: string[]
  ) {
    this.poolAddress = poolAddress;
    this.lpTokenAddress = lpTokenAddress;
    this.coinCount = coinCount;
    this.poolType = poolType;
    this.is_v1 = is_v1;
    this.rewardTokens = rewardTokens;
  }
}

/////////////////////////////////

//// ARBITRUM

/////////////////////////////////
export let addressToPool = new TypedMap<string, PoolStaticInfo>();
export let lpTokenToPool = new TypedMap<string, string>();

// 2pool
export const A2POOL_ARBITRUM = "0x7f90122bf0700f9e7e1f688fe926940e8839f353";
export const A2POOL_ARBITRUM_LP_TOKEN = "0x7f90122bf0700f9e7e1f688fe926940e8839f353";
addressToPool.set(
  A2POOL_ARBITRUM,
  new PoolStaticInfo(A2POOL_ARBITRUM, A2POOL_ARBITRUM_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(A2POOL_ARBITRUM_LP_TOKEN, A2POOL_ARBITRUM);

// 3pool
export const TRICRPYTO_ARBITRUM = "0x960ea3e3c7fb317332d990873d354e18d7645590";
export const TRICRPYTO_ARBITRUM_LP_TOKEN = "0x8e0b8c8bb9db49a46697f3a5bb8a308e744821d2";
addressToPool.set(
  TRICRPYTO_ARBITRUM,
  new PoolStaticInfo(TRICRPYTO_ARBITRUM, TRICRPYTO_ARBITRUM_LP_TOKEN, 3, "PLAIN", false, [])
);
lpTokenToPool.set(TRICRPYTO_ARBITRUM_LP_TOKEN, TRICRPYTO_ARBITRUM);

// renBTC
export const REN_ARBITRUM = "0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb";
export const REN_ARBITRUM_LP_TOKEN = "0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb";
addressToPool.set(
  REN_ARBITRUM,
  new PoolStaticInfo(REN_ARBITRUM, REN_ARBITRUM_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(REN_ARBITRUM_LP_TOKEN, REN_ARBITRUM);

// eur-susd
export const EURSUSD_ARBITRUM = "0xa827a652ead76c6b0b3d19dba05452e06e25c27e";
export const EURSUSD_ARBITRUM_LP_TOKEN = "0x3dfe1324a0ee9d86337d06aeb829deb4528db9ca";
addressToPool.set(
  EURSUSD_ARBITRUM,
  new PoolStaticInfo(EURSUSD_ARBITRUM, EURSUSD_ARBITRUM_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(EURSUSD_ARBITRUM_LP_TOKEN, EURSUSD_ARBITRUM);
