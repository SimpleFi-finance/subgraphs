import { BigInt } from "@graphprotocol/graph-ts";
import { AddressModified } from "../generated/CurveExchangeAddressProvider/AddressProvider";

import { PoolRegistry, AddressProvider, MetaPoolFactory } from "../generated/schema";
import {
  PoolRegistry as PoolRegistryTemplate,
  MetaPoolFactory as MetaPoolFactoryTemplate,
} from "../generated/templates";

const REGISTRY_ID = 0;
const METAPOOL_FACTORY_ID = 3;

export function handleAddressModified(event: AddressModified): void {
  let id = event.params.id;
  let newAddress = event.params.new_address;

  // create address provider entity
  let addressProvider = AddressProvider.load(event.address.toHexString());

  if (addressProvider == null) {
    addressProvider = new AddressProvider(event.address.toHexString());
    addressProvider.save();
  }

  // create registry entity
  if (id == BigInt.fromI32(REGISTRY_ID)) {
    let poolRegistry = PoolRegistry.load(newAddress.toHexString());
    if (poolRegistry == null) {
      poolRegistry = new PoolRegistry(newAddress.toHexString());
      poolRegistry.save();

      // don't use this address as that registry is not functioning
      if (poolRegistry.id != "0xe2470c5e330a34d706f93d50658ba52d18512f7a") {
        addressProvider.registry = poolRegistry.id;
        addressProvider.save();
      }

      // start indexing registry
      PoolRegistryTemplate.create(newAddress);
    }
  } else if (id == BigInt.fromI32(METAPOOL_FACTORY_ID)) {
    // 3 == metapool factory
    let metapoolFactory = MetaPoolFactory.load(newAddress.toHexString());
    if (metapoolFactory == null) {
      metapoolFactory = new MetaPoolFactory(newAddress.toHexString());
      metapoolFactory.save();

      // start indexing metapool factory
      MetaPoolFactoryTemplate.create(newAddress);
    }
  }
}
