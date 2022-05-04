import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  Account,
  FeeRewardForwarder,
  HarvestController,
  PositionInVault,
  RewardPool,
  Vault,
} from "../generated/schema";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { HarvestEthController as ControllerContract } from "../generated/HarvestEthController1/HarvestEthController";

import { FeeRewardForwarder as FeeRewardForwarderContract } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";

import {
  Vault as VaultTemplate,
  FeeRewardForwarder as FeeRewardForwarderTemplate,
  RewardPool as RewardPoolTemplate,
} from "../generated/templates";

import { getOrCreateERC20Token, getOrCreateMarket } from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";

/**
 * Create new Vault and Market entities, and start indexing new vault contract.
 * @param block
 * @param vaultAddress
 * @returns
 */
export function getOrCreateVault(block: ethereum.Block, vaultAddress: Address): Vault {
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
  let inputToken = getOrCreateERC20Token(block, fAssetToken.underlying());
  vault.underlyingToken = inputToken.id;
  vault.pricePerShare = fAssetToken.getPricePerFullShare();
  vault.save();

  // create Market entity
  let outputToken = getOrCreateERC20Token(block, vaultAddress);
  let farmToken = getOrCreateERC20Token(block, FARM_TOKEN_ADDRESS);
  getOrCreateMarket(
    block,
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
export function getOrCreateFeeRewardForwarder(forwarderAddress: string): FeeRewardForwarder {
  let forwarder = FeeRewardForwarder.load(forwarderAddress);
  if (forwarder != null) {
    return forwarder as FeeRewardForwarder;
  }

  forwarder = new FeeRewardForwarder(forwarderAddress);
  forwarder.save();

  // get reward pool
  let feeRewarderContract = FeeRewardForwarderContract.bind(Address.fromString(forwarderAddress));
  let rewardPool = feeRewarderContract.profitSharingPool();
  if (rewardPool) {
    getOrCreateRewardPool(rewardPool.toHexString(), feeRewarderContract.farm().toHexString());
  }

  // start indexing FeeRewardForwarder contract
  FeeRewardForwarderTemplate.create(Address.fromString(forwarderAddress));

  return forwarder;
}

/**
 * Create entity for RewardPool and start indexing it
 * @param rewardPoolAddress
 * @param rewardToken
 * @returns
 */
export function getOrCreateRewardPool(rewardPoolAddress: string, rewardToken: string): RewardPool {
  let rewardPool = RewardPool.load(rewardPoolAddress);
  if (rewardPool != null) {
    return rewardPool as RewardPool;
  }

  rewardPool = new RewardPool(rewardPoolAddress);
  rewardPool.rewardToken = rewardToken;
  rewardPool.save();

  // start indexing reward pool contract
  RewardPoolTemplate.create(Address.fromString(rewardPoolAddress));

  return rewardPool;
}

/**
 * Create controller entity and init fee reward forwarder if available
 * @param controllerAddress
 * @returns
 */
export function getOrCreateHarvestController(controllerAddress: string): HarvestController {
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
  if (feeRewardForwarder) {
    getOrCreateFeeRewardForwarder(feeRewardForwarder.toHexString());
  }

  return controller;
}
