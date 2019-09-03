# OpenZeppelin GSN Web3 Provider

[![npm (scoped)](https://img.shields.io/npm/v/@openzeppelin/gsn-provider)](https://www.npmjs.com/package/@openzeppelin/gsn-provider)
[![CircleCI](https://circleci.com/gh/OpenZeppelin/openzeppelin-gsn-provider.svg?style=shield)](https://circleci.com/gh/OpenZeppelin/openzeppelin-gsn-provider)

**This is a web3.js compatible provider for sending transactions via the Gas Station Network (GSN)**. This package wraps a modified version of the [`RelayClient`](https://github.com/tabookey/tabookey-gasless/blob/master/src/js/relayclient/RelayClient.js) from `tabookey-gasless` with a custom web3 Provider.

## Install

```
npm install @openzeppelin/gsn-provider
```

## Quickstart

Just create a GSNProvider and use it to set up your web3 instance:

```js
const { GSNProvider } = require("@openzeppelin/gsn-provider");
const web3 = new Web3(new GSNProvider("http://localhost:8545"));
```

### With openzeppelin/network.js

You can set up a GSN-powered web3 instance in your dapp using [`@openzeppelin/network`](https://github.com/OpenZeppelin/openzeppelin-network.js), a package designed for easily setting up your connection to the Ethereum network.

With React Hooks:

```js
import { useWeb3Network } from "@openzeppelin/network/react";
const local = useWeb3Network("http://127.0.0.1:8545", { gsn: true });
```

You can also create a signing key on the spot:

```js
import { useWeb3Network, useEphemeralKey } from "@openzeppelin/network/react";
const local = useWeb3Network("http://127.0.0.1:8545", {
  gsn: { signKey: useEphemeralKey() }
});
```

Learn more at [`@openzeppelin/network`](https://github.com/OpenZeppelin/openzeppelin-network.js).

## Usage

Create a new `GSNProvider` and inject it into a new `web3` instance:

```js
const Web3 = require("web3");
const { GSNProvider } = require("@openzeppelin/gsn-provider");

// Create a new web3 instance and contract backed by the GSN provider
const gsnProvider = new GSNProvider("http://localhost:8545");
const web3 = new Web3(gsnProvider);
const myContract = new web3.eth.Contract(abi, address);

// Sends the transaction via the GSN
await myContract.methods.myFunction().send({ from });

// Disable GSN for a specific transaction
await myContract.methods.myFunction().send({ useGSN: false });
```

### Using an offline signing key

The snippet above will ask the node at `localhost:8545` to sign the meta-transactions to send. This will only work if the node has an unlocked account, which is not the case for most public nodes (such as infura). Because of this, the GSN provider also accepts a `signKey` parameter that will be used for offline signing all transactions:

```js
const { generate } = require("ethereumjs-wallet");
const { GSNProvider } = require("@openzeppelin/gsn-provider");

const gsnProvider = new GSNProvider("http://localhost:8545", { signKey: generate().privKey });
```

### Using a custom base provider

The `GSNProvider` will automatically create a base provider based on the connection string supplied. For instance, `GSNProvider('http://localhost:8545')` will create a vanilla `HTTPProvider`. You can specify your own provider instead of a connection string, which will be used to sending the requests to the network after being processed by the GSN provider:

```js
const Web3 = require("web3");
const { GSNProvider } = require("@openzeppelin/gsn-provider");

const ipc = new Web3.providers.IpcProvider("/path/to/ipc", require("net"));
const gsnProvider = new GSNProvider(ipc);
```

### Modifying an existing web3 or contract

You can also change the provider of an existing web3 instance or contract already created to send its transactions via the GSN:

```js
const { GSNProvider } = require("@openzeppelin/gsn-provider");
const gsnProvider = new GSNProvider("http://localhost:8545");

existingWeb3.setProvider(gsnProvider);
existingContract.setProvider(gsnProvider);
```

You can also use the `setGSN` and `withGSN` shorthands:

```js
const { web3: gsnWeb3 } = require("@openzeppelin/gsn-provider");
gsnWeb3.setGSN(existingWeb3); // modifies existingWeb3
gsnWeb3.withGSN(existingWeb3); // returns a new web3 instance
```

### Injecting approval data

The GSN protocol allows you to supply an arbitrary `approveData` blob, that can be checked on the recipient contract. This allows to implement off-chain approvals that are verified on-chain: for instance, you could have your users go through a captcha, and only then sign an approval for a transaction on your backend.

To support this, the `GSNProvider` accepts an `approveFunction` parameter (both at construction time and on each transaction) that receives all transaction parameters, and should return the approval data.

```js
const { utils, GSNProvider } = require("@openzeppelin/gsn-provider");

const approveFunction = async ({
  from,
  to,
  encodedFunctionCall,
  txFee,
  gasPrice,
  gas,
  nonce,
  relayerAddress,
  relayHubAddress
}) => {
  const hash = web3.utils.soliditySha3(
    from,
    to,
    encodedFunctionCall,
    txFee,
    gasPrice,
    gas,
    nonce,
    relayerAddress,
    relayHubAddress
  );
  const signature = await web3.eth.sign(hash, signer);
  return utils.fixSignature(signature); // this takes care of removing signature malleability attacks
};

const gsnProvider = new GSNProvider("http://localhost:8545", { approveFunction });
```

Given that the pattern above is quite common, and is implemented in `@openzeppelin/contracts` by the `GSNBouncerSignature` contract, there is a helper function that takes care of bundling the meta-transaction parameters together and hashing them, so you only need to provide a signing function for an arbitrary blob.

```js
const { utils, GSNProvider } = require("@openzeppelin/gsn-provider");

const gsnProvider = new GSNProvider({
  approveFunction: utils.makeApproveFunction(data => web3.eth.sign(data, approver))
});
```

## Development provider

In addition to the `GSNProvider`, this package includes a `GSNDevProvider`. This provider is meant to be used in development and testing environments only, and it acts as both a provider and a relayer in itself. Any transactions sent through it will be signed by the sender, and relayed by another address. It will register itself in the relay hub as `http://gsn-dev-relayer.openzeppelin.com/`. Note that this provider still needs a hub to exist on the network.

It requires two addresses with funds: one to act as the relayer, and one to act as its owner, who will register it on the hub. If these are not set when constructing the provider, they will default to the first two accounts on the local node.

```js
const { GSNDevProvider } = require("@openzeppelin/gsn-provider");
const gsnDevProvider = new GSNDevProvider("http://localhost:8545", {
  ownerAddress: accounts[0],
  relayerAddress: accounts[1]
});
```

Note that this provider is meant only for development usage, since it requires a funded account to relay the transactions sent through it. This defeats the very purpose of GSN, that is to allow users without accounts or funds to send transactions. The aim of this provider is to support in testing GSN setups, and test the `acceptRelayedCall`, `preRelayedCall`, and `postRelayedCall` methods of your contracts.

## Configuration

Available options for the `GSNProvider`:

- `useGSN (bool)`: whether to send meta txs by default, or a function that receives a payload and returns whether to use a meta tx (defaults to true).
- `signKey (hex string)`: optional private key to sign the meta txs, using the underlying provider `sign` if not set.
- `approveFunction (function)`: optional function for generating application approval data for a transaction, and returns a `bytes` approval data (such as a signature) that can be checked in the recipient; receives as a parameter a single object with the properties `from`, `to`, `encodedFunctionCall`, `txFee`, `gasPrice`, `gas`, `nonce`, `relayerAddress`, `relayHubAddress`.
- `fixedGasPrice (integer|string)`: fixed gas price to use in all gsn transactions.
- `fixedGasLimit (integer|string)`: fixed gas limit to use in all gsn transactions.
- `minStake (integer)`: filters out relays with stake below this value (optional)
- `minDelay (integer)`: filters out relays with unstake delay below this value (optional)
- `verbose (bool)`: a boolean to turn on verbose output (defaults to false)

Advanced options for the provider (most likely you will not need these ones):

- `gasPriceFactorPercent (integer)`: percentage increase over the network gas price for gsn transactions (defaults to 20, note that you need to clear web3 default fixed gasprice for this setting to go into effect).
- `httpTimeout (integer)`: timeout in ms for HTTP requests to relayers (defaults to 10000).
- `allowedRelayNonceGap (integer)`: (defaults to 3)
- `relayTimeoutGrace (integer)`: whenever a relayer timeouts a request, it is downscored by the client, and this penalization is reset every `relayTimeoutGrace` seconds (defaults to 1800, 30 mins)
- `calculateRelayScore (function)`: given a relayer, must return a numeric score (the higher the better) to rank it (defaults to using the transaction fee and penalizations due to timeouts, maxes at 1000)
- `relayFilter (function)`: given a relayer, must return a boolean indicating whether it is elligible (defaults to using `minDelay` and `minStake`)
- `txfee (integer)`: forcefully use this transaction fee instead of the one advertised by the relayer (may lead to overpayment or rejections, defaults to empty)
- `addScoreRandomness (function)`: used for injecting randomness tie-breaking between relayers with the same score (defaults to uniform 0..1 random)

In addition to the regular transaction parameters (from, gas, etc), the GSN provider will also accept these parameters, which will override the ones set at the provider above:

- `useGSN (bool)`
- `txFee (integer)`
- `approveFunction (function)`

## License

Released under the MIT License.
