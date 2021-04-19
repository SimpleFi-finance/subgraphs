import { AddressesProviderRegistered } from '../generated/ILendingPoolAddressesProviderRegistry/ILendingPoolAddressesProviderRegistry'
import { ILendingPoolAddressesProvider as ILendingPoolAddressesProviderTemplate } from '../generated/templates'

export function handleAddressesProviderRegistered(
  event: AddressesProviderRegistered,
): void {
  ILendingPoolAddressesProviderTemplate.create(event.params.newAddress)
}
