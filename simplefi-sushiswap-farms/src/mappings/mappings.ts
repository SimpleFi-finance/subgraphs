import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";

import { LogPoolAddition } from "../../generated/MasterChefV2/MasterChefV2";
import { SushiFarm } from "../../generated/schema";

export function handleLogPoolAddition(event: LogPoolAddition): void {
  let sushiFarm = new SushiFarm(event.params.pid.toString());
  sushiFarm.masterChef = event.address.toHexString();
  sushiFarm.lpToken = event.params.lpToken.toHexString();
  sushiFarm.rewarder = event.params.rewarder.toHexString();
  sushiFarm.allocPoint = event.params.allocPoint;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  sushiFarm.save();

  log.info("XXXXXXXXXX Saved new farm with ID {}", [event.params.pid.toString()]);
}
