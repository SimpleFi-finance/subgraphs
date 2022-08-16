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

//// OPTIMISM

/////////////////////////////////
export let addressToPool = new TypedMap<string, PoolStaticInfo>();
export let lpTokenToPool = new TypedMap<string, string>();

// 3pool
export const TRI_POOL_OPTIMISM = "0x1337bedc9d22ecbe766df105c9623922a27963ec";
export const TRI_OPTIMISM_LP_TOKEN = "0x1337bedc9d22ecbe766df105c9623922a27963ec";
addressToPool.set(
  TRI_POOL_OPTIMISM,
  new PoolStaticInfo(TRI_POOL_OPTIMISM, TRI_OPTIMISM_LP_TOKEN, 3, "PLAIN", false, [])
);
lpTokenToPool.set(TRI_OPTIMISM_LP_TOKEN, TRI_POOL_OPTIMISM);

// SUSD
export const SUSD_OPTIMISM = "0x061b87122ed14b9526a813209c8a59a633257bab";
export const SUSD_OPTIMISM_LP_TOKEN = "0x061b87122ed14b9526a813209c8a59a633257bab";
addressToPool.set(
  SUSD_OPTIMISM,
  new PoolStaticInfo(SUSD_OPTIMISM, SUSD_OPTIMISM_LP_TOKEN, 2, "META", false, [])
);
lpTokenToPool.set(SUSD_OPTIMISM_LP_TOKEN, SUSD_OPTIMISM);
