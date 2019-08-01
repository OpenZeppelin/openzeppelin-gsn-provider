const Web3 = require('web3');
const { fundRecipient, relayHubAddress } = require('@openzeppelin/gsn-helpers');
const { GSNProvider } = require('../src');
const { abi: GreeterAbi, bytecode: GreeterBytecode } = require('./build/contracts/Greeter.json');
const { generate } = require('ethereumjs-wallet');
const expect = require('chai').expect;

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

// Options we have been carrying over to get the relay client to work
// We need to look into them, document them, and properly configure them here
const SHAMEFUL_RELAYER_OPTS = {
  txfee: 90,
  force_gasPrice: 22000000001,
  gasPrice: 22000000001,
  force_gasLimit: 500000,
  gasLimit: 500000,
  verbose: false
};

// Assertions to polish and move to gsn helpers
const assertSentViaGSN = async function(web3, txHash, opts = {}) {
  const abiDecoder = require('abi-decoder');
  const relayHubAbi = require('../src/tabookey-gasless/IRelayHub');
  abiDecoder.addABI(relayHubAbi);

  const receipt = await web3.eth.getTransactionReceipt(txHash);
  expect(receipt.to.toLowerCase()).to.eq(relayHubAddress.toLowerCase());
  
  const logs = abiDecoder.decodeLogs(receipt.logs);
  const relayed = logs.find(log => log && log.name === 'TransactionRelayed');
  expect(relayed).to.exist;

  const from = relayed.events.find(e => e.name === 'from');
  if (opts.from) expect(from.value).to.eq(opts.from);
  
  const to = relayed.events.find(e => e.name === 'to');
  if (opts.to) expect(to.value).to.eq(opts.to);
}

const assertNotSentViaGSN = async function(web3, txHash) {
  const receipt = await web3.eth.getTransactionReceipt(txHash);
  expect(receipt.to.toLowerCase()).to.not.eq(relayHubAddress.toLowerCase());
}

// Custom assertions for this suite
const assertGreetedEvent = function(txReceipt, value='Hello') {
  expect(txReceipt.events.Greeted).to.exist;
  expect(txReceipt.events.Greeted.returnValues.message).to.eq(value);
}

describe('GSNProvider', function () {
  before('setting up web3', async function () {
    this.web3 = new Web3(PROVIDER_URL, { gasPrice: 1e9 });
    this.accounts = await this.web3.eth.getAccounts();
    this.deployer = this.accounts[0];
    this.sender = this.accounts[1];
    this.signer = this.accounts[2];
  });

  beforeEach('setting up sample contract', async function () {
    const Greeter = new this.web3.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
    this.greeter = await Greeter.deploy().send({ from: this.deployer, gas: 1e6 });
    await fundRecipient(this.web3, { recipient: this.greeter.options.address });
  });

  context('with default gsn provider', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, SHAMEFUL_RELAYER_OPTS);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN by default', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer });
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash);
    });
  
    it('skips GSN if specified in tx opts', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: false });
      assertGreetedEvent(tx);
      await assertNotSentViaGSN(this.web3, tx.transactionHash);
    });
  })
  
  context('with gsn provider disabled by default', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, {
        ... SHAMEFUL_RELAYER_OPTS,
        useGSN: false
      });
      this.greeter.setProvider(gsnProvider);
    });

    it('skips GSN by default', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.sender });
      assertGreetedEvent(tx);
      await assertNotSentViaGSN(this.web3, tx.transactionHash);
    });

    it('sends a tx via GSN if specified in tx opts', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer, useGSN: true });
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash);
    });
  })

  context('with custom sign key', function () {
    beforeEach(function () {
      const wallet = generate();
      this.signKey = {
        privateKey: wallet.privKey,
        address: "0x" + wallet.getAddress().toString('hex')
      };

      this.gsnProvider = new GSNProvider(PROVIDER_URL, {
        ... SHAMEFUL_RELAYER_OPTS, 
        signKey: this.signKey
      });
      this.greeter.setProvider(this.gsnProvider);
    });

    it.skip('sends a tx via GSN with custom sign key if sender not set', async function () {
      const tx = await this.greeter.methods.greet("Hello").send();
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash, { from: this.signKey.address });
    });

    it('sends a tx via GSN with custom sign key with sender explicitly set to sign key', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signKey.address });
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash, { from: this.signKey.address });
    });

    it.skip('sends a tx via GSN skipping custom sign key is sender does not match custom signer', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer });
      expect(tx.from).to.eq(this.signer);
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash, { from: this.signer });
    });

    it('skips GSN if specified in tx opts', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: false });
      assertGreetedEvent(tx);
      await assertNotSentViaGSN(this.web3, tx.transactionHash);
    });

    it.skip('returns signer as account list', async function () {
      const web3gsn = new Web3(this.gsnProvider);
      const accounts = await web3gsn.eth.getAccounts();
      expect(accounts).to.deep.eq([this.signKey.address]);
    });
  })
});