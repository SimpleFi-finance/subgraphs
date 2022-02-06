import {AddVaultAndStrategyCall, DoHardWorkCall} from "../generated/HarvestEthController/HarvestEthController";
import { Market } from "../generated/schema";
import { ADDRESS_ZERO, getOrCreateAccount, getOrCreateERC20Token, getOrCreateMarket, investInMarket, redeemFromMarket, TokenBalance, updateMarket } from "./common";
import { FARM_TOKEN_ADDRESS, ProtocolName, ProtocolType } from "./constants";
import { IERC20, Transfer } from "../generated/HarvestEthController/IERC20";
import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";

import { Vault } from '../generated/templates'
import { Vault as VaultContract } from "../generated/templates/Vault/Vault";


export function addVaultAndStrategy(add: AddVaultAndStrategyCall): void {
  
  let fAssetToken = IERC20.bind(add.inputs._vault);
  let underlying = fAssetToken.try_underlying();
  if(underlying.reverted) {
    return;
  }

  // output
  let fAssetTokenERC20 = getOrCreateERC20Token(add.block, add.inputs._vault);

  // input
  let assetERC20 = getOrCreateERC20Token(add.block, underlying.value);

  // reward
  let farmERC20 = getOrCreateERC20Token(add.block, FARM_TOKEN_ADDRESS);
  
  let market = getOrCreateMarket(
    add.block,
    add.inputs._vault,
    ProtocolName.HARVEST_FINANCE,
    ProtocolType.LP_FARMING,
    [assetERC20], // Asset
    fAssetTokenERC20, // fAsset
    [farmERC20], // FARM
  )

  Vault.create(add.inputs._vault);
}

// update fAsset - mint/burn/transfer of users
export function handleTransfer(event: Transfer): void {
  let vault = event.address.toHexString();
  let market = Market.load(vault) as Market;
  
  let contract = VaultContract.bind(event.address);

  let pricePerShareResponse = contract.try_getPricePerFullShare();
  if(pricePerShareResponse.reverted) {
    return;
  }
  let pricePerShare = pricePerShareResponse.value;

  let underlyingUnitResponse = contract.try_underlyingUnit();
  if(underlyingUnitResponse.reverted) {
    return;
  }
  let underlyingUnit = underlyingUnitResponse.value;

  let outputTokenBalanceResponse = contract.try_balanceOf(event.params.to);
  if(outputTokenBalanceResponse.reverted) {
    return;
  }
  let outputTokenBalance = outputTokenBalanceResponse.value;

  let inputTokenAmount = event.params.value.times(pricePerShare).div(underlyingUnit);
  let inputTokenBalance = outputTokenBalance.div(pricePerShare).times(underlyingUnit)

  let inputTokenAmounts: TokenBalance[] = [
    new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenAmount)
  ];
  
  // nothing claimed on deposit
  let rewardTokenAmounts: TokenBalance[] = [];
  let rewardTokenBalances: TokenBalance[] = [];


  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(market.inputTokens[0], event.params.to.toHexString(), inputTokenBalance)
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

    updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);

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

    updateMarket(event, market, inputTokenBalances, market.outputTokenTotalSupply);
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

export function handleDoHardWork(call: DoHardWorkCall): void {
  // create fake event
  let transaction = new ethereum.Transaction(
    call.block.hash,
    BigInt.fromI32(0),
    call.from,
    call.to,
    BigInt.fromI32(0),
    BigInt.fromI32(0),
    BigInt.fromI32(0),
    Bytes.empty()
  );

  let fakeEvent = new ethereum.Event(
    call.to,
    BigInt.fromI32(0),
    BigInt.fromI32(0),
    null,
    call.block,
    transaction,
    []
  );
  
  

  let market = Market.load(call.to.toHexString()) as Market;
  let contract = VaultContract.bind(call.to);
  let addressERC20InputResponse = contract.try_underlying();
  if(addressERC20InputResponse.reverted) {
    return;
  }
  let addressERC20Input = addressERC20InputResponse.value;

  let pricePerShareResponse = contract.try_getPricePerFullShare();
  if(pricePerShareResponse.reverted)  {
    return;
  }
  let pricePerShare = pricePerShareResponse.value;
  
  let underlyingUnitResponse = contract.try_underlyingUnit();
  if(underlyingUnitResponse.reverted) {
    return;
  }
  let underlyingUnit = underlyingUnitResponse.value;

  let outputTokenBalance = market.outputTokenTotalSupply;
  let inputTokenBalance = outputTokenBalance.div(pricePerShare).times(underlyingUnit);

  let inputTokenBalances: TokenBalance[] = [
    new TokenBalance(addressERC20Input.toHexString(), call.to.toHexString(), inputTokenBalance)
  ];

  updateMarket(fakeEvent, market, inputTokenBalances, market.outputTokenTotalSupply);
}
