import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  Market as MarketEntity,
  Vault as VaultEntity,
  VaultInputToken as VaultInputTokenEntity,
  VaultList as VaultListEntity
} from "../generated/schema"
import {
  SetVaultCall
} from "../generated/StakeDAOController/StakeDAOController"
import { StakeDAOVault as StakeDAOVaultContract } from "../generated/StakeDAOController/StakeDAOVault"
import { StakeDAOVault, StakeDAOVaultInputToken } from "../generated/templates"
import {
  getOrCreateERC20Token,
  getOrCreateMarket,
  TokenBalance,
  updateMarket
} from "./common"
import { ProtocolName, ProtocolType } from "./constants"

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

  let vaultList = getOtCreateVaultList()
  let vaults = vaultList.vaults
  vaults.push(vault.id)
  vaultList.vaults = vaults
  vaultList.save()

  StakeDAOVault.create(call.inputs._vault)
  StakeDAOVaultInputToken.create(call.inputs._token)
}

export function handleBlock(block: ethereum.Block): void {
  let fakeEvent = new ethereum.Event()
  fakeEvent.block = block
  let transaction = new ethereum.Transaction()
  transaction.hash = block.hash
  fakeEvent.transaction = transaction
  fakeEvent.logIndex = block.number

  let vaultList = getOtCreateVaultList()
  let vaults = vaultList.vaults
  for (let i = 0; i < vaults.length; i = i + 1) {
    let vault = VaultEntity.load(vaults[i]) as VaultEntity
    let contract = StakeDAOVaultContract.bind(Address.fromString(vault.id))
    vault.controller = contract.controller().toHexString()
    vault.balance = contract.balance()
    vault.totalSupply = contract.totalSupply()
    vault.save()

    let market = MarketEntity.load(vault.id) as MarketEntity
    updateMarket(
      fakeEvent,
      market,
      [new TokenBalance(vault.token, vault.id, vault.balance)],
      vault.totalSupply
    )
  }
}

function getOtCreateVaultList(): VaultListEntity {
  let vaultList = VaultListEntity.load("VAULTLIST")
  if (vaultList != null) {
    return vaultList as VaultListEntity
  }
  vaultList = new VaultListEntity("VAULTLIST")
  vaultList.vaults = []
  vaultList.save()
  return vaultList as VaultListEntity
}