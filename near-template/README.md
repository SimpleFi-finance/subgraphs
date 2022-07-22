## NEAR subgraph template

This is a template subgraph for developing subgraphs for protocols on NEAR blockchain. It can be used to develop a subgraph for integration with SimpleFi dashboard or a standalone subgraph.

### Features

- Pre defined common schema for SimpleFi Dashboard integration
- Pre defined methods to populate SimpleFi common schema entities
- Stub functions for all type of actions a NEAR account
- Boilerplate for function call action handler
- `parseNullableJSONAtrribute` function in common.ts
- `debugNEARLogs` function to log all receipt data for debugging
- Bonus - can be deployed to index contract deployments
- Deployed at - [Near Template Subgraph](https://thegraph.com/hosted-service/subgraph/simplefi-finance/near-template)

### Example subgraph

An example subgraph using this template can be found at [link-to-be-published-soon]

### Notes

These are notes that may be useful for developing NEAR subgraphs when coming from EVM subgraph development experience -

- NEAR subgraph listner gets triggered for account creation, contract deployment and new function call. This allows us to create entity to track constructor parameters. We can not index constructor params on EVM subgraphs

- NEAR subgraph does not support contract calls for view function

- Return value of a function is included in outcome.status, it can be

  - A value if the function returns a value, which can be parsed by converting outcome.status to bytes and then parsed as JSON
  - A receipt id if the function returns a promise, which can be parsed by converting outcome.status to a receipt id
  
