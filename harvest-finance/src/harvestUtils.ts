import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  Account,
  FeeRewardForwarder,
  HarvestController,
  PositionInVault,
  ProfitSharingPool,
  Vault,
} from "../generated/schema";
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";
import { HarvestEthController as ControllerContract } from "../generated/HarvestEthController1/HarvestEthController";

import { FeeRewardForwarder as FeeRewardForwarderContract } from "../generated/templates/FeeRewardForwarder/FeeRewardForwarder";

import {
  Vault as VaultTemplate,
  FeeRewardForwarder as FeeRewardForwarderTemplate,
  ProfitSharingPool as ProfitSharingPoolTemplate,
} from "../generated/templates";

import { ADDRESS_ZERO, getOrCreateERC20Token, getOrCreateMarket } from "./common";
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

  // get reward pool
  let feeRewarderContract = FeeRewardForwarderContract.bind(Address.fromString(forwarderAddress));
  let profitSharingPoolAddress = feeRewarderContract.profitSharingPool();

  if (profitSharingPoolAddress && profitSharingPoolAddress.toHexString() != ADDRESS_ZERO) {
    let profitSharingPool = getOrCreateProfitSharingPool(
      profitSharingPoolAddress.toHexString(),
      feeRewarderContract.farm().toHexString()
    );
    forwarder.profitSharingPool = profitSharingPool.id;
  }
  forwarder.save();

  // start indexing FeeRewardForwarder contract
  FeeRewardForwarderTemplate.create(Address.fromString(forwarderAddress));

  return forwarder;
}

/**
 * Create entity for ProfitSharingPool and start indexing it
 * @param profitSharingPoolAddress
 * @param rewardToken
 * @returns
 */
export function getOrCreateProfitSharingPool(
  profitSharingPoolAddress: string,
  rewardToken: string
): ProfitSharingPool {
  let profitSharingPool = ProfitSharingPool.load(profitSharingPoolAddress);
  if (profitSharingPool != null) {
    return profitSharingPool as ProfitSharingPool;
  }

  profitSharingPool = new ProfitSharingPool(profitSharingPoolAddress);
  profitSharingPool.rewardToken = rewardToken;
  profitSharingPool.save();

  // start indexing reward pool contract
  ProfitSharingPoolTemplate.create(Address.fromString(profitSharingPoolAddress));

  return profitSharingPool;
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
  if (feeRewardForwarder && feeRewardForwarder.toHexString() != ADDRESS_ZERO) {
    getOrCreateFeeRewardForwarder(feeRewardForwarder.toHexString());
  }

  return controller;
}
