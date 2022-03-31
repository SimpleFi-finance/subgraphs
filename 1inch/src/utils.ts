import { Address, BigInt } from "@graphprotocol/graph-ts";

import { ERC20 } from "../generated/MooniswapFactory/ERC20";

import { Pair as PairEntity } from "../generated/schema";

import {
  ADDRESS_ETH,
  ETH_BALANCE_CONTRACT,
} from "./common"

/**
 * Account's balance of specific token
 *
 * @export
 * @class TokenBalance
 */
export class TokenBalance {
  tokenAddress: string;
  accountAddress: string;
  balance: BigInt;

  constructor(tokenAddress: string, accountAddress: string, balance: BigInt) {
    this.tokenAddress = tokenAddress;
    this.accountAddress = accountAddress;
    this.balance = balance;
  }

  // Does not modify this or b TokenBalance, return new TokenBalance
  add(b: TokenBalance): TokenBalance {
    if (this.tokenAddress == b.tokenAddress) {
      return new TokenBalance(this.tokenAddress, this.accountAddress, this.balance.plus(b.balance));
    } else {
      return this;
    }
  }

  toString(): string {
    return this.tokenAddress
      .concat("|")
      .concat(this.accountAddress)
      .concat("|")
      .concat(this.balance.toString());
  }

  static fromString(tb: string): TokenBalance {
    let parts = tb.split("|");
    let tokenAddress = parts[0];
    let accountAddress = parts[1];
    let balance = BigInt.fromString(parts[2]);
    return new TokenBalance(tokenAddress, accountAddress, balance);
  }
}

export function fetchReserves(pair: PairEntity): Array<BigInt> {
  
  let token0 = pair.token0.toLowerCase() == ADDRESS_ETH ? Address.fromString(ETH_BALANCE_CONTRACT) : Address.fromString(pair.token0)
  let token1 = pair.token1.toLowerCase() == ADDRESS_ETH ? Address.fromString(ETH_BALANCE_CONTRACT) : Address.fromString(pair.token1)
  let contract0 = ERC20.bind(token0)
  let contract1 = ERC20.bind(token1)
  let token0Call = contract0.try_balanceOf(Address.fromString(pair.id))
  let token1Call = contract1.try_balanceOf(Address.fromString(pair.id))

  let reserve0 = BigInt.fromI32(0)
  let reserve1 = BigInt.fromI32(0)
  if (!token0Call.reverted) {
    reserve0 = token0Call.value
  }

  if (!token1Call.reverted) {
    reserve1 = token1Call.value
  }

  return [reserve0, reserve1]
}
