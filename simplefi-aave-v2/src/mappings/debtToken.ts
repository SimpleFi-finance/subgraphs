import {
  Burn as StableTokenBurnEvent,
  Initialized as StableDebtTokenInitialized,
} from "../../generated/templates/StableDebtToken/StableDebtToken";
import {
  Burn as VariableTokenBurnEvent,
  Initialized as VariableDebtTokenInitialized,
} from "../../generated/templates/VariableDebtToken/VariableDebtToken";

import { AaveIncentivesController } from "../../generated/templates";

import {
  StableDebtTokenBurn,
  VariableDebtTokenBurn,
  IncentivesController,
} from "../../generated/schema";

export function handleVariableTokenBurn(event: VariableTokenBurnEvent): void {
  let tx = event.transaction.hash.toHexString();
  let variableToken = event.address.toHexString();

  let burn = new VariableDebtTokenBurn(tx + "-" + variableToken);
  burn.save();
}

export function handleStableTokenBurn(event: StableTokenBurnEvent): void {
  let tx = event.transaction.hash.toHexString();
  let token = event.address.toHexString();

  let burn = new StableDebtTokenBurn(tx + "-" + token);
  burn.save();
}

export function handleStableDebtTokenInitialized(event: StableDebtTokenInitialized): void {
  let controllerAddress = event.params.incentivesController;
  let incentivesController = IncentivesController.load(controllerAddress.toHexString());

  if (incentivesController == null) {
    incentivesController = new IncentivesController(controllerAddress.toHexString());
    incentivesController.save();

    // start indexing incentive controller
    AaveIncentivesController.create(controllerAddress);
  }
}

export function handleVariableDebtTokenInitialized(event: VariableDebtTokenInitialized): void {
  let controllerAddress = event.params.incentivesController;
  let incentivesController = IncentivesController.load(controllerAddress.toHexString());

  if (incentivesController == null) {
    incentivesController = new IncentivesController(controllerAddress.toHexString());
    incentivesController.save();

    // start indexing incentive controller
    AaveIncentivesController.create(controllerAddress);
  }
}
