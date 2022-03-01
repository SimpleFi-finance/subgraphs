import { ethereum } from "@graphprotocol/graph-ts";
import { PoolDeployed } from "../generated/schema";
import {
  Deploy_metapoolCall,
  Deploy_plain_poolCall,
} from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { getOrCreatePoolViaFactory } from "./curveUtil";

export function handleMetaPoolDeployed(call: Deploy_metapoolCall): void {
  let newCurvePoolAddress = call.outputValues[0].value.toAddress();
  let factoryAddress = call.to;
  let fakeEvent = new ethereum.Event();
  fakeEvent.block = call.block;
  fakeEvent.transaction = call.transaction;

  getOrCreatePoolViaFactory(fakeEvent, newCurvePoolAddress, factoryAddress, true);

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

  getOrCreatePoolViaFactory(fakeEvent, newCurvePoolAddress, factoryAddress, false);

  let x = new PoolDeployed(call.transaction.hash.toHexString());
  x.source = "handlePlainPoolDeployed";
  x.save();
}
