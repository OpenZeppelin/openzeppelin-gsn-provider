const { generate } = require('ethereumjs-wallet');
const ethUtil = require('ethereumjs-util');
const { relayHub } = require('@openzeppelin/gsn-helpers');

const LONG_MESSAGE = 'Hello world testing a long message in the greeting!';

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

async function assertSentViaGSN(web3, txHash, opts = {}) {
  const abiDecoder = require('abi-decoder');
  abiDecoder.addABI(relayHub.abi);

  const receipt = await web3.eth.getTransactionReceipt(txHash);
  expect(receipt.to.toLowerCase()).to.eq(relayHub.address.toLowerCase());
  
  const logs = abiDecoder.decodeLogs(receipt.logs);
  const relayed = logs.find(log => log && log.name === 'TransactionRelayed');
  expect(relayed).to.exist;

  const from = relayed.events.find(e => e.name === 'from');
  if (opts.from) expect(from.value.toLowerCase()).to.eq(opts.from.toLowerCase());
  
  const to = relayed.events.find(e => e.name === 'to');
  if (opts.to) expect(to.value.toLowerCase()).to.eq(opts.to.toLowerCase());

  return receipt;
}

async function assertNotSentViaGSN(web3, txHash) {
  const receipt = await web3.eth.getTransactionReceipt(txHash);
  expect(receipt.to.toLowerCase()).to.not.eq(relayHub.address.toLowerCase());
}

function assertGreetedEvent(txReceipt, value='Hello') {
  expect(txReceipt.events.Greeted).to.exist;
  expect(txReceipt.events.Greeted.returnValues.message).to.eq(value);
}

function createSignKey() {
  const wallet = generate();
  return {
    privateKey: wallet.privKey,
    address: ethUtil.toChecksumAddress(ethUtil.bufferToHex(wallet.getAddress()))
  };
}

function sendTx(greeter=null) {
  return (greeter || this.greeter).methods.greet(LONG_MESSAGE).send({ from: this.signer });
}

const HARDCODED_RELAYER_OPTS = {
  txFee: 90,
  fixedGasPrice: 22000000001,
  gasPrice: 22000000001,
  fixedGasLimit: 500000,
  gasLimit: 500000,
  verbose: false
};


module.exports = {
  sendTx,
  createSignKey,
  assertGreetedEvent,
  assertSentViaGSN,
  assertNotSentViaGSN,
  LONG_MESSAGE,
  HARDCODED_RELAYER_OPTS
}