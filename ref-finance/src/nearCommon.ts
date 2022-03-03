import { near, BigInt, log, json, JSONValueKind } from "@graphprotocol/graph-ts"

export function handleNearReceipt(
  receiptWithOutcome: near.ReceiptWithOutcome
): void {

  const receipt = receiptWithOutcome.receipt;
  const outcome = receiptWithOutcome.outcome;
  const block = receiptWithOutcome.block;
  
  log.info("****************** Receipt ID {} Start ***********************", [receipt.id.toBase58()]);

  log.info("Receipt data -> id: {}, predecessorId: {}, receiverId: {}, signerId: {}", [
    receipt.id.toBase58(),
    receipt.predecessorId,
    receipt.receiverId,
    receipt.signerId
  ]);
  
  const actions = receipt.actions;
  for(let i = 0; i < actions.length; i++) {
    log.info("Receipt actions: kind: {}, data: {}", [actions[i].kind.toString(), actions[i].data.toString()]);
  }

  const inputDataIds = receipt.inputDataIds;
  for(let i = 0; i < inputDataIds.length; i++) {
    log.info("Receipt input data id: {}", [inputDataIds[i].toBase58()]);
  }

  const outputDataReceivers = receipt.outputDataReceivers;
  for(let i = 0; i < outputDataReceivers.length; i++) {
    log.info("Receipt output data receiver id: {}", [outputDataReceivers[i].receiverId]);
  }

  log.info("Outcome data -> blockHash: {}, id: {}, executorId: {}", [
    outcome.blockHash.toBase58(),
    outcome.id.toBase58(),
    outcome.executorId
  ]);

  const logs = outcome.logs;
  for(let i = 0; i < logs.length; i++) {
    log.info("Outcome logs: {}", [logs[i].toString()]);
  }

  const receiptIds = outcome.receiptIds;
  for(let i = 0; i < receiptIds.length; i++) {
    log.info("Outcome receiptIds: {}", [receiptIds[i].toBase58()]);
  }

  log.info("****************** Receipt ID {} End ***********************", [receipt.id.toBase58()]);

  for (let i = 0; i < actions.length; i++) {
    handleAction(
      actions[i],
      receipt,
      block,
      outcome
    );
  }
}

function handleAction(
  action: near.ActionValue,
  receipt: near.ActionReceipt,
  block: near.Block,
  outcome: near.ExecutionOutcome
): void {

  if (action.kind == near.ActionKind.CREATE_ACCOUNT) {
    // handler create account
    const newAction = action.toCreateAccount();
    handleCreateAccount(newAction, receipt, block, outcome);
  }

  if (action.kind == near.ActionKind.DEPLOY_CONTRACT) {
    // handler deploy contract
    const newAction = action.toDeployContract();
    handleDeployContract(newAction, receipt, block, outcome);
  }

  if (action.kind == near.ActionKind.TRANSFER) {
    const newAction = action.toTransfer();
    handleTransfer(newAction, receipt, block, outcome);
  }

  if (action.kind == near.ActionKind.FUNCTION_CALL) {
    // handler function call
    const newAction = action.toFunctionCall();
    handleFunctionCall(newAction, receipt, block, outcome);
  }
}

function handleCreateAccount(
  createAccount: near.CreateAccountAction,
  receipt: near.ActionReceipt,
  block: near.Block,
  outcome: near.ExecutionOutcome
): void {
  log.info("Receipt create account -> id: {}", [receipt.id.toBase58()]);
}

function handleDeployContract(
  deployContract: near.DeployContractAction,
  receipt: near.ActionReceipt,
  block: near.Block,
  outcome: near.ExecutionOutcome
): void {
  log.info("Receipt deploy contract -> id: {}", [receipt.id.toBase58()]);
}

function handleTransfer(
  transfer: near.TransferAction,
  receipt: near.ActionReceipt,
  block: near.Block,
  outcome: near.ExecutionOutcome
): void {
  log.info("Receipt transfer -> id: {}, deposit: {}", [
    receipt.id.toBase58(),
    transfer.deposit.toHexString()
  ]);
}

function handleFunctionCall(
  functionCall: near.FunctionCallAction,
  receipt: near.ActionReceipt,
  block: near.Block,
  outcome: near.ExecutionOutcome
): void {
  log.info("Receipt function call -> id: {}, method: {}, args: {}, deposit: {}", [
    receipt.id.toBase58(),
    functionCall.methodName,
    functionCall.args.toString(),
    functionCall.deposit.toHexString()
  ]);
}
