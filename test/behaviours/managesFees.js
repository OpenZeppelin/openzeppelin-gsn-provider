const Web3 = require('web3');
const {
  createSignKey,
  assertGreetedEvent,
  assertSentViaGSN,
  assertNotSentViaGSN,
  LONG_MESSAGE,
  HARDCODED_RELAYER_OPTS,
} = require('../utils');
const ethUtil = require('ethereumjs-util');
const { omit } = require('lodash');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

const expect = require('chai').use(require('chai-as-promised')).expect;

function managesFees(createProviderFn) {
  context('with tx fees', function() {
    beforeEach(async function() {
      // Remove tx fee hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, ['txfee', 'txFee']);
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, opts);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN with fee required by the relayer', async function() {
      const receipt = await this.greeter.methods.greet('Hello').send({ from: this.signer });
      assertGreetedEvent(receipt, 'Hello');
      await assertSentViaGSN(this.web3, receipt.transactionHash);
    });

    it('fails to sends a tx via GSN with if fee is too low', async function() {
      await expect(this.greeter.methods.greet('Hello').send({ from: this.signer, txFee: 1 })).to.be.rejectedWith(
        /no relayer.+fee/is,
      );
    });
  });

  context('with gas price', function() {
    beforeEach(async function() {
      // Remove gas price hardcoded options
      const opts = omit(HARDCODED_RELAYER_OPTS, [
        'gasPrice',
        'gas_price',
        'force_gasPrice',
        'force_gasprice',
        'fixedGasPrice',
      ]);
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, opts);
      this.greeter.setProvider(gsnProvider);
    });

    it('sends a tx via GSN without gas price set', async function() {
      const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);
      const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
      expect(parseInt(sentTx.gasPrice)).to.eq(20e9);
    });

    [30e9, (30e9).toString(), ethUtil.addHexPrefix((30e9).toString(16))].forEach(gasPrice => {
      it(`sends a tx via GSN with gas price set to ${gasPrice}`, async function() {
        const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer, gasPrice });
        assertGreetedEvent(receipt, LONG_MESSAGE);
        await assertSentViaGSN(this.web3, receipt.transactionHash);
        const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
        expect(parseInt(sentTx.gasPrice)).to.eq(30e9);
      });
    });

    it('fails to sends a tx via GSN with if gas price is too low', async function() {
      await expect(this.greeter.methods.greet('Hello').send({ from: this.signer, gasPrice: 1 })).to.be.rejectedWith(
        /no relayer.+gas price/is,
      );
    });
  });

  context('with gas price percent', function() {
    const setGsnProviderWithGasPriceFactorPercent = async function(contract, percent) {
      const opts = omit(HARDCODED_RELAYER_OPTS, [
        'gasPrice',
        'gas_price',
        'force_gasPrice',
        'force_gasprice',
        'fixedGasPrice',
      ]);
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...opts, gaspriceFactorPercent: percent });
      contract.setProvider(gsnProvider);
      contract.options.gasPrice = null;
    };

    it('sends a tx via GSN with reasonable gas price percent', async function() {
      await setGsnProviderWithGasPriceFactorPercent(this.greeter, 30);

      const receipt = await this.greeter.methods.greet(LONG_MESSAGE).send({ from: this.signer });
      assertGreetedEvent(receipt, LONG_MESSAGE);
      await assertSentViaGSN(this.web3, receipt.transactionHash);

      const sentTx = await this.web3.eth.getTransaction(receipt.transactionHash);
      expect(parseInt(sentTx.gasPrice)).to.eq(20000000000 * 1.3);
    });

    it('fails to sends a tx via GSN with if gas price percent is too low', async function() {
      await setGsnProviderWithGasPriceFactorPercent(this.greeter, -5);

      await expect(this.greeter.methods.greet('Hello').send({ from: this.signer })).to.be.rejectedWith(/no relay/i);
    });
  });
}

module.exports = managesFees;
