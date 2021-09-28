import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  CreditsRedeemed,
  ExchangeRateUpdated,
  SavingsDeposited
} from "../generated/iMBTC/IMAsset";
import {
  AccountLiquidityIMAsset as AccountLiquidityIMAssetEntity,
  IMAsset as IMAssetEntity,
  Market as MarketEntity
} from "../generated/schema";
import {
  getOrCreateAccount,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common";


function updateIMAsset(
  event: ethereum.Event,
  imAsset: IMAssetEntity,
  totalSavings: BigInt,
  totalSupply: BigInt,
  exchangeRate: BigInt
): IMAssetEntity {
  imAsset.totalSavings = totalSavings
  imAsset.totalSupply = totalSupply
  imAsset.exchangeRate = exchangeRate
  imAsset.save()

  // Update Market
  let market = MarketEntity.load(imAsset.id) as MarketEntity
  updateMarket(
    event,
    market,
    [new TokenBalance(imAsset.mAsset, market.id, totalSavings)],
    totalSupply
  )

  return imAsset
}

function getOrCreateLiquidity(imAsset: IMAssetEntity, accountAddress: Address): AccountLiquidityIMAssetEntity {
  let id = imAsset.id.concat("-").concat(accountAddress.toHexString())
  let liqudity = AccountLiquidityIMAssetEntity.load(id)
  if (liqudity != null) {
    return liqudity as AccountLiquidityIMAssetEntity
  }
  liqudity = new AccountLiquidityIMAssetEntity(id)
  liqudity.imAsset = imAsset.id
  liqudity.account = getOrCreateAccount(accountAddress).id
  liqudity.balance = BigInt.fromI32(0)
  liqudity.save()
  return liqudity as AccountLiquidityIMAssetEntity
}

export function handleEchangeRateUpdated(event: ExchangeRateUpdated): void {
  let imAsset = IMAssetEntity.load(event.address.toHexString()) as IMAssetEntity
  let totalSavings = imAsset.totalSavings.plus(event.params.interestCollected)
  let exchangeRate = event.params.newExchangeRate
  updateIMAsset(
    event,
    imAsset,
    totalSavings,
    imAsset.totalSupply,
    exchangeRate
  )
}

export function handleSavingDeposited(event: SavingsDeposited): void {
  // update market
  let imAsset = IMAssetEntity.load(event.address.toHexString()) as IMAssetEntity
  let totalSavings = imAsset.totalSavings.plus(event.params.savingsDeposited)
  let totalSupply = imAsset.totalSupply.plus(event.params.creditsIssued)
  imAsset = updateIMAsset(
    event,
    imAsset,
    totalSavings,
    totalSupply,
    imAsset.exchangeRate
  )

  // Create position
  let account = getOrCreateAccount(event.params.saver)
  let accountLiquidity = getOrCreateLiquidity(imAsset, event.params.saver)
  accountLiquidity.balance = accountLiquidity.balance.plus(event.params.creditsIssued)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let inputTokenBalance = accountLiquidity.balance.times(imAsset.exchangeRate)
  inputTokenBalances.push(new TokenBalance(imAsset.mAsset, account.id, inputTokenBalance))

  let market = MarketEntity.load(imAsset.id) as MarketEntity

  investInMarket(
    event,
    account,
    market,
    event.params.creditsIssued,
    [new TokenBalance(imAsset.mAsset, account.id, event.params.savingsDeposited)],
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}

export function handleCreditsRedeemed(event: CreditsRedeemed): void {
  let imAsset = IMAssetEntity.load(event.address.toHexString()) as IMAssetEntity
  let totalSavings = imAsset.totalSavings.minus(event.params.savingsCredited)
  let totalSupply = imAsset.totalSupply.minus(event.params.creditsRedeemed)
  imAsset = updateIMAsset(
    event,
    imAsset,
    totalSavings,
    totalSupply,
    imAsset.exchangeRate
  )

  // Create position
  let account = getOrCreateAccount(event.params.redeemer)
  let accountLiquidity = getOrCreateLiquidity(imAsset, event.params.redeemer)
  accountLiquidity.balance = accountLiquidity.balance.minus(event.params.creditsRedeemed)
  accountLiquidity.save()

  let inputTokenBalances: TokenBalance[] = []
  let inputTokenBalance = accountLiquidity.balance.times(imAsset.exchangeRate)
  inputTokenBalances.push(new TokenBalance(imAsset.mAsset, account.id, inputTokenBalance))

  let market = MarketEntity.load(imAsset.id) as MarketEntity

  redeemFromMarket(
    event,
    account,
    market,
    event.params.creditsRedeemed,
    [new TokenBalance(imAsset.mAsset, account.id, event.params.savingsCredited)],
    [],
    accountLiquidity.balance,
    inputTokenBalances,
    [],
    null
  )
}
