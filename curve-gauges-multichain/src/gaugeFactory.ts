import { DeployedGauge } from "../generated/GaugeFactory/GaugeFactory";
import { LiquidityGauge as GaugeContract } from "../generated/templates/LiquidityGauge/LiquidityGauge";
import { getOrCreateGauge } from "./gaugeUtils";

export function handleDeployedGauge(event: DeployedGauge): void {
  let gaugeAddress = event.params._gauge;

  let gaugeContract = GaugeContract.bind(gaugeAddress);
  if (gaugeContract.try_lp_token().reverted) {
    // contracts without LP (input) token are not real gauges
    return;
  }

  getOrCreateGauge(event, gaugeAddress);
}
