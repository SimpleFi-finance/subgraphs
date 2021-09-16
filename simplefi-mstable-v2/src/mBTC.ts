import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  InitializeCall
} from "../generated/MBTC/MAsset"
import {
  MAsset as MAssetEntity,
  Token as TokenEntity
} from "../generated/schema"
import {
  MAsset as MAssetTemplate
} from "../generated/templates"
import {
  ADDRESS_ZERO,
  getOrCreateERC20Token,
  getOrCreateMarket,
  TokenBalance
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"


export function handleInitialize(call: InitializeCall): void {
  let mAssetAddress = Address.fromString("0x945Facb997494CC2570096c74b5F66A3507330a1")
  let fakeEvent = new ethereum.Event()
  fakeEvent.address = call.to
  fakeEvent.block = call.block

  let mAsset = new MAssetEntity(mAssetAddress.toHexString())
  let forgeValidator = call.inputs._forgeValidator
  let bAssetsData = call.inputs._bAssets

  mAsset.impl = call.to.toHexString()
  mAsset.basketManager = ADDRESS_ZERO
  mAsset.forgeValidator = forgeValidator.toHexString()
  mAsset.swapFee = BigInt.fromI32(0)

  let bAssets: string[] = []
  let inputTokens: TokenEntity[] = []
  let bAssetBalances: TokenBalance[] = []
  for (let i = 0; i < bAssetsData.length; i++) {
    let bAsset = bAssetsData[i]
    let token = getOrCreateERC20Token(fakeEvent, bAsset.addr)
    bAssets.push(bAsset.addr.toHexString())
    inputTokens.push(token)
    bAssetBalances.push(new TokenBalance(bAsset.addr.toHexString(), mAsset.id, BigInt.fromI32(0)))
  }
  let bAssetBalancesString = bAssetBalances.map<string>(tb => tb.toString())

  mAsset.bAssets = bAssets
  mAsset.bAssetBalances = bAssetBalancesString
  mAsset.totalSupply = BigInt.fromI32(0)
  mAsset.save()

  let outputToken = getOrCreateERC20Token(fakeEvent, mAssetAddress)

  // Create market
  getOrCreateMarket(
    fakeEvent,
    mAssetAddress,
    ProtocolName.MSTABLE,
    ProtocolType.STABLECOIN,
    inputTokens,
    outputToken,
    []
  )

  // Create basket manager proxy listener
  MAssetTemplate.create(mAssetAddress)
}
