# Mstable #

## Version 3.0 ##

Uses Manager library contract at - 0x1e91f826fa8aa4fa4d3f595898af3a64dd188848 instead of BasketManager

### Events ###

`Minted(address indexed minter, address recipient, uint256 mAssetQuantity, address input, uint256 inputQuantity)`

`MintedMulti(address indexed minter, address recipient, uint256 mAssetQuantity, address[] inputs, uint256[] inputQuantities)`

`Swapped(address indexed swapper, address input, address output, uint256 outputAmount, uint256 scaledFee, address recipient)`

`Redeemed(address indexed redeemer, address recipient, uint256 mAssetQuantity, address output, uint256 outputQuantity, uint256 scaledFee)`

`RedeemedMulti(address indexed redeemer, address recipient, uint256 mAssetQuantity, address[] outputs, uint256[] outputQuantity, uint256 scaledFee)`
