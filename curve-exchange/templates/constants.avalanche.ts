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

//// AVALANCHE

/////////////////////////////////
export let addressToPool = new TypedMap<string, PoolStaticInfo>();
export let lpTokenToPool = new TypedMap<string, string>();

// 3crypto
export const A3CRYPTO_AVALANCHE = "0xb755b949c126c04e0348dd881a5cf55d424742b2";
export const A3CRYPTO_AVALANCHE_LP_TOKEN = "0x1dab6560494b04473a0be3e7d83cf3fdf3a51828";
addressToPool.set(
  A3CRYPTO_AVALANCHE,
  new PoolStaticInfo(A3CRYPTO_AVALANCHE, A3CRYPTO_AVALANCHE_LP_TOKEN, 3, "PLAIN", false, [])
);
lpTokenToPool.set(A3CRYPTO_AVALANCHE_LP_TOKEN, A3CRYPTO_AVALANCHE);

// Ren
export const REN_AVALANCHE = "0x16a7da911a4dd1d83f3ff066fe28f3c792c50d90";
export const REN_AVALANCHE_LP_TOKEN = "0xc2b1df84112619d190193e48148000e3990bf627";
addressToPool.set(
  REN_AVALANCHE,
  new PoolStaticInfo(REN_AVALANCHE, REN_AVALANCHE_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(REN_AVALANCHE_LP_TOKEN, REN_AVALANCHE);

// Aave pool
export const APOOL_AVALANCHE = "0x7f90122bf0700f9e7e1f688fe926940e8839f353";
export const APOOL_AVALANCHE_LP_TOKEN = "0x1337bedc9d22ecbe766df105c9623922a27963ec";
addressToPool.set(
  APOOL_AVALANCHE,
  new PoolStaticInfo(APOOL_AVALANCHE, APOOL_AVALANCHE_LP_TOKEN, 2, "LENDING", false, [])
);
lpTokenToPool.set(APOOL_AVALANCHE_LP_TOKEN, APOOL_AVALANCHE);
