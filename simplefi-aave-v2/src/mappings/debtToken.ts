import { Burn as StableTokenBurnEvent } from "../../generated/templates/StableDebtToken/StableDebtToken";
import { Burn as VariableTokenBurnEvent } from "../../generated/templates/VariableDebtToken/VariableDebtToken";

import { StableDebtTokenBurn, VariableDebtTokenBurn } from "../../generated/schema";

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
