import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  Market as MarketEntity,
  MasterChef as MasterChefEntity,
  MCPoolInfo as MCPoolInfoEntity,
  MCUserInfo as MCUserInfoEntity
} from "../generated/schema";
import {
  AddCall,
  Deposit,
  EmergencyWithdraw,
  MassUpdatePoolsCall,
  OwnershipTransferred,
  SetBonusEndBlockCall,
  SetCall,
  SetSdtPerBlockCall,
  StakeDAOMasterChef,
  UpdatePoolCall,
  Withdraw
} from "../generated/StakeDAOMasterChef/StakeDAOMasterChef";
import {
  ADDRESS_ZERO,
  getOrCreateAccount,
  getOrCreateERC20Token,
  getOrCreateMarketWithId,
  investInMarket,
  redeemFromMarket,
  TokenBalance,
  updateMarket
} from "./common";
import { ProtocolName, ProtocolType } from "./constants";


let BONUS_MULTIPLIER: BigInt = BigInt.fromI32(2)
let oneE12: BigInt = BigInt.fromI32(10).pow(12)
let SDT_ADDRESS = "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F"

export function handleTransferOwnership(event: OwnershipTransferred): void {
  let masterChef = MasterChefEntity.load(event.address.toHexString())
  if (masterChef != null) {
    return
  }
  masterChef = new MasterChefEntity(event.address.toHexString())
  let contract = StakeDAOMasterChef.bind(event.address)
  masterChef.startBlock = contract.startBlock()
  masterChef.sdtPerBlock = contract.sdtPerBlock()
  masterChef.totalAllocPoint = contract.totalAllocPoint()
  masterChef.bonusEndBlock = contract.bonusEndBlock()
  masterChef.poolLength = BigInt.fromI32(0)
  masterChef.save()

  // Add zero pid pool manually to handle error in ABI decoder for add method inputs
  let token = getOrCreateERC20Token(event, Address.fromString("0x00000000b17640796e4c27a39Af51887aff3F8Dc"))
  let id = masterChef.id.concat("-").concat(masterChef.poolLength.toString())
  let poolInfo = new MCPoolInfoEntity(id)
  poolInfo.masterChef = masterChef.id
  poolInfo.lpToken = token.id
  poolInfo.lpTokenBalance = BigInt.fromI32(0)
  poolInfo.allocPoint = BigInt.fromI32(0)
  poolInfo.lastRewardBlock = BigInt.fromI32(0)
  poolInfo.accSdtPerShare = BigInt.fromI32(0)
  poolInfo.save()

  masterChef.poolLength = masterChef.poolLength.plus(BigInt.fromI32(1))
  masterChef.totalAllocPoint = masterChef.totalAllocPoint.plus(poolInfo.allocPoint)
  masterChef.save()
}

export function handleAdd(call: AddCall): void {
  let event = new ethereum.Event()
  event.block = call.block

  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  if (call.inputs._withUpdate) {
    updateAllPools(event, masterChef)
  }

  let token = getOrCreateERC20Token(event, call.inputs._lpToken)
  let sdt = getOrCreateERC20Token(event, Address.fromString(SDT_ADDRESS))

  let id = masterChef.id.concat("-").concat(masterChef.poolLength.toString())
  let poolInfo = new MCPoolInfoEntity(id)
  poolInfo.masterChef = masterChef.id
  poolInfo.lpToken = token.id
  poolInfo.lpTokenBalance = BigInt.fromI32(0)
  poolInfo.allocPoint = call.inputs._allocPoint
  poolInfo.lastRewardBlock = BigInt.fromI32(0)
  poolInfo.accSdtPerShare = BigInt.fromI32(0)
  poolInfo.save()

  masterChef.poolLength = masterChef.poolLength.plus(BigInt.fromI32(1))
  masterChef.totalAllocPoint = masterChef.totalAllocPoint.plus(poolInfo.allocPoint)
  masterChef.save()

  // Create market
  getOrCreateMarketWithId(
    event,
    poolInfo.id,
    call.to,
    ProtocolName.STAKE_DAO,
    ProtocolType.LP_FARMING,
    [token],
    null,
    [sdt]
  )
}

