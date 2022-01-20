import {AddVaultAndStrategyCall} from "../generated/HarvestEthController/HarvestEthController";
import { Market } from "../generated/schema";
import { ADDRESS_ZERO, getOrCreateAccount, getOrCreateERC20Token, getOrCreateMarket, investInMarket, redeemFromMarket, TokenBalance } from "./common";
import { ProtocolName, ProtocolType } from "./constants";
import { IERC20, Transfer } from "../generated/templates/RewardToken/IERC20";
import { Address } from "@graphprotocol/graph-ts";

import { Vault } from '../generated/templates'
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";


export function addVaultAndStrategy(add: AddVaultAndStrategyCall): void {
  
  let fAssetToken = IERC20.bind(add.inputs._vault);
  let underlying = fAssetToken.try_underlying();
  if(underlying.reverted) {
    return;
  }
  let assetToken = IERC20.bind(underlying.value);
  let farmToken = IERC20.bind(Address.fromString("0xa0246c9032bc3a600820415ae600c6388619a14d"));

  // output
  let fAssetTokenERC20 = getOrCreateERC20Token(add.block, add.inputs._vault);
  fAssetTokenERC20.save();

  // input
  let assetERC20 = getOrCreateERC20Token(add.block, assetToken._address);
  assetERC20.save();

  // reward
  let farmERC20 = getOrCreateERC20Token(add.block, farmToken._address);
  farmERC20.save();
  
  let market = getOrCreateMarket(
    add.block,
    add.inputs._vault,
    ProtocolName.HARVEST_FINANCE,
    ProtocolType.LP_FARMING,
    [assetERC20], // Asset
    fAssetTokenERC20, // fAsset
    [farmERC20], // FARM
  )

  market.save();

  Vault.create(add.inputs._vault);
}

// update fAsset - mint/burn/transfer of users
export function handleTransfer(event: Transfer): void {
  let vault = event.address.toHexString();
  let market = Market.load(vault) as Market;
  
  let contract = VaultContract.bind(event.address);
  let addressERC20Input = contract.underlying();
  let pricePerShare = contract.getPricePerFullShare();
  let underlyingUnit = contract.underlyingUnit();

  let inputTokenAmount = event.params.value.times(pricePerShare).div(underlyingUnit);
  let outputTokenBalance = contract.balanceOf(event.params.to);
  let inputTokenBalance = outputTokenBalance.div(pricePerShare).times(underlyingUnit)

  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(addressERC20Input.toHexString(), event.params.to.toHexString(), inputTokenAmount)
  ];
  
  // nothing claimed on deposit
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokenBalances: TokenBalance[] = [];


  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(addressERC20Input.toHexString(), event.params.to.toHexString(), inputTokenBalance)
  ];

  let outputTokenAmount = event.params.value;
  if(event.params.from.toHexString() == ADDRESS_ZERO) {
    // mint fAsset / deposit / investInMarket
    let receiver = getOrCreateAccount(event.params.to);    
    investInMarket(
      event,
      receiver,
      market,
      outputTokenAmount,
      inputTokenAmounts,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances,
      null
    );

  } else if(event.params.to.toHexString() == ADDRESS_ZERO) {
    // burn fAsset / withdraw / redeemFromMarket
    let sender = getOrCreateAccount(event.params.from);
    redeemFromMarket(
      event,
      sender,
      market,
      outputTokenAmount,
      inputTokenAmounts,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances,
      null
    )
  } else {
    // simple transfer
    let sender = getOrCreateAccount(event.params.from);
    redeemFromMarket(
      event,
      sender,
      market,
      outputTokenAmount,
      inputTokenAmounts,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances,
      null
    );

    let receiver = getOrCreateAccount(event.params.to);    
    investInMarket(
      event,
      receiver,
      market,
      outputTokenAmount,
      inputTokenAmounts,
      rewardTokenAmounts,
      outputTokenBalance,
      inputTokenBalances,
      rewardTokenBalances,
      null
    );
  }


}