import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  AccountLiquidityVIMAsset as AccountLiquidityVIMAssetEntity,
  Market as MarketEntity,
  VIMAsset as VIMAssetEntity
} from "../generated/schema";
import {
  RewardAdded,
  RewardPaid,
  Staked,
  VIMAsset,
  Withdrawn
} from "../generated/viMBTC/VIMAsset";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common";

function getRewardBalance(vimAssetAddress: Address, user: Address): BigInt {
  let contract = VIMAsset.bind(vimAssetAddress)
  let unclaimed = contract.unclaimedRewards(user)
  return unclaimed.value0
}

function getOrCreateLiquidity(vimAsset: VIMAssetEntity, accountAddress: Address): AccountLiquidityVIMAssetEntity {
  let id = vimAsset.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityVIMAssetEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityVIMAssetEntity
  }
  liqudity = new AccountLiquidityVIMAssetEntity(id)
  liqudity.vimAsset = vimAsset.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityVIMAssetEntity
}

export function handleRewardAdded(event: RewardAdded): void {
  let vimAsset = VIMAssetEntity.load(event.address.toHexString()) as VIMAssetEntity
  vimAsset.rewardBalance = vimAsset.rewardBalance.plus(event.params.reward)
  vimAsset.save()
}

export function handleStaked(event: Staked): void {
  let vimAsset = VIMAssetEntity.load(event.address.toHexString()) as VIMAssetEntity
  vimAsset.imAssetBalance = vimAsset.imAssetBalance.plus(event.params.amount)
  vimAsset.totalSupply = vimAsset.totalSupply.plus(event.params.amount)
  vimAsset.save()

  // Update market
  let market = MarketEntity.load(event.address.toHexString()) as MarketEntity

  updateMarket(
    event,
    market,
    [new TokenBalance(vimAsset.imAsset, market.id, vimAsset.totalSupply)],
    vimAsset.totalSupply
  )

  // create or update position
  let account = getOrCreateAccount(event.params.user)
  let accountLiquidity = getOrCreateLiquidity(vimAsset, event.params.user)
  accountLiquidity.balance = accountLiquidity.balance.plus(event.params.amount)
  accountLiquidity.save()

  let rewardTokenBalance = getRewardBalance(event.address, event.params.user)

  investInMarket(
    event,
    account,
    market,
    event.params.amount,
    [new TokenBalance(vimAsset.imAsset, event.params.payer.toHexString(), event.params.amount)],
    [],
    accountLiquidity.balance,
    [new TokenBalance(vimAsset.imAsset, event.params.user.toHexString(), accountLiquidity.balance)],
    [new TokenBalance(vimAsset.rewardToken, vimAsset.id, rewardTokenBalance)],
    null
  )
}

export function handleRewardPaid(event: RewardPaid): void {
  let vimAsset = VIMAssetEntity.load(event.address.toHexString()) as VIMAssetEntity
  vimAsset.rewardBalance = vimAsset.rewardBalance.minus(event.params.reward)
  vimAsset.save()

  // Update market
  let market = MarketEntity.load(event.address.toHexString()) as MarketEntity

  // create or update position
  let account = getOrCreateAccount(event.params.user)
  let accountLiquidity = getOrCreateLiquidity(vimAsset, event.params.user)

  let rewardTokenBalance = getRewardBalance(event.address, event.params.user)

  redeemFromMarket(
    event,
    account,
    market,
    BigInt.fromI32(0),
    [],
    [new TokenBalance(vimAsset.rewardToken, account.id, event.params.reward)],
    accountLiquidity.balance,
    [new TokenBalance(vimAsset.imAsset, event.params.user.toHexString(), accountLiquidity.balance)],
    [new TokenBalance(vimAsset.rewardToken, vimAsset.id, rewardTokenBalance)],
    null
  )
}

export function handleWithdrawn(event: Withdrawn): void {
  let vimAsset = VIMAssetEntity.load(event.address.toHexString()) as VIMAssetEntity
  vimAsset.imAssetBalance = vimAsset.imAssetBalance.minus(event.params.amount)
  vimAsset.totalSupply = vimAsset.totalSupply.minus(event.params.amount)
  vimAsset.save()

  // Update market
  let market = MarketEntity.load(event.address.toHexString()) as MarketEntity

  updateMarket(
    event,
    market,
    [new TokenBalance(vimAsset.imAsset, market.id, vimAsset.totalSupply)],
    vimAsset.totalSupply
  )

  // create or update position
  let account = getOrCreateAccount(event.params.user)
  let accountLiquidity = getOrCreateLiquidity(vimAsset, event.params.user)
  accountLiquidity.balance = accountLiquidity.balance.minus(event.params.amount)
  accountLiquidity.save()

  let rewardTokenBalance = getRewardBalance(event.address, event.params.user)

  redeemFromMarket(
    event,
    account,
    market,
    event.params.amount,
    [new TokenBalance(vimAsset.imAsset, event.params.user.toHexString(), event.params.amount)],
    [],
    accountLiquidity.balance,
    [new TokenBalance(vimAsset.imAsset, event.params.user.toHexString(), accountLiquidity.balance)],
    [new TokenBalance(vimAsset.rewardToken, vimAsset.id, rewardTokenBalance)],
    null
  )
}