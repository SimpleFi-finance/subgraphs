import { Address, BigInt, ethereum, store } from "@graphprotocol/graph-ts";
import { IRewarder } from "../../generated/MiniChef/IRewarder";

import {
  Account,
  ExtraRewardTokenTransfer,
  Market,
  MasterChef,
  SushiFarm,
  SushiRewardTransfer,
  Token,
  UserInfo,
} from "../../generated/schema";
import { RewardToken } from "../../generated/templates";
import { getOrCreateERC20Token, ADDRESS_ZERO, TokenBalance } from "./common";

// hard-coded as in contract
let ACC_SUSHI_PRECISION: BigInt = BigInt.fromI32(10).pow(12);

/**
 * Create UserInfo entity which tracks how many LP tokens user provided and how many Sushi rewards he claimed
 * @param user
 * @param farmId
 * @returns
 */
export function getOrCreateUserInfo(user: string, farmId: string): UserInfo {
  let id = user + "-" + farmId;
  let userInfo = UserInfo.load(id) as UserInfo;

  if (userInfo == null) {
    userInfo = new UserInfo(id);
    userInfo.amount = BigInt.fromI32(0);
    userInfo.rewardDebt = BigInt.fromI32(0);
    userInfo.user = user;
    userInfo.farm = farmId;
    userInfo.save();
  }

  return userInfo;
}

/**
 * Get reward tokens of a pool by fetching sushi token address and additionally fetch
 * extra reward tokens by calling `pendingTokens` function of rewarder contract.
 * Additionaly, start indexing extra reward tokens based on ERC20 template.
 * @param sushiFarm
 * @returns
 */
export function getRewardTokens(sushiFarm: SushiFarm, event: ethereum.Event): Token[] {
  let tokens: Token[] = [];
  let masterChef = MasterChef.load(sushiFarm.masterChef);

  // add Sushi
  tokens.push(getOrCreateERC20Token(event, Address.fromString(masterChef.sushi)));

  // get extra reward tokens by querying Rewarder contract
  let rewarder = IRewarder.bind(Address.fromString(sushiFarm.rewarder));
  let result = rewarder.try_pendingTokens(
    sushiFarm.farmPid,
    Address.fromString(ADDRESS_ZERO),
    BigInt.fromI32(0)
  );
  if (!result.reverted) {
    let extraRewardTokens: Address[] = result.value.value0;
    for (let i: i32 = 0; i < extraRewardTokens.length; i++) {
      let tokenAddress = extraRewardTokens[i];
      let token = Token.load(tokenAddress.toHexString());
      if (token == null) {
        // start indexing transfer events
        RewardToken.create(tokenAddress);
      }

      tokens.push(getOrCreateERC20Token(event, tokenAddress));
    }
  }

  return tokens;
}

/**
 * Get claimable reward token amounts. For Sushi calculate it, for other reward tokens use contract call
 * @param sushiFarm
 * @param receiver
 * @param rewardTokenBalances
 * @param market
 */
export function collectRewardTokenBalances(
  sushiFarm: SushiFarm,
  account: Account,
  rewardTokenBalances: TokenBalance[],
  market: Market
): void {
  let rewardTokens = market.rewardTokens as string[];

  // calculate claimable amount of sushi
  let userInfo = UserInfo.load(account.id + "-" + sushiFarm.id);
  let claimableSushi = userInfo.amount
    .times(sushiFarm.accSushiPerShare)
    .div(ACC_SUSHI_PRECISION)
    .minus(userInfo.rewardDebt);
  rewardTokenBalances.push(new TokenBalance(rewardTokens[0], account.id, claimableSushi));

  // fetch claimable amount of extra reward tokens using rewarder contract call
  let rewarder = IRewarder.bind(Address.fromString(sushiFarm.rewarder));
  let result = rewarder.try_pendingTokens(
    sushiFarm.farmPid,
    Address.fromString(account.id),
    BigInt.fromI32(0)
  );
  if (!result.reverted) {
    let extraRewardTokens: Address[] = result.value.value0;
    let amounts: BigInt[] = result.value.value1;
    for (let i: i32 = 0; i < extraRewardTokens.length; i++) {
      // add claimable reward balance
      rewardTokenBalances.push(
        new TokenBalance(extraRewardTokens[i].toHexString(), account.id, amounts[i])
      );
    }
  }
}

/**
 * Get info about harvested Sushi and other reward tokens by looking at Transfer events which preceded
 * the Harvest event.
 * @param event
 * @param rewardTokenAmounts
 * @param rewardTokens
 * @param harvestedSushiAmount
 */
export function getHarvestedRewards(
  event: ethereum.Event,
  market: Market,
  rewardTokenAmounts: TokenBalance[]
): void {
  let rewardTokens = market.rewardTokens as string[];

  // get sushi receiver (it doesn't have to be harvester himself) by checking preceding Sushi transfer
  let sushiEventEntityId = event.transaction.hash.toHexString();
  let sushiTransfer = SushiRewardTransfer.load(sushiEventEntityId);
  if (sushiTransfer != null) {
    let sushiReceiver = sushiTransfer.to;
    let sushiAmount = sushiTransfer.value;

    // store amount of harvested Sushi
    rewardTokenAmounts.push(new TokenBalance(rewardTokens[0], sushiReceiver, sushiAmount));

    // remove entity so that new one can be created in same transaction
    store.remove("SushiRewardTransfer", sushiEventEntityId);
  }

  // get and store extra token rewards, if any
  let tx = event.transaction.hash.toHexString();
  for (let i: i32 = 1; i < rewardTokens.length; i++) {
    let token = rewardTokens[i];
    let transfer = ExtraRewardTokenTransfer.load(tx + "-" + token);

    // if there was no reward token transfer preceding the Harvest event, don't handle it
    if (transfer == null) {
      continue;
    }

    let rewardReceiver = transfer.to;
    let rewardTokenAmount = transfer.value;
    rewardTokenAmounts.push(new TokenBalance(token, rewardReceiver, rewardTokenAmount));

    // remove entity so that new one can be created in same transaction for same token
    store.remove("ExtraRewardTokenTransfer", tx + "-" + token);
  }
}

/**
 * Function returns true if there's at least one reward transfer entity stored for current transaction.
 * If all reward transfers in this tx are already processed then there will be no stored entites (they
 * are deleted upon processing in withdraw or harvest) and function will return false.
 * @param market
 * @param event
 */
export function isThereUnprocessedRewardTransfer(market: Market, event: ethereum.Event): boolean {
  // check if there's unprocessed Sushi reward transfer
  let sushiEventEntityId = event.transaction.hash.toHexString();
  let sushiTransfer = SushiRewardTransfer.load(sushiEventEntityId);
  if (sushiTransfer != null) {
    return true;
  }

  // check if there's unprocessed extra reward token transfer
  let rewardTokens = market.rewardTokens as string[];
  let tx = event.transaction.hash.toHexString();
  for (let i: i32 = 1; i < rewardTokens.length; i++) {
    let token = rewardTokens[i];
    let transfer = ExtraRewardTokenTransfer.load(tx + "-" + token);

    // if there was no reward token transfer preceding the Harvest event, don't handle it
    if (transfer != null) {
      return true;
    }
  }

  return false;
}
