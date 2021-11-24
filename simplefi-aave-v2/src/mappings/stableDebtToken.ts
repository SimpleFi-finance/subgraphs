import {
  Burn as StableTokenBurnEvent,
  Initialized as StableDebtTokenInitialized,
} from "../../generated/templates/StableDebtToken/StableDebtToken";

import { getOrCreateIncentivesController } from "../library/lendingPoolUtils";

import { StableDebtTokenBurn } from "../../generated/schema";

import { ADDRESS_ZERO } from "../library/common";

export function handleStableTokenBurn(event: StableTokenBurnEvent): void {
  let tx = event.transaction.hash.toHexString();
  let token = event.address.toHexString();

  let burn = new StableDebtTokenBurn(tx + "-" + token);
  burn.save();
}

export function handleStableDebtTokenInitialized(event: StableDebtTokenInitialized): void {
  let controllerAddress = event.params.incentivesController.toHexString();
  if (controllerAddress == ADDRESS_ZERO) {
    return;
  }

  let lendingPool = event.params.pool.toHexString();
  getOrCreateIncentivesController(event, controllerAddress, lendingPool);
}
