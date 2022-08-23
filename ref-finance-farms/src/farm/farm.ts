import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Farm, FarmerReward, FarmerRPS, FarmerSeed, FarmSeed, Market, RefFarmAccount, SimpleFarm, Token } from "../../generated/schema";
import { getOrCreateAccount, getOrCreateMarket, getOrCreateNEP141Token, investInMarket, parseNullableJSONAtrribute, TokenBalance, updateMarket } from "../common";
import { ProtocolName, ProtocolType } from "../constants";
import { parseSeedId, toNanoSec, toSec } from "./util";

const ZERO = BigInt.fromI32(0);
const MIN_SEED_DEPOSIT = BigInt.fromString("1000000000000000000");
const DENOM = BigInt.fromString("1000000000000000000000000");

class SimpleFarmRewardDistribution {
  undistributed: BigInt
  unclaimed: BigInt
  rps: BigInt
  rr: BigInt

  constructor(
    undistributed: BigInt,
    unclaimed: BigInt,
    rps: BigInt,
    rr: BigInt,
  ) {
    this.undistributed = undistributed;
    this.unclaimed = unclaimed;
    this.rps = rps;
    this.rr = rr;
  }
}

/**
pub fn new(owner_id: ValidAccountId) -> Self
*/
export function initFarm(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const ownerId = (args.get("owner_id") as JSONValue).toString();

  const refFarmAccount = new RefFarmAccount(receipt.receiverId);
  refFarmAccount.ownerId = ownerId;
  refFarmAccount.farmCount = BigInt.fromI32(0);
  refFarmAccount.save();
}

/**
pub fn create_simple_farm(&mut self, terms: HRSimpleFarmTerms, min_deposit: Option<U128>) -> FarmId
 */
export function createSimpleFarm(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const terms = (args.get("terms") as JSONValue).toObject();
  const minDepositOpt: BigInt | null = parseNullableJSONAtrribute<BigInt>(
    args,
    "min_deposit",
    (jv) => BigInt.fromString(jv.toString())
  );
  let minDeposit: BigInt = MIN_SEED_DEPOSIT;
  if (minDepositOpt) {
    minDeposit = minDepositOpt;
  }

  // Parse terms attributes
  const seedId = (args.get("seed_id") as JSONValue).toString();
  const rewardToken = (args.get("reward_token") as JSONValue).toString();
  const startAt = (args.get("start_at") as JSONValue).toBigInt();
  const rewardPerSession = BigInt.fromString((args.get("reward_per_session") as JSONValue).toString());
  const sessionInterval = (args.get("session_interval") as JSONValue).toBigInt();

  const returnBytes = outcome.status.toValue();
  const farmId = json.fromBytes(returnBytes).toString();

  // Get or create farm seed
  const parsedSeed = parseSeedId(seedId);
  const seedType = parsedSeed[0] == parsedSeed[1] ? "FT" : "MFT";
  const farmSeedOpt = FarmSeed.load(seedId);
  let farmSeed: FarmSeed;
  if (farmSeedOpt) {
    farmSeed = farmSeedOpt;
  } else {
    farmSeed = new FarmSeed(seedId);
    farmSeed.seedType = seedType;
    farmSeed.farms = [];
    farmSeed.amount = ZERO;
    farmSeed.minDeposit = minDeposit;
    farmSeed.nextIndex = ZERO;
    farmSeed.save();
  }

  const seedFarms = farmSeed.farms;
  seedFarms.push(farmId);

  farmSeed.farms = seedFarms;
  farmSeed.nextIndex = farmSeed.nextIndex.plus(BigInt.fromI32(1));
  farmSeed.save();

  // Save farm
  const farm = new Farm(farmId);
  farm.farmType = "SIMPLE_FARM";
  farm.receiptId = receipt.id;
  farm.save();

  const simpleFarm = new SimpleFarm(farmId);
  simpleFarm.seedId = seedId;
  simpleFarm.reardToken = rewardToken;
  simpleFarm.startAt = startAt;
  simpleFarm.rewardPerSession = rewardPerSession;
  simpleFarm.sessionInterval = sessionInterval;

  simpleFarm.undistributed = ZERO;
  simpleFarm.unclaimed = ZERO;
  simpleFarm.rps = ZERO;
  simpleFarm.rr = ZERO;

  simpleFarm.amountOfReward = ZERO;
  simpleFarm.amountOfClaimed = ZERO;
  simpleFarm.amountOfBeneficiary = ZERO;
  simpleFarm.status = "CREATED";

  simpleFarm.save();

  // Create market entity
  const inputTokens: Token[] = [];
  const iToken = getOrCreateNEP141Token(block, seedId);
  inputTokens.push(iToken);

  const rewardTokens: Token[] = [];
  const rToken = getOrCreateNEP141Token(block, rewardToken);
  rewardTokens.push(rToken);

  getOrCreateMarket(
    block,
    farmId,
    ProtocolName.REF_FINANCE,
    ProtocolType.STAKING,
    inputTokens,
    null,
    rewardTokens
  );
}

