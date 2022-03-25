import { BigInt } from "@graphprotocol/graph-ts";

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
