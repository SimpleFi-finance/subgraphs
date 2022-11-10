import { BigInt, log, near } from "@graphprotocol/graph-ts";
import { Deployment } from "../generated/schema";
import { callbackPostWithdrawFTSeed, callbackPostWithdrawMFTSeed, claimRewardByFarm, claimRewardBySeed, createSimpleFarm, initFarm, removeUserRPSByFarm, withdrawSeed } from "./farm/farm";
import { ftOnTransfer, mftOnTransfer } from "./farm/tokenReceiver";


export function handleReceipt(
  receiptWithOutcome: near.ReceiptWithOutcome
): void {
  const receipt = receiptWithOutcome.receipt;
  const outcome = receiptWithOutcome.outcome;
  const block = receiptWithOutcome.block;
  const actions = receipt.actions;

  // debugNEARLogs(receipt, outcome, block);

  for (let i = 0; i < actions.length; i++) {
    handleAction(
      actions[i],
      receipt,
      outcome,
      block
    );
  }
}

function debugNEARLogs(
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  log.info("****************** Receipt ID {} Start ***********************", [receipt.id.toBase58()]);

  log.info("Receipt data -> id: {}, predecessorId: {}, receiverId: {}, signerId: {}", [
    receipt.id.toBase58(),
    receipt.predecessorId,
    receipt.receiverId,
    receipt.signerId
  ]);

  const actions = receipt.actions;
  for (let i = 0; i < actions.length; i++) {
    log.info("Receipt actions: kind: {}, data: {}", [actions[i].kind.toString(), actions[i].data.toString()]);
  }

  const inputDataIds = receipt.inputDataIds;
  for (let i = 0; i < inputDataIds.length; i++) {
    log.info("Receipt input data id: {}", [inputDataIds[i].toBase58()]);
  }

  const outputDataReceivers = receipt.outputDataReceivers;
  for (let i = 0; i < outputDataReceivers.length; i++) {
    log.info("Receipt output data receiver id: {}", [outputDataReceivers[i].receiverId]);
  }

  log.info("Outcome data -> blockHash: {}, id: {}, executorId: {}", [
    outcome.blockHash.toBase58(),
    outcome.id.toBase58(),
    outcome.executorId
  ]);

  const logs = outcome.logs;
  for (let i = 0; i < logs.length; i++) {
    log.info("Outcome logs: {}", [logs[i].toString()]);
  }

  const receiptIds = outcome.receiptIds;
  for (let i = 0; i < receiptIds.length; i++) {
    log.info("Outcome receiptIds: {}", [receiptIds[i].toBase58()]);
  }

  log.info("****************** Receipt ID {} End ***********************", [receipt.id.toBase58()]);
}

function handleAction(
  action: near.ActionValue,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {

  if (action.kind == near.ActionKind.CREATE_ACCOUNT) {
    // handler create account
    const newAction = action.toCreateAccount();
    handleCreateAccount(newAction, receipt, outcome, block);
  }

  if (action.kind == near.ActionKind.DEPLOY_CONTRACT) {
    // handler deploy contract
    const newAction = action.toDeployContract();
    handleDeployContract(newAction, receipt, outcome, block);
  }

  if (action.kind == near.ActionKind.FUNCTION_CALL) {
    // handler function call
    const newAction = action.toFunctionCall();
    handleFunctionCall(newAction, receipt, outcome, block);
  }

  if (action.kind == near.ActionKind.TRANSFER) {
    // handle transfer of NEAR native token
    const newAction = action.toTransfer();
    handleTransfer(newAction, receipt, outcome, block);
  }

  // Don't need to handle Stake, Add Key, Delete Key and Delete Account actions
}

function handleCreateAccount(
  createAccount: near.CreateAccountAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  log.info("Handle create account -> id: {}, ", [receipt.id.toBase58()]);
}

function handleDeployContract(
  deployContract: near.DeployContractAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  log.info("Handle deploy contract -> id: {}", [receipt.id.toBase58()]);
  const deployment = new Deployment(receipt.id.toBase58());
  deployment.accountId = receipt.receiverId;
  deployment.receiptId = receipt.id.toBase58();
  deployment.codeHash = deployContract.codeHash;
  deployment.blockNumber = BigInt.fromU64(block.header.height);
  deployment.timestamp = BigInt.fromU64(block.header.timestampNanosec);
  deployment.save();
}

function handleTransfer(
  transfer: near.TransferAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  log.info("Handle transfer -> id: {}, deposit: {}", [
    receipt.id.toBase58(),
    transfer.deposit.toHexString()
  ]);
}

function missingFunctionCallHandler(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  log.warning("No handler for function call -> id: {}, method: {}, args: {}, deposit: {}", [
    receipt.id.toBase58(),
    functionCall.methodName,
    functionCall.args.toString(),
    functionCall.deposit.toHexString()
  ]);
}

function handleFunctionCall(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  outcome: near.ExecutionOutcome,
  block: near.Block
): void {
  const handlersMapping = new Map<string, (f: near.FunctionCallAction, r: near.ActionReceipt, o: near.ExecutionOutcome, b: near.Block) => void>();

  // Add protocol specific method handlers here
  handlersMapping.set("new", initFarm);
  handlersMapping.set("create_simple_farm", createSimpleFarm);
  handlersMapping.set("withdraw_seed", withdrawSeed);
  handlersMapping.set("callback_post_withdraw_ft_seed", callbackPostWithdrawFTSeed);
  handlersMapping.set("callback_post_withdraw_mft_seed", callbackPostWithdrawMFTSeed);
  handlersMapping.set("remove_user_rps_by_farm", removeUserRPSByFarm);
  handlersMapping.set("claim_reward_by_farm", claimRewardByFarm);
  handlersMapping.set("claim_reward_by_seed", claimRewardBySeed);

  handlersMapping.set("ft_on_transfer", ftOnTransfer);
  handlersMapping.set("mft_on_transfer", mftOnTransfer);
  // End of protocol specific method handlers setup

  const handler = handlersMapping.has(functionCall.methodName) ? handlersMapping.get(functionCall.methodName) : missingFunctionCallHandler;
  handler(functionCall, receipt, outcome, block);
}