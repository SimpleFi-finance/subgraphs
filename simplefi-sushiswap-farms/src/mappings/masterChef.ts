import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";

import { MasterChef, Deposit } from "../../generated/MasterChef/MasterChef";

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
 * User deposits his LP tokens to farm
 * @param event
 * @returns
 */
export function handleDeposit(event: Deposit): void {}
