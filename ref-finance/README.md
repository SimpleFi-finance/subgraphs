## Ref Finance Subgraph development docs

We will be documenting our learning from NEAR subgraph development process for ref finance protocol.

- NEAR subgraph listner gets triggered for account creation, contract deployment and new function call. This allows us to create entity to track constructor parameters that will be used to cumpute values from user interaction like protocol fee.

- To be able to connect multiple receipts of a single transaction we can use `outcome.receiptIds` which is same as `execution_outcome.produced_receipt_id` as defined in official NEAR indexer schema at https://github.com/near/near-indexer-for-explorer/blob/master/docs/near-indexer-for-explorer-db.png

- Return value of a function can be is included in outcome.status, it can either

  - A value if the function returns a value, which can be parsed by converting outcome.status to bytes and then parsed as JSON
  - A receipt id if the function returns a promise, which can be parsed by converting outcome.status to a receipt id

- We may need to adapt common.ts to NEAR blockchain because it has following limitations

  - NEAR subgraph does not support contract calls for view function
  - NEAR subgraph does not support ABI specification