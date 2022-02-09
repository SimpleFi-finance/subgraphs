import { near, BigInt, log, json, JSONValueKind } from "@graphprotocol/graph-ts"
import { handleNearReceipt } from "./nearCommon"

export function handleReceipt(
  receiptWithOutcome: near.ReceiptWithOutcome
): void {
  handleNearReceipt(receiptWithOutcome);

  // Logic to see if transaction is done and then trigger protocol specific function handler
}

/**
add_simple_pool(&mut self, tokens: Vec<ValidAccountId>, fee: u32) -> u64
 */ 
function addSimplePool(): void {

}

/**
add_stable_swap_pool(
  &mut self,
  tokens: Vec<ValidAccountId>,
  decimals: Vec<u8>,
  fee: u32,
  amp_factor: u64,
) -> u64
 */
function addStableSwapPool(): void {

}

/**
execute_actions(
  &mut self,
  actions: Vec<Action>,
  referral_id: Option<ValidAccountId>,
) -> ActionResult
 */
function executeActions(): void {

}

/**
add_liquidity(
  &mut self,
  pool_id: u64,
  amounts: Vec<U128>,
  min_amounts: Option<Vec<U128>>,
)
 */
function addLiquidity(): void {

}

/**
add_stable_liquidity(
  &mut self,
  pool_id: u64,
  amounts: Vec<U128>,
  min_shares: U128,
) -> U128
 */
function addStableLiquidity(): void {

}

/**
remove_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>)
 */
function removeLiquidity(): void {

}

/**
remove_liquidity_by_tokens(
  &mut self, pool_id: u64, 
  amounts: Vec<U128>, 
  max_burn_shares: U128
) -> U128
 */
function removeLiquidityByTokens(): void {

}

/**
swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<ValidAccountId>) -> U128
 */
function swap(): void {

}