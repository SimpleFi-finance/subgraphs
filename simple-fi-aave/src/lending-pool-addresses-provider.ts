import {
  AddressSet,
  LendingPoolConfiguratorUpdated,
  LendingPoolUpdated,
  ProxyCreated,
} from '../generated/templates/ILendingPoolAddressesProvider/ILendingPoolAddressesProvider'
import { AaveProtocolDataProvider } from '../generated/templates/ILendingPoolAddressesProvider/AaveProtocolDataProvider'
import {
  ILendingPool as ILendingPoolTemplate,
  ILendingPoolConfigurator as ILendingPoolConfiguratorTemplate,
} from '../generated/templates'
import { Asset } from '../generated/schema'
import { DERIVATIVE, RESERVE } from './constants'

const LENDING_POOL_CONFIGURATOR = 'LENDING_POOL_CONFIGURATOR'
const LENDING_POOL = 'LENDING_POOL'

/**
 * Aave uses upgradable smart contract proxies to interact with its main
 * contracts. Any events emitted will look as their came from the proxy contract
 * rather than the main contract. As such, we need to register the proxy
 * contract as a data source of its implementation.
 */
export function handleProxyCreated(event: ProxyCreated): void {
  let proxyType = event.params.id.toString()
  if (proxyType == LENDING_POOL_CONFIGURATOR) {
    ILendingPoolConfiguratorTemplate.create(event.params.newAddress)
  } else if (proxyType == LENDING_POOL) {
    ILendingPoolTemplate.create(event.params.newAddress)
  }
}

/**
 * An Aave lending pool is a pool that comprises of all Aave tokens that are
 * backed by reserve assets. This should not be confused with SimpleFI's
 * definition of a lending pool, which is one token/pair/group per pool.
 *
 * For example, aUSDT, aUSDC, aDAI are separate pools from SimpleFi's POV.
 */
export function handleLendingPoolUpdated(event: LendingPoolUpdated): void {
  ILendingPoolTemplate.create(event.params.newAddress)
}

export function handleLendingPoolConfiguratorUpdated(
  event: LendingPoolConfiguratorUpdated,
): void {
  ILendingPoolConfiguratorTemplate.create(event.params.newAddress)
}

export function handleAddressSet(event: AddressSet): void {
  let id = event.params.id.toString()
  if (id == '0x1' /* protocol data provider */) {
    let aaveProtocolDataProvider = AaveProtocolDataProvider.bind(
      event.params.newAddress,
    )
    let reserveTokensData = aaveProtocolDataProvider.getAllReservesTokens()
    let aaveTokensData = aaveProtocolDataProvider.getAllATokens()

    for (let i = 0; i < reserveTokensData.length; i++) {
      let reserveTokenData = reserveTokensData[i]
      let reserve = Asset.load(reserveTokenData.tokenAddress.toHexString())
      if (!reserve) {
        reserve = new Asset(reserveTokenData.tokenAddress.toHexString())
        reserve.createdAt = event.block.timestamp.toI32()
      }
      reserve.assetType = RESERVE
      // TOD0: Fix this because it is always null
      reserve.symbol = reserveTokenData.symbol
      reserve.updatedAt = event.block.timestamp.toI32()

      reserve.save()
    }

    for (let i = 0; i < aaveTokensData.length; i++) {
      let aaveTokenData = aaveTokensData[i]
      let aToken = Asset.load(aaveTokenData.tokenAddress.toHexString())
      if (!aToken) {
        aToken = new Asset(aaveTokenData.tokenAddress.toHexString())
        aToken.createdAt = event.block.timestamp.toI32()
      }
      aToken.assetType = DERIVATIVE
      // TOD0: Fix this because it is always null
      aToken.symbol = aaveTokenData.symbol
      aToken.updatedAt = event.block.timestamp.toI32()

      aToken.save()
    }
  }
}
