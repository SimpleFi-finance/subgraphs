import { Market } from "../../generated/schema";
import { Mint } from "../../generated/templates/CToken/CToken";
import { TokenBalance, updateMarket } from "../library/common";

export function handleMint(event: Mint): void {
  let cToken = event.address.toHexString();

  let underlyingTokensProvided = event.params.mintAmount;
  let cTokensMinted = event.params.mintTokens;
  let minter = event.params.minter;

  let market = Market.load(cToken) as Market;

  // update market total supply
  let inputTokens = market.inputTokens as string[];
  let prevInputTokenBalances = market.inputTokenTotalBalances as string[];
  let prevInputBalance = TokenBalance.fromString(prevInputTokenBalances[0]).balance;
  let newInputBalance = prevInputBalance.plus(underlyingTokensProvided);
  let newInputTokenBalances: TokenBalance[] = [
    new TokenBalance(inputTokens[0], market.id, newInputBalance),
  ];

  let prevTotalSupply = market.outputTokenTotalSupply;
  let newTotalSupply = prevTotalSupply.plus(cTokensMinted);

  updateMarket(event, market, newInputTokenBalances, newTotalSupply);
}
