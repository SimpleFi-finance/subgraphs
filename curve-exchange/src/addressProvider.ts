import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { AddressModified } from "../generated/CurveExchangeAddressProvider/AddressProvider";

import { PoolRegistry, AddressProvider } from "../generated/schema";
import { PoolRegistry as PoolRegistryTemplate } from "../generated/templates";

export function handleAddressModified(event: AddressModified): void {
  let id = event.params.id;
  let newAddress = event.params.new_address;

  // create address porivder entity
  let addressProvider = AddressProvider.load(event.address.toHexString());
  if (addressProvider == null) {
    addressProvider = new AddressProvider(event.address.toHexString());
  }

  // create registry entity
  if (id == BigInt.fromI32(0)) {
    let poolRegistry = PoolRegistry.load(newAddress.toHexString());
    if (poolRegistry == null) {
      poolRegistry = new PoolRegistry(newAddress.toHexString());
      poolRegistry.save();

      // start indexing registry
      PoolRegistryTemplate.create(newAddress);
    }

    addressProvider.registry = poolRegistry.id;
  }

  addressProvider.save();
}
