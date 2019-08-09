const Web3 = require('web3');
const { createSignKey, assertGreetedEvent, assertSentViaGSN, assertNotSentViaGSN, LONG_MESSAGE, HARDCODED_RELAYER_OPTS } = require('../utils');
const { toInt } = require('../../src/utils');
const { omit } = require('lodash');
const { relayHub } = require('@openzeppelin/gsn-helpers');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

const expect = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-string'))
  .expect;

function sendsTransactions(createProviderFn) {
  context('with default gsn provider', function () {
    beforeEach(async function () {
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, HARDCODED_RELAYER_OPTS);
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
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL);
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
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, {
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
      this.gsnProvider = await createProviderFn.call(this, PROVIDER_URL, {
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
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, opts);
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

  context('with approval data', function () {
    const APPROVAL_DATA = '0x1234567890';

    function validateApproveFunctionParams(params) {
      expect(params).to.exist;
      expect(params.from).to.equalIgnoreCase(this.signer);
      expect(params.to).to.equalIgnoreCase(this.greeter.options.address);
      expect(params.encodedFunctionCall).to.eq(this.greeter.methods.greet("Hello").encodeABI());
      expect(toInt(params.txFee)).to.eq(HARDCODED_RELAYER_OPTS.txFee);
      expect(toInt(params.gasPrice)).to.eq(HARDCODED_RELAYER_OPTS.fixedGasPrice);
      expect(toInt(params.gas)).to.eq(HARDCODED_RELAYER_OPTS.fixedGasLimit);
      expect(toInt(params.nonce)).to.be.gte(0);
      expect(params.relayerAddress).to.exist;
      expect(params.relayHubAddress).to.be.equalIgnoreCase(relayHub.address);
    }

    function assertPostGreetEvent(txReceipt) {
      const event = txReceipt.events.PostGreet;
      expect(event).to.exist;
      expect(event.returnValues.from).to.eq(this.signer);
      expect(event.returnValues.approveData).to.eq(APPROVAL_DATA);
    }

    beforeEach(async function () {
      const approveFunction = (params) => {
        this.approveFunctionParams = params;
        return APPROVAL_DATA;
      }
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, {
        ...HARDCODED_RELAYER_OPTS,
        approveFunction
      });
      
      this.greeter.setProvider(gsnProvider);
    });

    it('calls approval data function from provider', async function () {
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer });
      const params = this.approveFunctionParams;
      validateApproveFunctionParams.call(this, params);
      assertPostGreetEvent.call(this, tx);
    })

    it('calls approval data function from tx', async function () {
      let approveFunctionParams;
      const approveFunction = (params) => {
        approveFunctionParams = params;
        return APPROVAL_DATA;
      }
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer, approveFunction });
      const params = approveFunctionParams;
      validateApproveFunctionParams.call(this, params);
      assertPostGreetEvent.call(this, tx);
    })
  });
}

module.exports = sendsTransactions;
