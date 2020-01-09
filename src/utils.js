const ethUtils = require('ethereumjs-util');
const BN = require('bignumber.js');
const { toBN, soliditySha3 } = require('web3-utils');

const relayHubAbi = require('./tabookey-gasless/IRelayHub');
const relayRecipientAbi = require('./tabookey-gasless/IRelayRecipient');

const abiDecoder = require('abi-decoder');
abiDecoder.addABI(relayHubAbi);

function appendAddress(data, address) {
  return data + ethUtils.setLengthLeft(ethUtils.toBuffer(address), 32).toString('hex');
}

function callAsJsonRpc(fn, args, id, callback, mapResponseFn = x => ({ result: x })) {
  const response = { jsonrpc: '2.0', id };
  try {
    fn(...args)
      .then(result => {
        callback(null, { ...response, ...mapResponseFn(result) });
      })
      .catch(err => {
        callback({ ...response, error: err.toString() }, null);
      });
  } catch (err) {
    callback({ ...response, error: err.toString() });
  }
}

function toInt(value) {
  return new BN(value).toNumber();
}

function preconditionCodeToDescription(code) {
  switch (parseInt(code)) {
    case 1:
      return 'wrong signature';
    case 2:
      return 'wrong nonce';
    case 3:
      return 'recipient reverted in acceptRelayedCall';
    case 4:
      return 'invalid status code returned by the recipient';
    default:
      return `error ${code}`;
  }
}

function fixTransactionReceiptResponse(resp, debug = false) {
  if (!resp || !resp.result || !resp.result.logs) return resp;

  const logs = abiDecoder.decodeLogs(resp.result.logs);
  const canRelayFailed = logs.find(e => e && e.name == 'CanRelayFailed');
  const transactionRelayed = logs.find(e => e && e.name == 'TransactionRelayed');

  const setErrorStatus = reason => {
    if (debug) console.log(`Setting tx receipt status to zero while fetching tx receipt (${reason})`);
    resp.result.status = 0;
  };

  if (canRelayFailed) {
    setErrorStatus(`canRelay failed with ${canRelayFailed.events.find(e => e.name == 'reason').value}`);
  } else if (transactionRelayed) {
    const status = transactionRelayed.events.find(e => e.name == 'status').value;
    if (parseInt(status) !== 0) {
      // 0 signifies success
      setErrorStatus(`reverted relayed transaction with status code ${status}`);
    }
  }

  return resp;
}

async function getApprovalData(approveFunction, options) {
  try {
    if (typeof approveFunction === 'function') {
      return await approveFunction(options);
    } else {
      return '0x';
    }
  } catch (err) {
    throw new Error(`Error running approveFunction for transaction: ${err.message || err}`);
  }
}

function fixSignature(signature) {
  // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
  // signature malleability if version is 0/1
  // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) {
    v += 27;
  }
  const vHex = v.toString(16);
  return signature.slice(0, 130) + vHex;
}

function makeApproveFunction(signFn, verbose) {
  return async function(data) {
    const signature = fixSignature(
      await signFn(
        soliditySha3(
          { type: 'address', value: data.relayerAddress },
          { type: 'address', value: data.from },
          { type: 'bytes', value: data.encodedFunctionCall },
          { type: 'uint256', value: toBN(data.txFee) },
          { type: 'uint256', value: toBN(data.gasPrice) },
          { type: 'uint256', value: toBN(data.gas) },
          { type: 'uint256', value: toBN(data.nonce) },
          { type: 'address', value: data.relayHubAddress },
          { type: 'address', value: data.to },
        ),
      ),
    );
    if (verbose) console.log(`Signature for GSN transaction is ${signature}`);
    return signature;
  };
}

async function createRelayHubFromRecipient(web3, recipientAddress) {
  const relayRecipient = createRelayRecipient(web3, recipientAddress);
  let relayHubAddress;
  try {
    relayHubAddress = await relayRecipient.methods.getHubAddr().call();
  } catch (err) {
    throw new Error(
      `Could not get relay hub address from recipient at ${recipientAddress} (${err.message}). Make sure it is a valid recipient contract.`,
    );
  }

  if (!relayHubAddress || ethUtils.isZeroAddress(relayHubAddress)) {
    throw new Error(
      `The relay hub address is set to zero in recipient at ${recipientAddress}. Make sure it is a valid recipient contract.`,
    );
  }

  const code = await web3.eth.getCode(relayHubAddress);
  if (code.length <= 2) {
    throw new Error(`Relay hub is not deployed at address ${relayHubAddress}`);
  }

  const relayHub = createRelayHub(web3, relayHubAddress);
  let hubVersion;
  try {
    hubVersion = await relayHub.methods.version().call();
  } catch (err) {
    throw new Error(
      `Could not query relay hub version at ${relayHubAddress} (${err.message}). Make sure the address corresponds to a relay hub.`,
    );
  }

  if (!hubVersion.startsWith('1')) {
    throw new Error(`Unsupported relay hub version '${hubVersion}'.`);
  }

  return relayHub;
}

function createRelayRecipient(web3, addr) {
  return new web3.eth.Contract(relayRecipientAbi, addr);
}

function createRelayHub(web3, addr) {
  return new web3.eth.Contract(relayHubAbi, addr);
}

async function isRelayHubDeployedForRecipient(web3, recipientAddr) {
  try {
    await createRelayHubFromRecipient(web3, recipientAddr);
    return true;
  } catch (_err) {
    return false;
  }
}

async function getRecipientFunds(web3, recipientAddr) {
  const relayHub = await createRelayHubFromRecipient(web3, recipientAddr);
  return await relayHub.methods.balanceOf(recipientAddr).call();
}

// Gtxdatazero 4 Paid for every zero byte of data or code for a transaction.
// Gtxdatanonzero 68 Paid for every non-zero byte of data or code for a transaction
// From yellow paper https://gavwood.com/paper.pdf
// May change soon (EIP 2028: Transaction data gas cost reduction) https://eips.ethereum.org/EIPS/eip-2028
function getCallDataGas(data) {
  if (typeof data !== 'string') throw new Error('Data has to be a string');
  if (data.startsWith('0x')) data = data.slice(2);
  let gasCost = 0;
  for (let i = 0; i < data.length; i += 2) {
    if (data.substr(i, 2) === '00') {
      gasCost += 4;
    } else {
      gasCost += 68;
    }
  }
  return gasCost;
}

module.exports = {
  appendAddress,
  callAsJsonRpc,
  toInt,
  preconditionCodeToDescription,
  fixTransactionReceiptResponse,
  getApprovalData,
  fixSignature,
  makeApproveFunction,
  createRelayHubFromRecipient,
  isRelayHubDeployedForRecipient,
  getRecipientFunds,
  getCallDataGas,
  createRelayHub
};
