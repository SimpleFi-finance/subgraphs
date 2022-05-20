import { LiquidityGaugeDeployed } from "../generated/Factory/MetaPoolFactory";
import { LiquidityGauge as GaugeContract } from "../generated/templates/LiquidityGauge/LiquidityGauge";
import { getOrCreateGauge } from "./gaugeUtils";

export function handleLiquidityGaugeDeployed(event: LiquidityGaugeDeployed): void {
  let gaugeAddress = event.params.gauge;
  let pool = event.params.pool;

  let gaugeContract = GaugeContract.bind(gaugeAddress);
  if (gaugeContract.try_lp_token().reverted) {
    // contracts without LP (input) token are not real gauges
    return;
  }

  getOrCreateGauge(event, gaugeAddress);
}