export function handleSet(call: SetCall): void {
  let event = new ethereum.Event()
  event.block = call.block
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  if (call.inputs._withUpdate) {
    updateAllPools(event, masterChef)
  }

  let id = masterChef.id.concat("-").concat(call.inputs._pid.toString())
  let poolInfo = MCPoolInfoEntity.load(id) as MCPoolInfoEntity

  masterChef.totalAllocPoint = masterChef.totalAllocPoint.minus(poolInfo.allocPoint).plus(call.inputs._allocPoint)
  masterChef.save()

  poolInfo.allocPoint = call.inputs._allocPoint
  poolInfo.save()
}

export function handleUpdatePool(call: UpdatePoolCall): void {
  let event = new ethereum.Event()
  event.block = call.block
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  let id = masterChef.id.concat("-").concat(call.inputs._pid.toString())
  let poolInfo = MCPoolInfoEntity.load(id) as MCPoolInfoEntity
  updatePool(event, masterChef, poolInfo)
}

export function handleMassUpdatePools(call: MassUpdatePoolsCall): void {
  let event = new ethereum.Event()
  event.block = call.block
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  updateAllPools(event, masterChef)
}

export function handleSetSdtPerBlock(call: SetSdtPerBlockCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  masterChef.sdtPerBlock = call.inputs._sdtPerBlock
  masterChef.save()
}

export function handleSetBonusEndBlock(call: SetBonusEndBlockCall): void {
  let masterChef = MasterChefEntity.load(call.to.toHexString()) as MasterChefEntity
  masterChef.bonusEndBlock = call.inputs._bonusEndBlock
  masterChef.save()
}

export function handleDeposit(event: Deposit): void {
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity
  let id = masterChef.id.concat("-").concat(event.params.pid.toString())
  let poolInfo = MCPoolInfoEntity.load(id) as MCPoolInfoEntity
  poolInfo = updatePool(event, masterChef, poolInfo)

  let uid = masterChef.id.concat("-").concat(event.params.user.toHexString())
  let userInfo = MCUserInfoEntity.load(uid)
  let pendingReward = BigInt.fromI32(0)
  if (userInfo == null) {
    userInfo = new MCUserInfoEntity(uid)
    userInfo.masterChef = masterChef.id
    userInfo.amount = BigInt.fromI32(0)
    userInfo.rewardDebt = BigInt.fromI32(0)
    userInfo.rewardEarned = BigInt.fromI32(0)
  } else if (userInfo.amount.gt(BigInt.fromI32(0))) {
    // Update market and position
    pendingReward = userInfo.amount.times(poolInfo.accSdtPerShare).div(oneE12).minus(userInfo.rewardDebt)
  }

  userInfo.amount = userInfo.amount.plus(event.params.amount)
  userInfo.rewardDebt = userInfo.amount.times(poolInfo.accSdtPerShare).div(oneE12)
  userInfo.rewardEarned = userInfo.rewardEarned.plus(pendingReward)
  userInfo.save()

  // update pool and market
  poolInfo.lpTokenBalance = poolInfo.lpTokenBalance.plus(event.params.amount)
  poolInfo.save()

  let market = MarketEntity.load(poolInfo.id) as MarketEntity
  updateMarket(
    event,
    market,
    [new TokenBalance(poolInfo.lpToken, masterChef.id, poolInfo.lpTokenBalance)],
    BigInt.fromI32(0)
  )

  let account = getOrCreateAccount(event.params.user)

  // update position
  investInMarket(
    event,
    account,
    market,
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, event.params.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, pendingReward)],
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, userInfo.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, userInfo.rewardEarned)],
    null
  )
}