export function addRewardToSimpleFarm(farmId: string, amount: BigInt, blockTimestamp: BigInt): void {
  const simpleFarm = SimpleFarm.load(farmId) as SimpleFarm;
  
  if (simpleFarm.status == "CREATED") {
    simpleFarm.status = "RUNNING";
    if (simpleFarm.startAt == BigInt.fromI32(0)) {
      simpleFarm.startAt = toSec(blockTimestamp);
    }
    simpleFarm.amountOfReward = simpleFarm.amountOfReward.plus(amount);
    simpleFarm.undistributed = simpleFarm.undistributed.plus(amount);
    simpleFarm.save();
  } else if (simpleFarm.status == "RUNNING") {
    const sfrd = tryDistribute(simpleFarm, DENOM, blockTimestamp);
    if (sfrd != null && sfrd.undistributed == BigInt.fromI32(0)) {
      return;
    }

    simpleFarm.amountOfReward = simpleFarm.amountOfReward.plus(amount);
    simpleFarm.undistributed = simpleFarm.undistributed.plus(amount);
    simpleFarm.save();
  }
}

export function depositSeedSimpleFarm(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block,
  seedId: string, 
  senderId: string, 
  amount: BigInt, 
  seedType: string
): void {
  const farmSeed = FarmSeed.load(seedId) as FarmSeed;

  const claimed: BigInt[] = claimUserRewardsBySeedId(farmSeed, senderId, block);

  farmSeed.seedType = seedType;
  farmSeed.amount = farmSeed.amount.plus(amount);
  farmSeed.save();

  const farmerSeed = getOrCreateFarmerSeed(senderId, seedId);
  farmerSeed.amount = farmerSeed.amount.plus(amount);
  farmerSeed.save();

  // Update market and position entities
  const farms = farmSeed.farms;
  const length = farms.length;

  for (let i=0; i < length; i++) {
    const simpleFarm = SimpleFarm.load(farms[i]) as SimpleFarm;
    const market = Market.load(simpleFarm.id) as Market;
    
    const marketInputTokenBalances: TokenBalance[] = [];
    marketInputTokenBalances.push(new TokenBalance(seedId, simpleFarm.id, farmSeed.amount));
    updateMarket(
      receipt,
      block,
      market,
      marketInputTokenBalances,
      farmSeed.amount
    );

    const account = getOrCreateAccount(senderId);
    const inputTokenAmounts: TokenBalance[] = [];
    const rewardTokenAmounts: TokenBalance[] = [];
    const inputTokenBalances: TokenBalance[] = [];
    const rewardTokenBalances: TokenBalance[] = [];
    inputTokenAmounts.push(new TokenBalance(seedId, simpleFarm.id, amount));
    rewardTokenAmounts.push(new TokenBalance(simpleFarm.reardToken, senderId, claimed[i]));
    inputTokenBalances.push(new TokenBalance(seedId, simpleFarm.id, farmerSeed.amount));
    rewardTokenBalances.push(new TokenBalance(simpleFarm.reardToken, senderId, ZERO));
    
    investInMarket(
      receipt,
      outcome,
      block,
      account,
      market,
      amount,
      inputTokenAmounts,
      rewardTokenAmounts,
      farmerSeed.amount,
      inputTokenBalances,
      rewardTokenBalances,
      null
    );
  }
}

function tryDistribute(simpleFarm: SimpleFarm, totalSeeds: BigInt, blockTimestamp: BigInt): SimpleFarmRewardDistribution | null {
  if (simpleFarm.status != "RUNNING") {
    return null;
  }

  if (blockTimestamp < toNanoSec(simpleFarm.startAt)) {
    return null;
  }

  let rr = toSec(blockTimestamp).minus(simpleFarm.startAt).div(simpleFarm.sessionInterval);
  let rewardAdded = simpleFarm.rr.minus(rr).times(simpleFarm.rewardPerSession);

  if (simpleFarm.undistributed < rewardAdded) {
    rewardAdded = simpleFarm.undistributed;
    const incread_rr = rewardAdded.div(simpleFarm.rewardPerSession);
    rr = simpleFarm.rr.plus(incread_rr);
    const rewardCalculated = incread_rr.times(simpleFarm.rewardPerSession);
    if (rewardCalculated.lt(rewardAdded)) {
      rr = rr.plus(BigInt.fromI32(1));
    }
  }
  let unclaimed = simpleFarm.unclaimed.plus(rewardAdded);
  let undistributed = simpleFarm.undistributed.minus(rewardAdded);

  // calculated RPS
  let rps = BigInt.fromI32(0);
  if (totalSeeds > BigInt.fromI32(0)) {
    rps = simpleFarm.rps.plus(rewardAdded).times(DENOM).div(totalSeeds);
  }

  return new SimpleFarmRewardDistribution(
    undistributed,
    unclaimed,
    rps,
    rr
  );
}

