import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  VIMAsset as VIMAssetEntity
} from "../generated/schema"
import {
  VIMAsset as VIMAssetTemplate
} from "../generated/templates"
import {
  InitializeCall,
  VIMAsset
} from "../generated/viMBTC/VIMAsset"
import {
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"


export function handleInitialize(call: InitializeCall): void {
  let vimAssetAddress = Address.fromString("0xF38522f63f40f9Dd81aBAfD2B8EFc2EC958a3016")
  let fakeEvent = new ethereum.Event()
  fakeEvent.address = call.to
  fakeEvent.block = call.block

  let contract = VIMAsset.bind(vimAssetAddress)
  let imBTC = contract.stakingToken()
  let mta = contract.rewardsToken()

  let vimAsset = new VIMAssetEntity(vimAssetAddress.toHexString())
  vimAsset.imAsset = imBTC.toHexString()
  vimAsset.rewardToken = mta.toHexString()
  vimAsset.imAssetBalance = BigInt.fromI32(0)
  vimAsset.rewardBalance = BigInt.fromI32(0)
  vimAsset.totalSupply = BigInt.fromI32(0)
  vimAsset.save()

  let inputToken = getOrCreateERC20Token(fakeEvent, imBTC)
  let outputToken = getOrCreateERC20Token(fakeEvent, vimAssetAddress)
  let rewardToken = getOrCreateERC20Token(fakeEvent, mta)

  // Create market
  let market = getOrCreateMarket(
    fakeEvent,
    vimAssetAddress,
    ProtocolName.MSTABLE,
    ProtocolType.TOKEN_MANAGEMENT,
    [inputToken],
    outputToken,
    [rewardToken]
  )

  outputToken.mintedByMarket = market.id
  outputToken.save()

  // Create basket manager proxy listener
  VIMAssetTemplate.create(vimAssetAddress)
}

