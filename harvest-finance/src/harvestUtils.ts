import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Account,
  FeeRewardForwarder,
  HarvestController,
  PositionInVault,
  ProfitSharingPool,
  Vault,
  RewardPool,
  Token,
  PositionInRewardPool,
  PositionInProfitSharingPool,
} from "../generated/schema";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { RewardPool as RewardPoolContract } from "../generated/templates/RewardPool/RewardPool";
import { ProfitSharingPool as ProfitSharingPoolContract } from "../generated/templates/ProfitSharingPool/ProfitSharingPool";
import { HarvestEthController as ControllerContract } from "../generated/HarvestEthController1/HarvestEthController";
import { FeeRewardForwarder as FeeRewardForwarderContract } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";
import {
  Vault as VaultTemplate,
  FeeRewardForwarder as FeeRewardForwarderTemplate,
  ProfitSharingPool as ProfitSharingPoolTemplate,
  RewardPool as RewardPoolTemplate,
} from "../generated/templates";
import {
  ADDRESS_ZERO,
  getOrCreateERC20Token,
  getOrCreateMarket,
  getOrCreateMarketWithId,
} from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";

/**
 * Create new Vault and Market entities, and start indexing new vault contract.
 * @param block
 * @param vaultAddress
 * @returns
 */
export function getOrCreateVault(event: ethereum.Event, vaultAddress: Address): Vault {
  let vault = Vault.load(vaultAddress.toHexString());
  if (vault != null) {
    return vault as Vault;
  }

  // create Vault entity
  let fAssetToken = VaultContract.bind(vaultAddress);
  vault = new Vault(vaultAddress.toHexString());
  vault.name = fAssetToken.name();
  vault.totalSupply = fAssetToken.totalSupply();
  vault.strategy = fAssetToken.strategy().toHexString();
  vault.underlyingUnit = fAssetToken.underlyingUnit();
  let inputToken = getOrCreateERC20Token(event, fAssetToken.underlying());
  vault.underlyingToken = inputToken.id;
  vault.pricePerShare = fAssetToken.getPricePerFullShare();
  vault.save();

  // create Market entity
  let outputToken = getOrCreateERC20Token(event, vaultAddress);
  let farmToken = getOrCreateERC20Token(event, FARM_TOKEN_ADDRESS);
  getOrCreateMarket(
    event,
    vaultAddress,
    ProtocolName.HARVEST_FINANCE,
    ProtocolType.TOKEN_MANAGEMENT,
    [inputToken],
    outputToken,
    [farmToken]
  );

  // start indexing new vault
  VaultTemplate.create(vaultAddress);

  return vault;
}

/**
 * Create tracker for user's position in a vault.
 * @param user
 * @param vault
 * @returns
 */
export function getOrCreatePositionInVault(user: Account, vault: Vault): PositionInVault {
  let id = user.id + "-" + vault.id;
  let position = PositionInVault.load(id);
  if (position != null) {
    return position as PositionInVault;
  }

  position = new PositionInVault(id);
  position.user = user.id;
  position.vault = vault.id;
  position.fTokenBalance = BigInt.fromI32(0);
  position.save();

  return position;
}

/**
 * Create entity for FeeRewardForwarder and start indexing it.
 * @param forwarderAddress
 * @returns
 */
export function getOrCreateFeeRewardForwarder(
  event: ethereum.Event,
  forwarderAddress: string
): FeeRewardForwarder {
  let forwarder = FeeRewardForwarder.load(forwarderAddress);
  if (forwarder != null) {
    return forwarder as FeeRewardForwarder;
  }

  forwarder = new FeeRewardForwarder(forwarderAddress);

  // get reward pool
  let feeRewarderContract = FeeRewardForwarderContract.bind(Address.fromString(forwarderAddress));
  let profitSharingPoolAddress = feeRewarderContract.profitSharingPool();

  if (profitSharingPoolAddress && profitSharingPoolAddress.toHexString() != ADDRESS_ZERO) {
    let profitSharingPool = getOrCreateProfitSharingPool(
      event,
      profitSharingPoolAddress.toHexString()
    );
    forwarder.profitSharingPool = profitSharingPool.id;
  }
  forwarder.save();

  // start indexing FeeRewardForwarder contract
  FeeRewardForwarderTemplate.create(Address.fromString(forwarderAddress));

  return forwarder;
}

/**
 * Create entity for ProfitSharingPool, create market and start indexing contract
 * @param profitSharingPoolAddress
 * @param rewardToken
 * @returns
 */
