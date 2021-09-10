import { Address, BigInt, log } from "@graphprotocol/graph-ts";

import { MasterChefV2, LogPoolAddition } from "../../generated/MasterChefV2/MasterChefV2";

import { IRewarder } from "../../generated/MasterChefV2/IRewarder";

import { SushiFarm, Token } from "../../generated/schema";

import { getOrCreateERC20Token, getOrCreateMarketWithId, ADDRESS_ZERO } from "../library/common";

import { ProtocolName, ProtocolType } from "../library/constants";

export function handleLogPoolAddition(event: LogPoolAddition): void {
  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(event.params.pid.toString());
  sushiFarm.masterChef = event.address.toHexString();
  sushiFarm.rewarder = event.params.rewarder.toHexString();
  sushiFarm.allocPoint = event.params.allocPoint;
  sushiFarm.created = event.block.timestamp;
  sushiFarm.createdAtBlock = event.block.number;
  sushiFarm.createdAtTransaction = event.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, event.params.lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.save();

  // create market representing the farm
  let marketId = sushiFarm.masterChef.concat("-").concat(sushiFarm.id);
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];

  let rewardTokens: Token[] = getRewardTokens(sushiFarm);

  getOrCreateMarketWithId(
    event,
    marketId,
    marketAddress,
    protocolName,
    protocolType,
    inputTokens,
    null,
    rewardTokens
  );
}

/**
 * Get reward tokens of a pool by fetching sushi token address and additionally fetch
 * extra reward tokens by calling pendingTokens function of rewarder contract
 * @param sushiFarm
 * @returns
 */
function getRewardTokens(sushiFarm: SushiFarm): Token[] {
  let tokens: Token[] = [];
  let masterChef = MasterChefV2.bind(Address.fromString(sushiFarm.masterChef));

  // get sushi address
  let sushiToken = masterChef.try_SUSHI();
  if (!sushiToken.reverted) {
    tokens.push(new Token(sushiToken.value.toHexString()));
  }

  // get extra reward tokens
  let rewarder = IRewarder.bind(Address.fromString(sushiFarm.rewarder));
  let result = rewarder.try_pendingTokens(
    BigInt.fromI32(0),
    Address.fromString(ADDRESS_ZERO),
    BigInt.fromI32(0)
  );
  if (!result.reverted) {
    let extraRewardTokens: Address[] = result.value.value0;
    for (let i: i32 = 0; i < extraRewardTokens.length; i++) {
      tokens.push(new Token(extraRewardTokens[i].toHexString()));
    }
  }

  return tokens;
}
