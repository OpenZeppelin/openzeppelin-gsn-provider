# GSN Web3 Provider

This package wraps the `RelayClient` from `tabookey-gasless`  with a Web3 Provider. 

Example usage:

```
const Web3 = require('web3');
const { GSNProvider, useGSN } = require('@openzeppelin/gsn-provider');

// Create a new web3 instance with a GSN provider
const web3 = new Web3(new GSNProvider('http://localhost:8545'));

// Or modify an existing web3 instance to use GSN
useGSN(web3, { ... });

// Use the useGSN flag on each tx to specify whether to use a meta-tx
web3.eth.sendTransaction({ from, to, useGSN: true });
```

Available options:

* `useGSN`: a boolean specifying whether to send meta txs by default, or a function that receives a payload and returns whether to use a meta tx.
* `signKey`: an optional hex string with a private key used to sign the meta txs.