export function handleWithdraw(event: Withdraw): void {
  if (event.params.amount.equals(BigInt.fromI32(0))) {
    return
  }
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity
  let id = masterChef.id.concat("-").concat(event.params.pid.toString())
  let poolInfo = MCPoolInfoEntity.load(id) as MCPoolInfoEntity
  poolInfo = updatePool(event, masterChef, poolInfo)

  let uid = masterChef.id.concat("-").concat(event.params.user.toHexString())
  let userInfo = MCUserInfoEntity.load(uid)
  if (userInfo == null) {
    return
  } else {
    userInfo = userInfo as MCUserInfoEntity
  }
  let pendingReward = userInfo.amount.times(poolInfo.accSdtPerShare).div(oneE12).minus(userInfo.rewardDebt)
  userInfo.amount = userInfo.amount.minus(event.params.amount)
  userInfo.rewardDebt = userInfo.amount.times(poolInfo.accSdtPerShare).div(oneE12)
  userInfo.rewardEarned = userInfo.rewardEarned.plus(pendingReward)
  userInfo.save()

  // update pool and market
  poolInfo.lpTokenBalance = poolInfo.lpTokenBalance.minus(event.params.amount)
  poolInfo.save()

  let market = MarketEntity.load(poolInfo.id) as MarketEntity
  updateMarket(
    event,
    market,
    [new TokenBalance(poolInfo.lpToken, masterChef.id, poolInfo.lpTokenBalance)],
    BigInt.fromI32(0)
  )

  let account = getOrCreateAccount(event.params.user)

  // update position
  redeemFromMarket(
    event,
    account,
    market,
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, event.params.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, pendingReward)],
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, userInfo.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, userInfo.rewardEarned)],
    null
  )
}

export function handleEmergencyWithdraw(event: EmergencyWithdraw): void {
  let masterChef = MasterChefEntity.load(event.address.toHexString()) as MasterChefEntity

  let id = masterChef.id.concat("-").concat(event.params.pid.toString())
  let poolInfo = MCPoolInfoEntity.load(id) as MCPoolInfoEntity

  let uid = masterChef.id.concat("-").concat(event.params.user.toHexString())
  let userInfo = MCUserInfoEntity.load(uid) as MCUserInfoEntity
  userInfo.amount = BigInt.fromI32(0)
  userInfo.rewardDebt = BigInt.fromI32(0)
  userInfo.save()

  // update market
  poolInfo.lpTokenBalance = poolInfo.lpTokenBalance.minus(event.params.amount)
  poolInfo.save()

  let market = MarketEntity.load(poolInfo.id) as MarketEntity
  updateMarket(
    event,
    market,
    [new TokenBalance(poolInfo.lpToken, masterChef.id, poolInfo.lpTokenBalance)],
    BigInt.fromI32(0)
  )

  let account = getOrCreateAccount(event.params.user)

  // update position
  redeemFromMarket(
    event,
    account,
    market,
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, event.params.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, BigInt.fromI32(0))],
    BigInt.fromI32(0),
    [new TokenBalance(poolInfo.lpToken, masterChef.id, userInfo.amount)],
    [new TokenBalance(SDT_ADDRESS, account.id, userInfo.rewardEarned)],
    null
  )
}

function updateAllPools(event: ethereum.Event, masterChef: MasterChefEntity): void {
  let length = masterChef.poolLength.toI32()
  for (let i = 0; i < length; i++) {

  }
}

function updatePool(event: ethereum.Event, masterChef: MasterChefEntity, poolInfo: MCPoolInfoEntity): MCPoolInfoEntity {
  let blockNumber = event.block.number
  if (blockNumber.le(poolInfo.lastRewardBlock)) {
    return poolInfo
  }

  poolInfo.lastRewardBlock = blockNumber

  if (poolInfo.lpTokenBalance.equals(BigInt.fromI32(0))) {
    poolInfo.save()
    return poolInfo
  }

  let multiplier = getMultiplier(masterChef, poolInfo, poolInfo.lastRewardBlock, blockNumber)
  let sdtReward = multiplier.times(masterChef.sdtPerBlock).times(poolInfo.allocPoint).div(masterChef.totalAllocPoint)
  poolInfo.accSdtPerShare = poolInfo.accSdtPerShare.plus(sdtReward.times(oneE12).div(poolInfo.lpTokenBalance))
  poolInfo.save()

  return poolInfo
}

function getMultiplier(masterChef: MasterChefEntity, poolInfo: MCPoolInfoEntity, from: BigInt, to: BigInt): BigInt {
  if (to.le(masterChef.bonusEndBlock)) {
    return to.minus(from).times(BONUS_MULTIPLIER)
  } else if (from.ge(masterChef.bonusEndBlock)) {
    return to.minus(from)
  } else {
    return masterChef.bonusEndBlock.minus(from).times(BONUS_MULTIPLIER).plus(to.minus(masterChef.bonusEndBlock))
  }
}