import {
  Mint,
  Burn,
  Initialized,
} from "../../generated/templates/VariableDebtToken/VariableDebtToken";

import { getOrCreateIncentivesController } from "../library/lendingPoolUtils";

import { VariableDebtToken, Market, VariableDebtTokenBurn } from "../../generated/schema";

import { ADDRESS_ZERO } from "../library/common";

export function handleVariableTokenMint(event: Mint): void {
  let mintedAmount = event.params.value;

  let vToken = VariableDebtToken.load(event.address.toHexString());
  let market = Market.load(vToken.lendingPool + "-" + vToken.id) as Market;
}

export function handleVariableTokenBurn(event: Burn): void {
  let tx = event.transaction.hash.toHexString();
  let variableToken = event.address.toHexString();

  let burn = new VariableDebtTokenBurn(tx + "-" + variableToken);
  burn.save();
}

export function handleVariableDebtTokenInitialized(event: Initialized): void {
  let controllerAddress = event.params.incentivesController.toHexString();
  if (controllerAddress == ADDRESS_ZERO) {
    return;
  }

  let lendingPool = event.params.pool.toHexString();
  getOrCreateIncentivesController(event, controllerAddress, lendingPool);
}
