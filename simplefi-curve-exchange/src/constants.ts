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
  isUsingOldApi: boolean;
  rewardTokens: string[];

  constructor(
    poolAddress: string,
    lpTokenAddress: string,
    coinCount: i32,
    poolType: string,
    isUsingOldApi: boolean,
    rewardTokens: string[]
  ) {
    this.poolAddress = poolAddress;
    this.lpTokenAddress = lpTokenAddress;
    this.coinCount = coinCount;
    this.poolType = poolType;
    this.isUsingOldApi = isUsingOldApi;
    this.rewardTokens = rewardTokens;
  }
}

// use lower case!
export const TRIPOOL_POOL = "0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7";
export const TRIPOOL_LP_TOKEN = "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490";
export const AAVE_POOL = "0xdebf20617708857ebe4f679508e7b7863a8a8eee";
export const AAVE_LP_TOKEN = "0xfd2a8fa60abd58efe3eee34dd494cd491dc14900";
export const Y_POOL = "0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51";
export const Y_LP_TOKEN = "0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8";
export const SUSD_POOL = "0xa5407eae9ba41422680e2e00537571bcc53efbfd";
export const SUSD_LP_TOKEN = "0xc25a3a3b969415c80451098fa907ec722572917f";
export const BUSD_POOL = "0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27";
export const BUSD_LP_TOKEN = "0x3b3ac5386837dc563660fb6a0937dfaa5924333b";
export const PAX_POOL = "0x06364f10b501e868329afbc005b3492902d6c763";
export const PAX_LP_TOKEN = "0xd905e2eaebe188fc92179b6350807d8bd91db0d8";
export const COMPOUND_POOL = "0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56";
export const COMPOUND_LP_TOKEN = "0x845838df265dcd2c412a1dc9e959c7d08537f8a2";
export const IRONBANK_POOL = "0x2dded6da1bf5dbdf597c45fcfaa3194e53ecfeaf";
export const IRONBANK_LP_TOKEN = "0x5282a4ef67d9c33135340fb3289cc1711c13638c";
export const HUSD_POOL = "0x3ef6a01a0f81d6046290f3e2a8c5b843e738e604";
export const HUSD_LP_TOKEN = "0x5b5cfe992adac0c9d48e05854b2d91c73a003858";
export const USDK_POOL = "0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb";
export const USDK_LP_TOKEN = "0x97e2768e8e73511ca874545dc5ff8067eb19b787";
export const MUSD_POOL = "0x8474ddbe98f5aa3179b3b3f5942d724afcdec9f6";
export const MUSD_LP_TOKEN = "0x1aef73d49dedc4b1778d0706583995958dc862e6";
export const USDP_POOL = "0x42d7025938bec20b69cbae5a77421082407f053a";
export const USDP_LP_TOKEN = "0x7eb40e450b9655f4b3cc4259bcc731c63ff55ae6";
export const DUSD_POOL = "0x8038c01a0390a8c547446a0b2c18fc9aefecc10c";
export const DUSD_LP_TOKEN = "0x3a664ab939fd8482048609f652f9a0b0677337b9";
export const RSV_POOL = "0xc18cc39da8b11da8c3541c598ee022258f9744da";
export const RSV_LP_TOKEN = "0xc2ee6b0334c261ed60c72f6054450b61b8f18e35";

export let addressToPool = new TypedMap<string, PoolStaticInfo>();
addressToPool.set(
  TRIPOOL_POOL,
  new PoolStaticInfo(TRIPOOL_POOL, TRIPOOL_LP_TOKEN, 3, "PLAIN", false, [])
);
addressToPool.set(AAVE_POOL, new PoolStaticInfo(AAVE_POOL, AAVE_LP_TOKEN, 3, "LENDING", false, []));
addressToPool.set(Y_POOL, new PoolStaticInfo(Y_POOL, Y_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(SUSD_POOL, new PoolStaticInfo(SUSD_POOL, SUSD_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(BUSD_POOL, new PoolStaticInfo(BUSD_POOL, BUSD_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(PAX_POOL, new PoolStaticInfo(PAX_POOL, PAX_LP_TOKEN, 4, "LENDING", true, []));
addressToPool.set(
  COMPOUND_POOL,
  new PoolStaticInfo(COMPOUND_POOL, COMPOUND_LP_TOKEN, 2, "LENDING", true, [])
);
addressToPool.set(
  IRONBANK_POOL,
  new PoolStaticInfo(IRONBANK_POOL, IRONBANK_LP_TOKEN, 3, "LENDING", false, [])
);
addressToPool.set(HUSD_POOL, new PoolStaticInfo(HUSD_POOL, HUSD_LP_TOKEN, 2, "META", false, []));
addressToPool.set(USDK_POOL, new PoolStaticInfo(USDK_POOL, USDK_LP_TOKEN, 2, "META", false, []));
addressToPool.set(MUSD_POOL, new PoolStaticInfo(MUSD_POOL, MUSD_LP_TOKEN, 2, "META", false, []));
addressToPool.set(USDP_POOL, new PoolStaticInfo(USDP_POOL, USDP_LP_TOKEN, 2, "META", false, []));
addressToPool.set(DUSD_POOL, new PoolStaticInfo(DUSD_POOL, DUSD_LP_TOKEN, 2, "META", false, []));
addressToPool.set(RSV_POOL, new PoolStaticInfo(RSV_POOL, RSV_LP_TOKEN, 2, "META", false, []));

export let lpTokenToPool = new TypedMap<string, string>();
lpTokenToPool.set(TRIPOOL_LP_TOKEN, TRIPOOL_POOL);
lpTokenToPool.set(AAVE_LP_TOKEN, AAVE_POOL);
lpTokenToPool.set(Y_LP_TOKEN, Y_POOL);
lpTokenToPool.set(SUSD_LP_TOKEN, SUSD_POOL);
lpTokenToPool.set(BUSD_LP_TOKEN, BUSD_POOL);
lpTokenToPool.set(PAX_LP_TOKEN, PAX_POOL);
lpTokenToPool.set(COMPOUND_LP_TOKEN, COMPOUND_POOL);
lpTokenToPool.set(IRONBANK_LP_TOKEN, IRONBANK_POOL);
lpTokenToPool.set(HUSD_LP_TOKEN, HUSD_POOL);
lpTokenToPool.set(USDK_LP_TOKEN, USDK_POOL);
lpTokenToPool.set(MUSD_LP_TOKEN, MUSD_POOL);
lpTokenToPool.set(USDP_LP_TOKEN, USDP_POOL);
lpTokenToPool.set(DUSD_LP_TOKEN, DUSD_POOL);
lpTokenToPool.set(RSV_LP_TOKEN, RSV_POOL);
