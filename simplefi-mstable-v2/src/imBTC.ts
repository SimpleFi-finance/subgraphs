import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  IMAsset,
  InitializeCall
} from "../generated/iMBTC/IMAsset"
import {
  IMAsset as IMAssetEntity
} from "../generated/schema"
import {
  IMAsset as IMAssetTemplate
} from "../generated/templates"
import {
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"


export function handleInitialize(call: InitializeCall): void {
  let imAssetAddress = Address.fromString("0x17d8CBB6Bce8cEE970a4027d1198F6700A7a6c24")
  let fakeEvent = new ethereum.Event()
  fakeEvent.address = call.to
  fakeEvent.block = call.block

  let contract = IMAsset.bind(imAssetAddress)
  let mBTC = contract.underlying()

  let imAsset = new IMAssetEntity(imAssetAddress.toHexString())
  imAsset.mAsset = mBTC.toHexString()
  imAsset.totalSavings = BigInt.fromI32(0)
  imAsset.totalSupply = BigInt.fromI32(0)
  imAsset.exchangeRate = BigInt.fromI32(10)
  imAsset.save()

  let inputToken = getOrCreateERC20Token(fakeEvent, mBTC)
  let outputToken = getOrCreateERC20Token(fakeEvent, imAssetAddress)

  // Create market
  getOrCreateMarket(
    fakeEvent,
    imAssetAddress,
    ProtocolName.MSTABLE,
    ProtocolType.TOKEN_MANAGEMENT,
    [inputToken],
    outputToken,
    []
  )

  // Create basket manager proxy listener
  IMAssetTemplate.create(imAssetAddress)
}
