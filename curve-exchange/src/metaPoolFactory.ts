import { ethereum, log } from "@graphprotocol/graph-ts";
import { Deploy_metapoolCall } from "../generated/templates/MetaPoolFactory/MetaPoolFactory";
import { getOrCreatePoolViaFactory } from "./curveUtil";

export function handleMetaPoolDeployed(call: Deploy_metapoolCall): void {
  let newCurvePoolAddress = call.outputValues[0].value.toAddress();
  let factoryAddress = call.to;
  let fakeEvent = new ethereum.Event();
  fakeEvent.block = call.block;
  fakeEvent.transaction = call.transaction;

  getOrCreatePoolViaFactory(fakeEvent, newCurvePoolAddress, factoryAddress);
}
