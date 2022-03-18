import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { MetaPoolFactory, PoolDeployed } from "../generated/schema";
import {
  MetaPoolFactory as MetaPoolFactoryContract,
  PlainPoolDeployed,
} from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import {
  Deploy_metapoolCall,
  Deploy_plain_poolCall,
  MetaPoolDeployed,
} from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { getOrCreatePoolViaFactory } from "./curveUtil";

export function handleMetaPoolDeployed(call: Deploy_metapoolCall): void {
  let newCurvePoolAddress = call.outputValues[0].value.toAddress();
  let factoryAddress = call.to;
  let fakeEvent = new ethereum.Event();
  fakeEvent.block = call.block;
  fakeEvent.transaction = call.transaction;

  getOrCreatePoolViaFactory(fakeEvent, newCurvePoolAddress, factoryAddress);

  let x = new PoolDeployed(call.transaction.hash.toHexString());
  x.source = "handleMetaPoolDeployed";
  x.save();
}

export function handlePlainPoolDeployed(call: Deploy_plain_poolCall): void {
  let newCurvePoolAddress = call.outputValues[0].value.toAddress();
  let factoryAddress = call.to;
  let fakeEvent = new ethereum.Event();
  fakeEvent.block = call.block;
  fakeEvent.transaction = call.transaction;

  getOrCreatePoolViaFactory(fakeEvent, newCurvePoolAddress, factoryAddress);

  let x = new PoolDeployed(call.transaction.hash.toHexString());
  x.source = "handlePlainPoolDeployed";
  x.save();
}

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
