import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts"
import {
  SetVaultCall,
  SetStrategyCall
} from "../generated/Controller/Controller"
import { Strategy } from "../generated/Controller/Strategy"
import {
  InvestmentToken as InvestmentTokenEntity,
  Strategy as StrategyEntity,
  Vault as VaultEntity
} from "../generated/schema"
import { getOrCreateERC20Token } from "./common"

function getOrCreateInvestmentToken(token: Address): InvestmentTokenEntity {
  let investmentToken = InvestmentTokenEntity.load(token.toHexString())
  if (investmentToken != null) {
    return investmentToken as InvestmentTokenEntity
  }

  investmentToken = new InvestmentTokenEntity(token.toHexString())
  investmentToken.save()
  return investmentToken as InvestmentTokenEntity
}

export function handleSetVault(call: SetVaultCall): void {
  let fakeEvent = new ethereum.Event()
  fakeEvent.block = call.block
  getOrCreateERC20Token(fakeEvent, call.inputs._token)

  let it = getOrCreateInvestmentToken(call.inputs._token)

  let vault = new VaultEntity(call.inputs._vault.toHexString())
  vault.token = it.id
  vault.balance = BigInt.fromI32(0)
  vault.save()
}

export function handleSetStrategy(call: SetStrategyCall): void {
  let fakeEvent = new ethereum.Event()
  fakeEvent.block = call.block
  getOrCreateERC20Token(fakeEvent, call.inputs._token)

  let it = getOrCreateInvestmentToken(call.inputs._token)

  let strategy = new StrategyEntity(call.inputs._strategy.toHexString())
  strategy.token = it.id
  strategy.name = Strategy.bind(call.inputs._strategy).getName()
  strategy.earned = BigInt.fromI32(0)
  strategy.balanceOfWant = BigInt.fromI32(0)
  strategy.balanceOfPool = BigInt.fromI32(0)
  strategy.save()
}