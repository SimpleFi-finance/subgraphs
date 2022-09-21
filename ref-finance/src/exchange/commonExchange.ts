import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { Share } from "../../generated/schema";
import { parseNullableJSONAtrribute } from "../common";


export function getOrCreateShare(accountId: string, poolId: string): Share {
  const sahreId = accountId.concat("-").concat(poolId);
  let share = Share.load(sahreId);
  if (share == null) {
    share = new Share(sahreId);
    share.accountId = accountId;
    share.poolId = poolId;
    share.amount = BigInt.fromI32(0);
    share.save();
  }

  return share as Share;
}

export class SwapAction {
  poolId: BigInt
  tokenIn: string
  amountIn: BigInt | null
  tokenOut: string
  referralId: string | null

  constructor(jv: JSONValue) {
    const obj = jv.toObject();
    this.poolId = (obj.get("pool_id") as JSONValue).toBigInt();
    this.tokenIn = (obj.get("token_in") as JSONValue).toString();
    this.amountIn = parseNullableJSONAtrribute<BigInt>(
      obj,
      "amount_in",
      (jv) => BigInt.fromString(jv.toString())
    );
    this.tokenOut = (obj.get("token_out") as JSONValue).toString();
    this.referralId = null;
  }

  toString(): string {
    const ai = this.amountIn;
    const as = ai ? ai.toString() : "null";
    const ri = this.referralId;
    const rs = ri ? ri : "null";
    return this.poolId.toString().concat("|").concat(this.tokenIn).concat("|").concat(as).concat("|").concat(this.tokenOut).concat("|").concat(rs);
  }
}