export function getOrCreateProfitSharingPool(
  event: ethereum.Event,
  profitSharingPoolAddress: string
): ProfitSharingPool {
  let profitSharingPool = ProfitSharingPool.load(profitSharingPoolAddress);
  if (profitSharingPool != null) {
    return profitSharingPool as ProfitSharingPool;
  }

  let profitSharingPoolContract = ProfitSharingPoolContract.bind(
    Address.fromString(profitSharingPoolAddress)
  );

  profitSharingPool = new ProfitSharingPool(profitSharingPoolAddress);
  let rewardToken = getOrCreateERC20Token(event, profitSharingPoolContract.rewardToken());
  profitSharingPool.rewardToken = rewardToken.id;
  let lpToken = getOrCreateERC20Token(event, profitSharingPoolContract.lpToken());
  profitSharingPool.lpToken = lpToken.id;
  profitSharingPool.totalSupply = profitSharingPoolContract.totalSupply();
  profitSharingPool.save();

  // create market for this profit sharing pool
  let marketId = profitSharingPool.id;
  let marketAddress = Address.fromString(profitSharingPool.id);
  let protocolName = ProtocolName.HARVEST_FINANCE_STAKING_POOL;
  let protocolType = ProtocolType.STAKING;
  let inputTokens: Token[] = [lpToken];
  let outputToken: Token = getOrCreateERC20Token(
    event,
    Address.fromString(profitSharingPoolAddress)
  );
  let rewardTokens: Token[] = [rewardToken];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // start indexing profit sharing pool contract
  ProfitSharingPoolTemplate.create(Address.fromString(profitSharingPoolAddress));

  return profitSharingPool;
}

/**
 * Track user's staking of FARM tokens
 * @param user
 * @param profitSharingPool
 * @returns
 */
export function getOrCreatePositionInProfitSharingPool(
  user: Account,
  profitSharingPool: ProfitSharingPool
): PositionInProfitSharingPool {
  let id = user.id + "-" + profitSharingPool.id;
  let position = PositionInProfitSharingPool.load(id);
  if (position != null) {
    return position as PositionInProfitSharingPool;
  }

  position = new PositionInProfitSharingPool(id);
  position.user = user.id;
  position.profitSharingPool = profitSharingPool.id;
  position.stakedBalance = BigInt.fromI32(0);
  position.save();

  return position;
}

/**
 * Create controller entity and init fee reward forwarder if available
 * @param controllerAddress
 * @returns
 */
export function getOrCreateHarvestController(
  event: ethereum.Event,
  controllerAddress: string
): HarvestController {
  let controller = HarvestController.load(controllerAddress);
  if (controller != null) {
    return controller as HarvestController;
  }

  // create controller entity
  controller = new HarvestController(controllerAddress);
  controller.save();

  // init fee reward forwarder if available
  let controllerContract = ControllerContract.bind(Address.fromString(controllerAddress));
  let feeRewardForwarder = controllerContract.feeRewardForwarder();
  if (feeRewardForwarder && feeRewardForwarder.toHexString() != ADDRESS_ZERO) {
    let forwarder = getOrCreateFeeRewardForwarder(event, feeRewardForwarder.toHexString());
    controller.feeRewardForwarder = forwarder.id;
    controller.save();
  }

  return controller;
}

/**
 * Create RewardPool entity and start indexing it
 * @param block
 * @param rewardPoolAddress
 * @returns
 */
export function getOrCreateRewardPool(
  event: ethereum.Event,
  rewardPoolAddress: string
): RewardPool {
  let rewardPool = RewardPool.load(rewardPoolAddress);
  if (rewardPool != null) {
    return rewardPool as RewardPool;
  }

  let rewardPoolContract = RewardPoolContract.bind(Address.fromString(rewardPoolAddress));

  // create RewardPool entity
  rewardPool = new RewardPool(rewardPoolAddress);
  let rewardToken = getOrCreateERC20Token(event, rewardPoolContract.rewardToken());
  rewardPool.rewardToken = rewardToken.id;
  let lpToken = getOrCreateERC20Token(event, rewardPoolContract.lpToken());
  rewardPool.lpToken = lpToken.id;
  rewardPool.totalSupply = rewardPoolContract.totalSupply();
  rewardPool.save();

  // save reward pool ref to vault
  let vault = getOrCreateVault(event, Address.fromString(rewardPool.lpToken));
  vault.rewardPool = rewardPool.id;
  vault.save();

  // create market for this reward pool
  let marketId = rewardPool.id;
  let marketAddress = Address.fromString(rewardPoolAddress);
  let protocolName = ProtocolName.HARVEST_FINANCE_REWARD_POOL;
  let protocolType = ProtocolType.LP_FARMING;
  let inputTokens: Token[] = [lpToken];
  let outputToken: Token = getOrCreateERC20Token(event, Address.fromString(rewardPoolAddress));
  let rewardTokens: Token[] = [rewardToken];

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    outputToken,
    rewardTokens
  );

  // start indexing reward pool
  RewardPoolTemplate.create(Address.fromString(rewardPoolAddress));

  return rewardPool;
}

/**
 * Track amount of fTokens user staked in RewardPool
 * @param user
 * @param rewardPool
 * @returns
 */
export function getOrCreatePositionInRewardPool(
  user: Account,
  rewardPool: RewardPool
): PositionInRewardPool {
  let id = user.id + "-" + rewardPool.id;
  let position = PositionInRewardPool.load(id);
  if (position != null) {
    return position as PositionInRewardPool;
  }

  position = new PositionInRewardPool(id);
  position.user = user.id;
  position.rewardPool = rewardPool.id;
  position.fTokenBalance = BigInt.fromI32(0);
  position.save();

  return position;
}

/**
 * Helper function to transform call to matching event when it's needed for common functions
 * @param call
 * @returns
 */
export function createFakeEventFromCall(call: ethereum.Call): ethereum.Event {
  let fakeEvent = new ethereum.Event(
    call.to,
    BigInt.fromI32(0),
    BigInt.fromI32(0),
    null,
    call.block,
    call.transaction,
    []
  );

  return fakeEvent;
}
