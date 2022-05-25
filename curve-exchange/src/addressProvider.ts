import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  AddressModified,
  NewAddressIdentifier,
} from "../generated/CurveExchangeAddressProvider/AddressProvider";

import { PoolRegistry, AddressProvider, MetaPoolFactory } from "../generated/schema";

import { MetaPoolFactory as FactoryContract } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";

import {
  PoolRegistry as PoolRegistryTemplate,
  MetaPoolFactory as MetaPoolFactoryTemplate,
} from "../generated/templates";

const REGISTRY_ID = 0;
const METAPOOL_FACTORY_ID = 3;

export function handleAddressModified(event: AddressModified): void {
  let id = event.params.id;
  let newAddress = event.params.new_address;
  addNewSource(event, id, newAddress);
}

export function handleNewAddressIdentifier(event: NewAddressIdentifier): void {
  let id = event.params.id;
  let newAddress = event.params.addr;
  addNewSource(event, id, newAddress);
}

/**
 * Add new registry or metapool factory
 * @param event
 * @param id
 * @param newAddress
 */
function addNewSource(event: ethereum.Event, id: BigInt, newAddress: Address): void {
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
      if (poolRegistry.id.toLowerCase() != "0xe2470c5e330a34d706f93d50658ba52d18512f7a") {
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
      // fetch pool count from the contract (might not be 0 if we learned about factory only when it was added to AddressProvider)
      metapoolFactory.poolCount = FactoryContract.bind(newAddress).pool_count();
      metapoolFactory.save();

      // start indexing metapool factory
      MetaPoolFactoryTemplate.create(newAddress);
    }
  }
}
