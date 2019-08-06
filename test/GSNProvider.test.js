const Web3 = require('web3');
const { omit } = require('lodash');
const { generate } = require('ethereumjs-wallet');
const ethUtil = require('ethereumjs-util');
const { fundRecipient, relayHub } = require('@openzeppelin/gsn-helpers');
const { GSNProvider } = require('../src');
const { abi: GreeterAbi, bytecode: GreeterBytecode } = require('./build/contracts/Greeter.json');
const { abi: VanillaGreeterAbi, bytecode: VanillaGreeterBytecode } = require('./build/contracts/VanillaGreeter.json');

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const LONG_MESSAGE = 'Hello world testing a long message in the greeting!';

// Hardcoded options for the relay client to always get a tx through
const HARDCODED_RELAYER_OPTS = {
  txfee: 90,
  force_gasPrice: 22000000001,
  gasPrice: 22000000001,
  force_gasLimit: 500000,
  gasLimit: 500000,
  verbose: false
};

describe('GSNProvider', function () {
  before('setting up web3', async function () {
    this.web3 = new Web3(PROVIDER_URL);
    this.accounts = await this.web3.eth.getAccounts();
    expect(this.accounts).to.have.lengthOf(10);

    this.deployer = this.accounts[0];
    this.sender = this.accounts[1];
    this.signer = this.accounts[2];
    this.failsPre = this.accounts[7];
    this.failsPost = this.accounts[8];
  });

  beforeEach('setting up sample contract', async function () {
    const Greeter = new this.web3.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
    this.greeter = await Greeter.deploy().send({ from: this.deployer, gas: 2e6 });
    await fundRecipient(this.web3, { recipient: this.greeter.options.address });
  });

  context('with default gsn provider', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, HARDCODED_RELAYER_OPTS);
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
  });

  context('with gsn provider without options', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL);
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
  });
  
  context('with gsn provider disabled by default', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, {
        ... HARDCODED_RELAYER_OPTS,
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
      this.signKey = createSignKey();
      this.gsnProvider = new GSNProvider(PROVIDER_URL, {
        ... HARDCODED_RELAYER_OPTS, 
        signKey: this.signKey
      });
      this.greeter.setProvider(this.gsnProvider);
    });

    it('sends a tx via GSN with custom sign key with sender set to sign key', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signKey.address });
      assertGreetedEvent(tx);
      await assertSentViaGSN(this.web3, tx.transactionHash, { from: this.signKey.address });
    });

    it('refuses to send meta tx if sender does not match custom signer', async function () {
      await expect(
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/unknown/i);
    });

    it('skips GSN if specified in tx opts', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: false });
      assertGreetedEvent(tx);
      await assertNotSentViaGSN(this.web3, tx.transactionHash);
    });

    it('returns signer as account list', async function () {
      const web3gsn = new Web3(this.gsnProvider);
      const accounts = await web3gsn.eth.getAccounts();
      expect(accounts).to.deep.eq([this.signKey.address]);
    });
  });

  context('on subscriptions', function () {
    async function testSubscription(provider) {
      this.greeter.setProvider(provider);

      let event = null;
      this.greeter.events.Greeted()
        .on('data', data => { event = data; });
      await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: false });
      await provider.disconnect();

      expect(event).to.exist;
      expect(event.returnValues.message).to.eq("Hello");
    }

    it('subscribes to events with ws provider', async function () {
      const provider = (new Web3(PROVIDER_URL.replace(/^http/, 'ws'))).currentProvider;
      await testSubscription.call(this, provider);
    });

    it('subscribes to events with gsn ws provider', async function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL.replace(/^http/, 'ws'), HARDCODED_RELAYER_OPTS);
      await testSubscription.call(this, gsnProvider);
    });

    it('subscribes to events with gsn ws provider with sign key', async function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL.replace(/^http/, 'ws'), {
        ... HARDCODED_RELAYER_OPTS,
        signKey: createSignKey()
      });
      await testSubscription.call(this, gsnProvider);
    });
  });

  context('on gsn errors', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
      this.greeter.setProvider(gsnProvider);
    });

    it('throws if contract execution reverts', async function () {
      await expect (
        this.greeter.methods.reverts().send({ from: this.signer })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });

    it('throws if contract pre reverts', async function () {
      await expect (
        this.greeter.methods.greet("Hello").send({ from: this.failsPre })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });

    it('throws if contract post reverts', async function () {
      await expect (
        this.greeter.methods.greet("Hello").send({ from: this.failsPost })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });

    it('throws if contract execution reverts without using GSN', async function () {
      await expect (
        this.greeter.methods.reverts().send({ from: this.signer, useGSN: false })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });
  });

  context('on gsn errors with gsn disabled by default', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS, useGSN: false });
      this.greeter.setProvider(gsnProvider);
    });

    it('throws if contract execution reverts', async function () {
      await expect (
        this.greeter.methods.reverts().send({ from: this.signer })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });

    it('throws if contract execution reverts explicitly using GSN', async function () {
      await expect (
        this.greeter.methods.reverts().send({ from: this.signer, useGSN: true })
      ).to.be.rejectedWith(/Transaction has been reverted/);
    });
  });

  context('on illegal gsn actions', function () {
    beforeEach(function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
      this.greeter.setProvider(gsnProvider);
      this.web3gsn = new Web3(gsnProvider);
    });

    it('throws if attempting to create a contract', async function () {
      const Greeter = new this.web3gsn.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
      await expect (
        Greeter.deploy().send({ from: this.deployer, gas: 3e6 })
      ).to.be.rejectedWith(/cannot deploy/i);
    });

    it('creates a contract if disables gsn', async function () {
      const Greeter = new this.web3gsn.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
      await expect (
        Greeter.deploy().send({ from: this.deployer, gas: 3e6, useGSN: false })
      ).to.be.fulfilled;
    });

    it('throws if attempting to send value', async function () {
      await expect (
        this.greeter.methods.greet("Money").send({ from: this.signer, value: 1e14 })
      ).to.be.rejectedWith(/cannot send funds/i);
    });

    it('sends tx if value is zero', async function () {
      await expect (
        this.greeter.methods.greet("Money").send({ from: this.signer, value: 0 })
      ).to.be.fulfilled;
    });

    it('sends value if disables gsn', async function () {
      await expect (
        this.greeter.methods.greet("Money").send({ from: this.signer, value: 1e14, useGSN: false })
      ).to.be.fulfilled;
    });
  });

  context('on invalid hub', async function () {
    beforeEach(function () {
      this.gsnProvider = new GSNProvider(PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
    });

    it('throws if hub is the zero address', async function () {
      await this.greeter.methods.setHub(ZERO_ADDRESS).send({ from: this.sender });
      this.greeter.setProvider(this.gsnProvider);
      
      await expect (
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/zero/);
    });

    it('throws if hub is not a contract', async function () {
      await this.greeter.methods.setHub(this.sender).send({ from: this.sender });
      this.greeter.setProvider(this.gsnProvider);
      
      await expect (
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/could not query relay hub/i);
    });

    it('throws if hub is not a hub', async function () {
      await this.greeter.methods.setHub(this.greeter.options.address).send({ from: this.sender });
      this.greeter.setProvider(this.gsnProvider);
      
      await expect (
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/could not query relay hub/i);
    });
  });

  context('on invalid recipient', async function () {
    beforeEach(function () {
      this.gsnProvider = new GSNProvider(PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
    });

    it('throws if recipient does not respond hub addr', async function () {
      const VanillaGreeter = new this.web3.eth.Contract(VanillaGreeterAbi, null, { data: VanillaGreeterBytecode});
      const greeter = await VanillaGreeter.deploy().send({ from: this.deployer, gas: 3e6 });
      greeter.setProvider(this.gsnProvider);

      await expect (
        greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/could not get relay hub address/i);
    });

    it('throws if recipient is not funded', async function () {
      const Greeter = new this.web3.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
      const greeter = await Greeter.deploy().send({ from: this.deployer, gas: 3e6 });
      greeter.setProvider(this.gsnProvider);

      await expect (
        greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/has no funds/i);
    });

    it('throws if recipient has not enough funds', async function () {
      const Greeter = new this.web3.eth.Contract(GreeterAbi, null, { data: GreeterBytecode});
      const greeter = await Greeter.deploy().send({ from: this.deployer, gas: 3e6 });
      // TODO: fundRecipient should accept strings or numbers
      await fundRecipient(this.web3, { amount: new Web3.utils.BN(1e8), recipient: greeter.options.address });
      greeter.setProvider(this.gsnProvider);

      await expect (
        greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/has not enough funds/i);
    });
  });

  context('on gas estimations', function () {
    beforeEach(function () {
      // Remove gas limit hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['force_gasLimit', 'gasLimit']);
      const gsnProvider = new GSNProvider(PROVIDER_URL, opts);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN with estimated gas', async function () {
      const tx = this.greeter.methods.greetFrom(this.signer, LONG_MESSAGE);
      const gas = await tx.estimateGas({ from: this.signer });
      const receipt = await tx.send({ from: this.signer, gas });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
    });

    it('returns different gas when sent via GSN', async function () {
      const tx = this.greeter.methods.greetFrom(this.signer, LONG_MESSAGE);
      const gsnGas = await tx.estimateGas({ from: this.signer });
      const vanillaGas = await tx.estimateGas({ useGSN: false, from: this.signer });
      expect(parseInt(vanillaGas)).to.be.lessThan(parseInt(gsnGas));
    });

    it('send a GSN tx without explicit gas limit', async function () {
      const receipt = await this.greeter.methods.greetFrom(this.signer, LONG_MESSAGE).send({ from: this.signer })
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
    });

    it('sends a vanilla tx without explicit gas limit', async function () {
      const receipt = await this.greeter.methods.greetFrom(this.signer, LONG_MESSAGE).send({ from: this.signer, useGSN: false })
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertNotSentViaGSN(this.web3, receipt.transactionHash);
    });
  });

  context('on tx fees', function () {
    beforeEach(function () {
      // Remove tx fee hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['txfee', 'txFee']);
      const gsnProvider = new GSNProvider(PROVIDER_URL, opts);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN with fee required by the relayer', async function () {
      const receipt = await this.greeter.methods.greet("Hello").send({ from: this.signer });
      assertGreetedEvent(receipt, "Hello");
      await assertSentViaGSN(this.web3, receipt.transactionHash);
    });

    it('fails to sends a tx via GSN with if fee is too low', async function () {
      await expect(
        this.greeter.methods.greet("Hello").send({ from: this.signer, txFee: 1 })
      ).to.be.rejectedWith(/no relay/i)
    });
  });

  context('on gas price', function () {
    beforeEach(function () {
      // Remove gas price hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['gasPrice', 'gas_price', 'force_gasPrice', 'force_gasprice']);
      const gsnProvider = new GSNProvider(PROVIDER_URL, opts);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN without gas price set', async function () {
      const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
      const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
      expect(parseInt(sentTx.gasPrice)).to.eq(20e9);
    });  

    [30e9, 30e9.toString(), ethUtil.addHexPrefix(30e9.toString(16))].forEach(gasPrice => {
      it(`sends a tx via GSN with gas price set to ${gasPrice}`, async function () {
        const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer, gasPrice });
        assertGreetedEvent(receipt, LONG_MESSAGE);
        await assertSentViaGSN(this.web3, receipt.transactionHash);
        const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
        expect(parseInt(sentTx.gasPrice)).to.eq(30e9);
      });  
    })

    it('fails to sends a tx via GSN with if gas price is too low', async function () {
      await expect(
        this.greeter.methods.greet("Hello").send({ from: this.signer, gasPrice: 1 })
      ).to.be.rejectedWith(/no relay/i)
    });
  });

  context('on gas price percent', function () {
    const setGsnProviderWithGasPriceFactorPercent = function (contract, percent) {
      const opts = omit(HARDCODED_RELAYER_OPTS, ['gasPrice', 'gas_price', 'force_gasPrice', 'force_gasprice']);
      const gsnProvider = new GSNProvider(PROVIDER_URL, { ... opts, gaspriceFactorPercent: percent });
      contract.setProvider(gsnProvider);
      contract.options.gasPrice = null;
    };
    
    it('sends a tx via GSN with reasonable gas price percent', async function () {
      setGsnProviderWithGasPriceFactorPercent(this.greeter, 30);

      const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
      
      const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
      expect(parseInt(sentTx.gasPrice)).to.eq(20000000000 * 1.3);
    });

    it('fails to sends a tx via GSN with if gas price percent is too low', async function () {
      setGsnProviderWithGasPriceFactorPercent(this.greeter, -5);

      await expect(
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/no relay/i)
    });
  });
});

// Assertions to polish and move to gsn helpers
const assertSentViaGSN = async function(web3, txHash, opts = {}) {
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

const assertNotSentViaGSN = async function(web3, txHash) {
  const receipt = await web3.eth.getTransactionReceipt(txHash);
  expect(receipt.to.toLowerCase()).to.not.eq(relayHub.address.toLowerCase());
}

// Custom assertions for this suite
const assertGreetedEvent = function(txReceipt, value='Hello') {
  expect(txReceipt.events.Greeted).to.exist;
  expect(txReceipt.events.Greeted.returnValues.message).to.eq(value);
}

// Helpers
function createSignKey() {
  const wallet = generate();
  return {
    privateKey: wallet.privKey,
    address: ethUtil.toChecksumAddress(ethUtil.bufferToHex(wallet.getAddress()))
  };
}