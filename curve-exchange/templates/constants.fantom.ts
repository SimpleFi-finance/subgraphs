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

//// FANTOM

/////////////////////////////////
export let addressToPool = new TypedMap<string, PoolStaticInfo>();
export let lpTokenToPool = new TypedMap<string, string>();

// 2 pool
export const A2POOL_FANTOM = "0x27e611fd27b276acbd5ffd632e5eaebec9761e40";
export const A2POOL_FANTOM_LP_TOKEN = "0x27e611fd27b276acbd5ffd632e5eaebec9761e40";
addressToPool.set(
  A2POOL_FANTOM,
  new PoolStaticInfo(A2POOL_FANTOM, A2POOL_FANTOM_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(A2POOL_FANTOM_LP_TOKEN, A2POOL_FANTOM);

// fUSTD
export const FUSDT_FANTOM = "0x92d5ebf3593a92888c25c0abef126583d4b5312e";
export const FUSDT_FANTOM_LP_TOKEN = "0x92d5ebf3593a92888c25c0abef126583d4b5312e";
addressToPool.set(
  FUSDT_FANTOM,
  new PoolStaticInfo(FUSDT_FANTOM, FUSDT_FANTOM_LP_TOKEN, 2, "META", false, [])
);
lpTokenToPool.set(FUSDT_FANTOM_LP_TOKEN, FUSDT_FANTOM);

// REN
export const REN_FANTOM = "0x3ef6a01a0f81d6046290f3e2a8c5b843e738e604";
export const REN_FANTOM_LP_TOKEN = "0x5b5cfe992adac0c9d48e05854b2d91c73a003858";
addressToPool.set(
  REN_FANTOM,
  new PoolStaticInfo(REN_FANTOM, REN_FANTOM_LP_TOKEN, 2, "PLAIN", false, [])
);
lpTokenToPool.set(REN_FANTOM_LP_TOKEN, REN_FANTOM);

// 3 crypto
export const TRI_FANTOM = "0x3a1659ddcf2339be3aea159ca010979fb49155ff";
export const TRI_FANTOM_LP_TOKEN = "0x58e57ca18b7a47112b877e31929798cd3d703b0f";
addressToPool.set(
  TRI_FANTOM,
  new PoolStaticInfo(TRI_FANTOM, TRI_FANTOM_LP_TOKEN, 3, "PLAIN", false, [])
);
lpTokenToPool.set(TRI_FANTOM_LP_TOKEN, TRI_FANTOM);

// Iron Bank
export const IB_FANTOM = "0x4fc8d635c3cb1d0aa123859e2b2587d0ff2707b1";
export const IB_FANTOM_LP_TOKEN = "0xdf38ec60c0ec001142a33eaa039e49e9b84e64ed";
addressToPool.set(
  IB_FANTOM,
  new PoolStaticInfo(IB_FANTOM, IB_FANTOM_LP_TOKEN, 3, "LENDING", false, [])
);
lpTokenToPool.set(IB_FANTOM_LP_TOKEN, IB_FANTOM);

// Gesit
export const GEIST_FANTOM = "0x0fa949783947bf6c1b171db13aeacbb488845b3f";
export const GEIST_FANTOM_LP_TOKEN = "0xd02a30d33153877bc20e5721ee53dedee0422b2f";
addressToPool.set(
  IB_FANTOM,
  new PoolStaticInfo(IB_FANTOM, IB_FANTOM_LP_TOKEN, 3, "LENDING", false, [])
);
lpTokenToPool.set(IB_FANTOM_LP_TOKEN, IB_FANTOM);
