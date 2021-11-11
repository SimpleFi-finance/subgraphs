import { CollateralConfigurationChanged } from "../../generated/templates/LendingPoolConfigurator/LendingPoolConfigurator";

import { Reserve } from "../../generated/schema";

export function handleCollateralConfigurationChanged(event: CollateralConfigurationChanged): void {
  let reserve = Reserve.load(event.params.asset.toHexString());
  reserve.ltv = event.params.ltv;
  reserve.save();
}
