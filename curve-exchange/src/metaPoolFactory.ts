import { BigInt } from "@graphprotocol/graph-ts";
import { MetaPoolFactory } from "../generated/schema";
import {
  MetaPoolFactory as MetaPoolFactoryContract,
  PlainPoolDeployed,
} from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { MetaPoolDeployed } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { getOrCreatePoolViaFactory } from "./curveUtil";

export function handleMetaPoolDeployedEvent(event: MetaPoolDeployed): void {
  let factory = MetaPoolFactory.load(event.address.toHexString());

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

export function handlePlainDeployedEvent(event: PlainPoolDeployed): void {
  let factory = MetaPoolFactory.load(event.address.toHexString());

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
