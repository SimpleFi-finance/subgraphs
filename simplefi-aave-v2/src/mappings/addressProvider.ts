import { AddressesProviderRegistered } from "../../generated/LendingPoolAddressesProviderRegistry/LendingPoolAddressesProviderRegistry";

import {
  ProxyCreated,
  LendingPoolUpdated,
} from "../../generated/templates/LendingPoolAddressesProvider/LendingPoolAddressesProvider";

import {
  LendingPoolAddressesProvider as LendingPoolAddressesProviderTemplate,
  LendingPool as LendingPoolTemplate,
} from "../../generated/templates";
import { LendingPoolAddressesProvider, LendingPool } from "../../generated/schema";

import { log } from "@graphprotocol/graph-ts";

export function handleAddressesProviderRegistered(event: AddressesProviderRegistered): void {
  let address = event.params.newAddress;

  // store address provider as entity
  let provider = new LendingPoolAddressesProvider(address.toHexString());
  provider.address = address.toHexString();
  provider.save();

  // start indexing the address provider
  LendingPoolAddressesProviderTemplate.create(address);
}

export function handleProxyCreated(event: ProxyCreated): void {
  let poolId = event.params.id;
  let poolAddress = event.params.newAddress;

  let lendingPool = new LendingPool(poolAddress.toHexString());
  lendingPool.address = poolAddress.toHexString();
  lendingPool.save();

  LendingPoolTemplate.create(poolAddress);
}

export function handleLendingPoolUpdated(event: LendingPoolUpdated): void {
  let poolAddress = event.params.newAddress;

  let lendingPool = new LendingPool(poolAddress.toHexString());
  lendingPool.address = poolAddress.toHexString();
  lendingPool.save();

  LendingPoolTemplate.create(poolAddress);
}
