import { BigInt, json, JSONValue, near } from "@graphprotocol/graph-ts";
import { parseNullableJSONAtrribute } from "../common";
import { executeSwapAction, SwapAction } from "./exchange";

/**
fn ft_on_transfer(
  &mut self,
  sender_id: ValidAccountId,
  amount: U128,
  msg: String,
) -> PromiseOrValue<U128>
 */
export function ftOnTransfer(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const args = json.fromBytes(functionCall.args).toObject();
  const msg = (args.get("msg") as JSONValue).toString();

  if (msg == "") {
    return
  }

  const msgArgs = json.fromString(msg).toObject();
  const actions = (msgArgs.get("actions") as JSONValue).toArray().map<SwapAction>(jv => new SwapAction(jv));
  const referralId: string | null = parseNullableJSONAtrribute<string>(
    msgArgs, 
    "referral_id",
    (jv) => jv.toString()
  );
  let result: BigInt | null = null;

  for (let i = 0; i < actions.length; i++) {
    actions[i].amountIn = actions[i].amountIn ? actions[i].amountIn : result;
    actions[i].referralId = referralId;
    result = executeSwapAction(actions[i], receipt, outcome, block);
  }
}