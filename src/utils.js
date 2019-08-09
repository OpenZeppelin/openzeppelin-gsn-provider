const ethUtils = require('ethereumjs-util');
const BN = require('bignumber.js');

const abiDecoder = require('./abi-decoder');
const relayHubAbi = require('./tabookey-gasless/IRelayHub');
abiDecoder.addABI(relayHubAbi);

function appendAddress(data, address) {
  return data + ethUtils.setLengthLeft(ethUtils.toBuffer(address), 32).toString('hex');
}

function callAsJsonRpc(fn, args, id, callback, mapResponseFn = (x => ({ result: x }))) {
  const response = { jsonrpc: "2.0", id };
  try {
    fn(...args)
      .then(result => { 
        callback(null, { ...response, ...mapResponseFn(result) });
      })
      .catch(err => { 
        callback({ ...response, error: err.toString() }, null);
      });
  } catch (err) {
    callback({ ... response, error: err.toString() });
  }
}

function toInt(value) {
  return new BN(value).toNumber();
}

function preconditionCodeToDescription(code) {
  switch (parseInt(code)) {
    case 1: return "wrong signature";
    case 2: return "wrong nonce";
    case 3: return "recipient reverted in acceptRelayedCall";
    case 4: return "invalid status code returned by the recipient";
    default: return `error ${code}`;
  }
}

function fixTransactionReceiptResponse(resp, debug=false) {
  if (!resp || !resp.result || !resp.result.logs) return resp;
  
  const logs = abiDecoder.decodeLogs(resp.result.logs);
  const canRelayFailed = logs.find(e => e && e.name == 'CanRelayFailed');
  const transactionRelayed = logs.find(e => e && e.name == 'TransactionRelayed');

  const setErrorStatus = (reason) => {
    if (debug) console.log(`Setting tx receipt status to zero while fetching tx receipt (${reason})`);
    resp.result.status = 0;
  }

  if (canRelayFailed) {
    setErrorStatus(`canRelay failed with ${canRelayFailed.find(e => e.name == "reason").value}`);
  } else if (transactionRelayed) {
    const status = transactionRelayed.events.find(e => e.name == "status").value;
    if (parseInt(status) !== 0) { // 0 signifies success
      setErrorStatus(`reverted relayed transaction with status code ${status}`);
    }
  }
  
  return resp
}

async function getApprovalData(approveFunction, options) {
  try {
    if (typeof approveFunction === "function") {
      return await approveFunction(options);
    } else {
      return '0x';
    }
  } catch (err) {
    throw new Error(`Error running approveFunction for transaction: ${err.message || err}`);
  }
}

function fixSignature (signature) {
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

module.exports = {
  appendAddress,
  callAsJsonRpc,
  toInt,
  preconditionCodeToDescription,
  fixTransactionReceiptResponse,
  getApprovalData,
  fixSignature
}