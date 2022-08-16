import { TypedMap } from "@graphprotocol/graph-ts";

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

//// POLYGON

/////////////////////////////////
export let addressToPool = new TypedMap<string, PoolStaticInfo>();
export let lpTokenToPool = new TypedMap<string, string>();

// use lower case!
export const APOOL_POLYGON = "0x445fe580ef8d70ff569ab36e80c647af338db351";
export const APOOL_POLYGON_LP_TOKEN = "0xe7a24ef0c5e95ffb0f6684b813a78f2a3ad7d171";
export const ATRICRYPTO_POLYGON = "0x751b1e21756bdbc307cbcc5085c042a0e9aaef36";
export const ATRICRYPTO_POLYGON_LP_TOKEN = "0x8096ac61db23291252574d49f036f0f9ed8ab390";
export const RENBTC_POLYGON = "0xc2d95eef97ec6c17551d45e77b590dc1f9117c67";
export const RENBTC_POLYGON_LP_TOKEN = "0xf8a57c1d3b9629b77b6726a042ca48990a84fb49";
export const ATRICRYPTO_2_POLYGON = "0x92577943c7ac4accb35288ab2cc84d75fec330af";
export const ATRICRYPTO_2_POLYGON_LP_TOKEN = "0xbece5d20a8a104c54183cc316c8286e3f00ffc71";
export const ATRICRYPTO_3_POLYGON = "0x92215849c439e1f8612b6646060b4e3e5ef822cc";
export const ATRICRYPTO_3_POLYGON_LP_TOKEN = "0xdad97f7713ae9437fa9249920ec8507e5fbb23d3";
export const EURTUSD_POLYGON = "0xb446bf7b8d6d4276d0c75ec0e3ee8dd7fe15783a";
export const EURTUSD_POLYGON_LP_TOKEN = "0x600743b1d8a96438bd46836fd34977a00293f6aa";
export const EURSUSD_POLYGON = "0x9b3d675fdbe6a0935e8b7d1941bc6f78253549b7";
export const EURSUSD_POLYGON_LP_TOKEN = "0x7bd9757fbac089d60daff1fa6bfe3bc99b0f5735";

addressToPool.set(
  APOOL_POLYGON,
  new PoolStaticInfo(APOOL_POLYGON, APOOL_POLYGON_LP_TOKEN, 3, "LENDING", false, [])
);
addressToPool.set(
  RENBTC_POLYGON,
  new PoolStaticInfo(RENBTC_POLYGON, RENBTC_POLYGON_LP_TOKEN, 2, "PLAIN", false, [])
);
addressToPool.set(
  ATRICRYPTO_POLYGON,
  new PoolStaticInfo(ATRICRYPTO_POLYGON, ATRICRYPTO_POLYGON_LP_TOKEN, 3, "PLAIN", false, [])
);
addressToPool.set(
  ATRICRYPTO_2_POLYGON,
  new PoolStaticInfo(ATRICRYPTO_2_POLYGON, ATRICRYPTO_2_POLYGON_LP_TOKEN, 3, "PLAIN", false, [])
);
addressToPool.set(
  ATRICRYPTO_3_POLYGON,
  new PoolStaticInfo(ATRICRYPTO_3_POLYGON, ATRICRYPTO_3_POLYGON_LP_TOKEN, 3, "PLAIN", false, [])
);
addressToPool.set(
  EURTUSD_POLYGON,
  new PoolStaticInfo(EURTUSD_POLYGON, EURTUSD_POLYGON_LP_TOKEN, 2, "PLAIN", false, [])
);
addressToPool.set(
  EURSUSD_POLYGON,
  new PoolStaticInfo(EURSUSD_POLYGON, EURSUSD_POLYGON_LP_TOKEN, 2, "PLAIN", false, [])
);

// POLYGON
lpTokenToPool.set(APOOL_POLYGON_LP_TOKEN, APOOL_POLYGON);
lpTokenToPool.set(RENBTC_POLYGON_LP_TOKEN, RENBTC_POLYGON);
lpTokenToPool.set(ATRICRYPTO_POLYGON_LP_TOKEN, ATRICRYPTO_POLYGON);
lpTokenToPool.set(ATRICRYPTO_2_POLYGON_LP_TOKEN, ATRICRYPTO_2_POLYGON);
lpTokenToPool.set(ATRICRYPTO_3_POLYGON_LP_TOKEN, ATRICRYPTO_3_POLYGON);
lpTokenToPool.set(EURTUSD_POLYGON_LP_TOKEN, EURTUSD_POLYGON);
lpTokenToPool.set(EURSUSD_POLYGON_LP_TOKEN, EURSUSD_POLYGON);
