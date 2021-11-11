import { Address } from "@graphprotocol/graph-ts";

import { AddressesProviderRegistered } from "../../generated/LendingPoolAddressesProviderRegistry/LendingPoolAddressesProviderRegistry";

import {
  ProxyCreated,
  LendingPoolUpdated,
  PriceOracleUpdated,
  LendingPoolConfiguratorUpdated,
} from "../../generated/templates/LendingPoolAddressesProvider/LendingPoolAddressesProvider";

import {
  LendingPoolAddressesProvider as LendingPoolAddressesProviderTemplate,
  LendingPool as LendingPoolTemplate,
  LendingPoolConfigurator as LendingPoolConfiguratorTemplate,
} from "../../generated/templates";
import { LendingPoolAddressesProvider, LendingPool } from "../../generated/schema";
import { LendingPoolConfigurator } from "../../generated/templates/LendingPoolConfigurator/LendingPoolConfigurator";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

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

export function handleProxyCreated(event: ProxyCreated): void {
  let poolId = event.params.id;
  let poolAddress = event.params.newAddress;

  if (poolId.toString() == "LENDING_POOL") {
    let lendingPool = new LendingPool(poolAddress.toHexString());
    lendingPool.address = poolAddress.toHexString();
    lendingPool.addressProvider = event.address.toHexString();
    lendingPool.save();

    LendingPoolTemplate.create(poolAddress);
  }
}

export function handleLendingPoolUpdated(event: LendingPoolUpdated): void {
  let poolAddress = event.params.newAddress;

  let lendingPool = new LendingPool(poolAddress.toHexString());
  lendingPool.address = poolAddress.toHexString();
  lendingPool.addressProvider = event.address.toHexString();
  lendingPool.save();

  LendingPoolTemplate.create(poolAddress);
}

export function handleLendingPoolConfiguratorUpdated(event: LendingPoolConfiguratorUpdated): void {
  let configuratorAddress = event.params.newAddress;
  LendingPoolConfiguratorTemplate.create(configuratorAddress);
}

export function handlePriceOracleUpdated(event: PriceOracleUpdated): void {
  let addressProvider = LendingPoolAddressesProvider.load(event.address.toHexString());
  let priceOracle = event.params.newAddress.toHexString();

  addressProvider.priceOracle = priceOracle;
  addressProvider.save();
}
