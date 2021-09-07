import {
  AddressesProviderRegistered,
  AddressesProviderUnregistered,
} from "../../generated/LendingPoolAddressesProviderRegistry/LendingPoolAddressesProviderRegistry";

import { ProxyCreated } from "../../generated/templates/LendingPoolAddressesProvider/LendingPoolAddressesProvider";
import { LendingPoolAddressesProvider, LendingPool } from "../../generated/templates";
import { LendingPoolAddressesProvider as ProviderEntity } from "../../generated/schema";

export function handleAddressesProviderRegistered(event: AddressesProviderRegistered): void {
  let address = event.params.newAddress;

  // store address provider as entity
  let provider = new ProviderEntity(address.toHexString());
  provider.address = address.toHexString();
  provider.save();

  // start indexing the address provider
  LendingPoolAddressesProvider.create(address);
}

export function handleProxyCreated(event: ProxyCreated): void {
  let poolId = event.params.id;
  let poolAddress = event.params.newAddress;
}
