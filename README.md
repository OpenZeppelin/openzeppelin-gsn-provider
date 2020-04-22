:warning: This project is in **maintenance mode**. All development on the GSN has been moved to the [OpenGSN](https://github.com/opengsn) organization. Please refer to the [OpenGSN provider implementation](https://github.com/opengsn/gsn/tree/master/src/relayclient) (GSNv1 version [here](https://github.com/opengsn/gsn/tree/GSNv1/src/js/relayclient)). We will only be releasing fixes for high severity issues for this project until July 2020. Read [here](https://forum.openzeppelin.com/t/doubling-down-in-security/2712) for more info.

# OpenZeppelin GSN Provider

[![NPM Package](https://img.shields.io/npm/v/@openzeppelin/gsn-provider.svg)](https://www.npmjs.org/package/@openzeppelin/gsn-provider)
[![Build Status](https://circleci.com/gh/OpenZeppelin/openzeppelin-gsn-provider.svg?style=shield)](https://circleci.com/gh/OpenZeppelin/openzeppelin-gsn-provider)

# GSN Provider

**A web3.js compatible provider for sending transactions via the Gas Station Network (GSN)**. This package wraps a modified version of the [`RelayClient`](https://github.com/tabookey/tabookey-gasless/blob/master/src/js/relayclient/RelayClient.js) from `tabookey-gasless` with a custom web3 Provider.

## Overview

### Installation

```console
$ npm install @openzeppelin/gsn-provider
```

### Usage

Create a `GSNProvider` and use it as the provider for your web3 instance:

```javascript
const Web3 = require("web3");
const { GSNProvider } = require("@openzeppelin/gsn-provider");

const web3 = new Web3(new GSNProvider("http://localhost:8545"));
```

Transactions sent to contracts will then be automatically routed through the GSN:

```javascript
const myContract = new web3.eth.Contract(abi, address);

// Sends the transaction via the GSN
await myContract.methods.myFunction().send({ from });

// Disable GSN for a specific transaction
await myContract.methods.myFunction().send({ from, useGSN: false });
```

## Learn More

* Check out [Getting Started](https://docs.openzeppelin.com/gsn-provider/getting-started) to use GSN Provider in a new project.
* The [Testing GSN Applications](https://docs.openzeppelin.com/gsn-provider/testing-gsn-applications) will teach you how to test your project locally.
* For detailed usage information, take a look at the [API Reference](https://docs.openzeppelin.com/gsn-provider/api).


## License

Released under the MIT License.