function distribute(simpleFarm: SimpleFarm, totalSeeds: BigInt, blockTimestamp: BigInt): SimpleFarm {
  const simpleFarmRewardDistribution = tryDistribute(simpleFarm, totalSeeds, blockTimestamp);
  if (simpleFarmRewardDistribution == null) {
    return simpleFarm;
  }

  if (simpleFarm.rr != simpleFarmRewardDistribution.rr) {
    simpleFarm.unclaimed = simpleFarmRewardDistribution.unclaimed;
    simpleFarm.undistributed = simpleFarmRewardDistribution.undistributed;
    simpleFarm.rps = simpleFarmRewardDistribution.rps;
    simpleFarm.rr = simpleFarmRewardDistribution.rr;

    if (totalSeeds == ZERO) {
      simpleFarm.amountOfClaimed = simpleFarm.amountOfClaimed.plus(simpleFarm.unclaimed);
      simpleFarm.amountOfBeneficiary = simpleFarm.amountOfBeneficiary.plus(simpleFarm.unclaimed);
      simpleFarm.unclaimed = ZERO;
    }
  }

  if (simpleFarm.undistributed == ZERO) {
    simpleFarm.status = "ENDED";
  }

  simpleFarm.save();
  return simpleFarm;
}

function claimUserRewardsBySeedId(
  farmSeed: FarmSeed, 
  senderId: string,
  block: near.Block
): BigInt[] {
  const farms = farmSeed.farms;
  const length = farms.length;
  const claimed: BigInt[] = []

  for (let i=0; i < length; i++) {
    const simpleFarm = SimpleFarm.load(farms[i]) as SimpleFarm;
    const farmClaimed = claimUserRewardFromSimpleFarm(
      simpleFarm,
      farmSeed.amount,
      senderId,
      block
    )
    claimed.push(farmClaimed);
  }

  return claimed;
}

function claimUserRewardFromSimpleFarm(
  simpleFarm: SimpleFarm,
  totalSeeds: BigInt,
  farmerId: string,
  block: near.Block
): BigInt {
  // Distribute reward for the farm
  simpleFarm = distribute(simpleFarm, totalSeeds, BigInt.fromU64(block.header.timestampNanosec));
  const farmerSeed = getOrCreateFarmerSeed(farmerId, simpleFarm.seedId);
  const farmerRPS = getOrCreateFarmerRPS(farmerId, simpleFarm.id);
  const farmerReward = getOrCreateFarmerReward(farmerId, simpleFarm.reardToken);

  const claimed = farmerSeed.amount.times(simpleFarm.rps).minus(farmerRPS.rps).div(DENOM);

  if (claimed > ZERO) {
    simpleFarm.unclaimed = simpleFarm.unclaimed.minus(claimed);
    simpleFarm.amountOfClaimed = simpleFarm.amountOfClaimed.plus(claimed);
  }
  simpleFarm.save();

  // update farmer RPS and reward
  farmerRPS.rps = simpleFarm.rps;
  farmerRPS.save();

  farmerReward.amount = farmerReward.amount.plus(claimed);
  farmerReward.save();

  return claimed;
}

function getOrCreateFarmerSeed(userId: string, seedId: string): FarmerSeed {
  const id = userId.concat("|").concat(seedId);
  let farmerSeed = FarmerSeed.load(id);
  if (farmerSeed != null) {
    return farmerSeed;
  }

  farmerSeed = new FarmerSeed(id);
  farmerSeed.amount = ZERO;
  farmerSeed.save();
  return farmerSeed;
}

function getOrCreateFarmerRPS(userId: string, farmId: string): FarmerRPS {
  const id = userId.concat("|").concat(farmId);
  let farmerRPS = FarmerRPS.load(id);
  if (farmerRPS != null) {
    return farmerRPS;
  }

  farmerRPS = new FarmerRPS(id);
  farmerRPS.rps = ZERO;
  farmerRPS.save();
  return farmerRPS;
}

function getOrCreateFarmerReward(userId: string, rewardTokenId: string): FarmerReward {
  const id = userId.concat("|").concat(rewardTokenId);
  let farmerReward = FarmerReward.load(id);
  if (farmerReward != null) {
    return farmerReward;
  }

  farmerReward = new FarmerReward(id);
  farmerReward.amount = ZERO;
  farmerReward.save();
  return farmerReward;
}