import { BigInt } from "@graphprotocol/graph-ts";
import {
  Add_existing_metapoolsCall,
  MetaPoolFactory as MetaPoolFactoryContract,
  PlainPoolDeployed,
} from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { MetaPoolDeployed } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { ADDRESS_ZERO } from "./common";
import { getOrCreateMetaPoolFactory, getOrCreatePoolViaFactory } from "./curveUtil";

export function handleMetaPoolDeployedEvent(event: MetaPoolDeployed): void {
  let factory = getOrCreateMetaPoolFactory(event.address);

  // fetch contract address of new pool from the contract
  let newCurvePoolAddress = MetaPoolFactoryContract.bind(event.address).pool_list(
    factory.poolCount
  );

  // ++poolCount
  factory.poolCount = factory.poolCount.plus(BigInt.fromI32(1));
  factory.save();

  // create new pool
  getOrCreatePoolViaFactory(event, newCurvePoolAddress, event.address);
}

export function handlePlainPoolDeployedEvent(event: PlainPoolDeployed): void {
  let factory = getOrCreateMetaPoolFactory(event.address);

  // fetch contract address of new pool from the contract
  let newCurvePoolAddress = MetaPoolFactoryContract.bind(event.address).pool_list(
    factory.poolCount
  );

  // ++poolCount
  factory.poolCount = factory.poolCount.plus(BigInt.fromI32(1));
  factory.save();

  // create new pool
  getOrCreatePoolViaFactory(event, newCurvePoolAddress, event.address);
}

export function handleAddExistingMetapoolCall(call: Add_existing_metapoolsCall): void {
  let factory = getOrCreateMetaPoolFactory(call.to);

  // increase pool counter by the number of pools added
  let pools = call.inputs._pools;
  let newPoolCounter = 0;

  for (let i = 0; i < pools.length; i++) {
    if (pools[i].toHexString() == ADDRESS_ZERO) {
      break;
    }
    newPoolCounter++;
  }

  factory.poolCount = factory.poolCount.plus(BigInt.fromI32(newPoolCounter));
  factory.save();
}
