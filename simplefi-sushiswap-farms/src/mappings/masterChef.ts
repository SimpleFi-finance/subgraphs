import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import { MasterChef, AddCall, Deposit } from "../../generated/MasterChef/MasterChef";

import { Transfer } from "../../generated/templates/RewardToken/IERC20";

import { IRewarder } from "../../generated/MasterChefV2/IRewarder";

import {
  SushiFarm,
  SushiFarmSnapshot,
  FarmDeposit,
  FarmWithdrawal,
  UserInfo,
  Market,
  Account,
  Token,
  SushiRewardTransfer,
  ExtraRewardTokenTransfer,
  MasterChef as MasterChefEntity,
  Rewarder,
} from "../../generated/schema";

import {
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  getOrCreateAccount,
  updateMarket,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  ADDRESS_ZERO,
} from "../library/common";

import { RewardToken } from "../../generated/templates";

import { ProtocolName, ProtocolType } from "../library/constants";

// hard-coded as in contract
let ACC_SUSHI_PRECISION: BigInt = BigInt.fromI32(10).pow(12);

/**
 *
 * @param call
 */
export function handleAdd(call: AddCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString());

  // "fake" event containing block info
  let event = new ethereum.Event();
  event.block = call.block;

  // create MasterChef entity and store Sushi token address
  if (masterChef == null) {
    masterChef = new MasterChefEntity(call.to.toHexString());
    masterChef.version = BigInt.fromI32(1);

    // get sushi address, store it and start indexer if needed
    let masterChefContract = MasterChef.bind(call.to);
    let sushi = masterChefContract.sushi();

    let token = Token.load(sushi.toHexString());
    if (token == null) {
      // start indexing SUSHI events
      RewardToken.create(sushi);
    }

    let sushiToken = getOrCreateERC20Token(event, sushi);
    masterChef.sushi = sushiToken.id;
    masterChef.numberOfFarms = BigInt.fromI32(0);
    masterChef.save();
  }

  // create and fill SushiFarm entity
  let sushiFarm = new SushiFarm(masterChef.id + "-" + masterChef.numberOfFarms.toString());
  sushiFarm.farmPid = masterChef.numberOfFarms;
  sushiFarm.masterChef = masterChef.id;
  sushiFarm.allocPoint = call.inputs._allocPoint;
  sushiFarm.created = call.block.timestamp;
  sushiFarm.createdAtBlock = call.block.number;
  sushiFarm.createdAtTransaction = call.transaction.hash;
  sushiFarm.totalSupply = BigInt.fromI32(0);
  let inputToken = getOrCreateERC20Token(event, call.inputs._lpToken);
  sushiFarm.lpToken = inputToken.id;
  sushiFarm.lastRewardBlock = call.block.number;
  sushiFarm.accSushiPerShare = BigInt.fromI32(0);
  sushiFarm.save();

  // numberOfFarms++
  masterChef.numberOfFarms = masterChef.numberOfFarms.plus(BigInt.fromI32(1));
  masterChef.save();

  // create market representing the farm
  let marketId = sushiFarm.id;
  let marketAddress = Address.fromString(sushiFarm.masterChef);
  let protocolName = ProtocolName.SUSHISWAP_FARM;
  let protocolType = ProtocolType.TOKEN_MANAGEMENT;
  let inputTokens: Token[] = [inputToken];
  let rewardTokens: Token[] = [getOrCreateERC20Token(event, Address.fromString(masterChef.sushi))];

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
 * User deposits his LP tokens to farm
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {}
