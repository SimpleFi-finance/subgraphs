import { Address, DataSourceContext } from "@graphprotocol/graph-ts";

import { AddressesProviderRegistered } from "../../generated/LendingPoolAddressesProviderRegistry/LendingPoolAddressesProviderRegistry";

import {
  ProxyCreated,
  LendingPoolUpdated,
  PriceOracleUpdated,
  LendingPoolConfiguratorUpdated,
  LendingPoolAddressesProvider as AddressProviderContract,
} from "../../generated/templates/LendingPoolAddressesProvider/LendingPoolAddressesProvider";

import {
  LendingPoolAddressesProvider as LendingPoolAddressesProviderTemplate,
  LendingPool as LendingPoolTemplate,
  LendingPoolConfigurator as LendingPoolConfiguratorTemplate,
} from "../../generated/templates";

import { LendingPoolAddressesProvider, LendingPool } from "../../generated/schema";

import { ADDRESS_ZERO } from "../library/common";

/**
 * Handle new implementation of address provider
 * @param event
 */
export function handleAddressesProviderRegistered(event: AddressesProviderRegistered): void {
  let address = event.params.newAddress;

  // store address provider as entity
  let provider = new LendingPoolAddressesProvider(address.toHexString());
  provider.address = address.toHexString();
  provider.priceOracle = ADDRESS_ZERO;
  provider.save();

  // start indexing the address provider
  LendingPoolAddressesProviderTemplate.create(address);
}

/**
 * Handle creation of new proxy contract, either lending pool or configurator
 * @param event
 */
export function handleProxyCreated(event: ProxyCreated): void {
  let poolId = event.params.id;
  let address = event.params.newAddress;

  if (poolId.toString() == "LENDING_POOL") {
    startIndexingLendingPool(address, event.address);
  } else if (poolId.toString() == "LENDING_POOL_CONFIGURATOR") {
    startIndexingLendingPoolConfigurator(address, event.address);
  }
}

/**
 * Start the indexer for lending pool contract
 * @param event
 */
export function handleLendingPoolUpdated(event: LendingPoolUpdated): void {
  startIndexingLendingPool(event.params.newAddress, event.address);
}

/**
 * Start the indexer for configurator contract
 * @param event
 */
export function handleLendingPoolConfiguratorUpdated(event: LendingPoolConfiguratorUpdated): void {
  startIndexingLendingPoolConfigurator(event.params.newAddress, event.address);
}

/**
 * Update price oracle contract address
 * @param event
 */
export function handlePriceOracleUpdated(event: PriceOracleUpdated): void {
  let addressProvider = LendingPoolAddressesProvider.load(event.address.toHexString());
  let priceOracle = event.params.newAddress.toHexString();

  addressProvider.priceOracle = priceOracle;
  addressProvider.save();
}

/**
 * Create entity and start indexer for lending pool contract
 * @param poolAddress
 * @param addresProvider
 */
function startIndexingLendingPool(poolAddress: Address, addresProvider: Address) {
  // create lending pool entity
  let lendingPool = new LendingPool(poolAddress.toHexString());
  lendingPool.address = poolAddress.toHexString();
  lendingPool.addressProvider = addresProvider.toHexString();
  lendingPool.save();

  // start indexing lending pool
  LendingPoolTemplate.create(poolAddress);
}

/**
 * Fetch lending pool address and pass it to lending pool configurator indexer
 * @param configurator
 * @param addresProvider
 */
function startIndexingLendingPoolConfigurator(
  configurator: Address,
  addresProvider: Address
): void {
  // fetch lending pool address and forward it to configurator
  let contract = AddressProviderContract.bind(addresProvider);
  let lendingPool = contract.getLendingPool();
  let context = new DataSourceContext();
  context.setString("lendingPool", lendingPool.toHexString());

  LendingPoolConfiguratorTemplate.createWithContext(configurator, context);
}
