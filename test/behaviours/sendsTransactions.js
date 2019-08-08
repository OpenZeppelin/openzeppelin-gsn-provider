const Web3 = require('web3');
const { createSignKey, assertGreetedEvent, assertSentViaGSN, assertNotSentViaGSN, LONG_MESSAGE, HARDCODED_RELAYER_OPTS } = require('../utils');
const ethUtil = require('ethereumjs-util');
const { omit } = require('lodash');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

function sendsTransactions(createProviderFn) {
  context('with default gsn provider', function () {
    beforeEach(async function () {
      const gsnProvider = await createProviderFn(PROVIDER_URL, HARDCODED_RELAYER_OPTS);
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
    beforeEach(async function () {
      const gsnProvider = await createProviderFn(PROVIDER_URL);
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
    beforeEach(async function () {
      const gsnProvider = await createProviderFn(PROVIDER_URL, {
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
    beforeEach(async function () {
      this.signKey = createSignKey();
      this.gsnProvider = await createProviderFn(PROVIDER_URL, {
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

  context('with gas estimations', function () {
    beforeEach(async function () {
      // Remove gas limit hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['force_gasLimit', 'gasLimit', 'fixedGasLimit']);
      const gsnProvider = await createProviderFn(PROVIDER_URL, opts);
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

  context('with tx fees', function () {
    beforeEach(async function () {
      // Remove tx fee hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['txfee', 'txFee']);
      const gsnProvider = await createProviderFn(PROVIDER_URL, opts);
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
      ).to.be.rejectedWith(/no relayer.+fee/is)
    });
  });

  context('with gas price', function () {
    beforeEach(async function () {
      // Remove gas price hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['gasPrice', 'gas_price', 'force_gasPrice', 'force_gasprice', 'fixedGasPrice']);
      const gsnProvider = await createProviderFn(PROVIDER_URL, opts);
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
      ).to.be.rejectedWith(/no relayer.+gas price/is)
    });
  });

  context('with gas price percent', function () {
    const setGsnProviderWithGasPriceFactorPercent = async function (contract, percent) {
      const opts = omit(HARDCODED_RELAYER_OPTS, ['gasPrice', 'gas_price', 'force_gasPrice', 'force_gasprice', 'fixedGasPrice']);
      const gsnProvider = await createProviderFn(PROVIDER_URL, { ... opts, gaspriceFactorPercent: percent });
      contract.setProvider(gsnProvider);
      contract.options.gasPrice = null;
    };
    
    it('sends a tx via GSN with reasonable gas price percent', async function () {
      await setGsnProviderWithGasPriceFactorPercent(this.greeter, 30);

      const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
      
      const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
      expect(parseInt(sentTx.gasPrice)).to.eq(20000000000 * 1.3);
    });

    it('fails to sends a tx via GSN with if gas price percent is too low', async function () {
      await setGsnProviderWithGasPriceFactorPercent(this.greeter, -5);

      await expect(
        this.greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/no relay/i)
    });
  });


}

module.exports = sendsTransactions;