import { BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  SetVaultCall
} from "../generated/StakeDAOController/StakeDAOController"
import {
  Vault as VaultEntity,
  VaultInputToken as VaultInputTokenEntity
} from "../generated/schema"
import { 
  getOrCreateERC20Token,
  getOrCreateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"
import { StakeDAOVault, StakeDAOVaultInputToken } from "../generated/templates"

export function handleSetVault(call: SetVaultCall): void {
  let fakeEvent = new ethereum.Event()
  fakeEvent.block = call.block
  let token = getOrCreateERC20Token(fakeEvent, call.inputs._token)
  let vaultToken = getOrCreateERC20Token(fakeEvent, call.inputs._vault)

  let vault = new VaultEntity(call.inputs._vault.toHexString())
  vault.token = token.id
  vault.controller = call.to.toHexString()
  vault.balance = BigInt.fromI32(0)
  vault.totalSupply = BigInt.fromI32(0)
  vault.save()

  let vaultInputToken = new VaultInputTokenEntity(token.id)
  vaultInputToken.vault = vault.id
  vaultInputToken.save()
  
  // Create market
  getOrCreateMarket(
    fakeEvent,
    call.inputs._vault,
    ProtocolName.STAKE_DAO,
    ProtocolType.TOKEN_MANAGEMENT,
    [token],
    vaultToken,
    []
  )

  StakeDAOVault.create(call.inputs._vault)
  StakeDAOVaultInputToken.create(call.inputs._token)
}
