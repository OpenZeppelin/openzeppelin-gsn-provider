# GSN Web3 Provider

This package wraps the `RelayClient` from `tabookey-gasless`  with a Web3 Provider. 

Example usage:

```
const Web3 = require('web3');
const { GSNProvider, useGSN } = require('@openzeppelin/gsn-provider');

// Create a new web3 instance with a GSN provider
const web3 = new Web3(new GSNProvider('http://localhost:8545'));

// Use the useGSN flag on each tx to specify whether to use a meta-tx
web3.eth.sendTransaction({ from, to, data, useGSN: false });
```

Available options for the provider:

* `useGSN (bool)`: whether to send meta txs by default, or a function that receives a payload and returns whether to use a meta tx (defaults to true).
* `signKey (hex string)`: optional private key to sign the meta txs, using the underlying provider `sign` if not set.
* `approveFunction (function)`: optional function for generating application approval data for a transaction, and returns a `byte32` signature that can be checked in the recipient.
* `httpTimeout (integer)`: timeout in ms for HTTP requests to relayers (defaults to 10000).
* `gaspriceFactorPercent (integer)`: percentage increase over the network gas price for gsn transactions (defaults to 20).
* `force_gasPrice (integer|string)`: fixed gas price to use in all gsn transactions.
* `force_gasLimit (integer|string)`: fixed gas limit to use in all gsn transactions.
* `allowed_relay_nonce_gap (integer)`: (defaults to 3)
* `minStake (integer)`: filters out relays with stake below this value (optional)
* `minDelay (integer)`: filters out relays with unstake delay below this value (optional)
* `relayTimeoutGrace (integer)`: whenever a relayer timeouts a request, it is downscored by the client, and this penalization is reset every `relayTimeoutGrace` seconds (defaults to 1800, 30 mins)
* `calculateRelayScore (function)`: given a relayer, must return a numeric score (the higher the better) to rank it (defaults to using the transaction fee and penalizations due to timeouts, maxes at 1000)
* `relayFilter (function)`: given a relayer, must return a boolean indicating whether it is elligible (defaults to using `minDelay` and `minStake`)
* `txfee (integer)`: forcefully use this transaction fee instead of the one advertised by the relayer (may lead to overpayment or rejections, defaults to empty)
* `addScoreRandomness (function)`: used for injecting randomness tie-breaking between relayers with the same score (defaults to uniform 0..1 random)
* `verbose (bool)`: a boolean to turn on verbose output (defaults to false)

For each tx:

* `txFee (integer)`
* `approveFunction (function)`