import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  InitializeCall
} from "../generated/fpmBTCHBTC/FeederPool"
import {
  FeederPool as FeederPoolEntity,
  Token as TokenEntity
} from "../generated/schema"
import {
  FeederPool as FeederPoolTemplate
} from "../generated/templates"
import {
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"


export function handleInitialize(call: InitializeCall): void {
  let fpmAssetAddress = Address.fromString("0x48c59199Da51B7E30Ea200a74Ea07974e62C4bA7")
  let fakeEvent = new ethereum.Event()
  fakeEvent.address = call.to
  fakeEvent.block = call.block

  let feederPool = new FeederPoolEntity(fpmAssetAddress.toHexString())
  feederPool.impl = call.to.toHexString()
  feederPool.mAsset = call.inputs._mAsset.addr.toHexString()
  feederPool.fAsset = call.inputs._fAsset.addr.toHexString()
  feederPool.mAssetBalance = BigInt.fromI32(0)
  feederPool.fAssetBalance = BigInt.fromI32(0)
  feederPool.totalSupply = BigInt.fromI32(0)
  feederPool.save()

  let inputTokens: TokenEntity[] = []
  let mToken = getOrCreateERC20Token(fakeEvent, call.inputs._mAsset.addr)
  let fToken = getOrCreateERC20Token(fakeEvent, call.inputs._fAsset.addr)
  inputTokens.push(mToken)
  inputTokens.push(fToken)
  let outputToken = getOrCreateERC20Token(fakeEvent, fpmAssetAddress)

  // Create market
  let market = getOrCreateMarket(
    fakeEvent,
    fpmAssetAddress,
    ProtocolName.MSTABLE,
    ProtocolType.EXCHANGE,
    inputTokens,
    outputToken,
    []
  )

  outputToken.mintedByMarket = market.id
  outputToken.save()

  // Create basket manager proxy listener
  FeederPoolTemplate.create(fpmAssetAddress)
}
