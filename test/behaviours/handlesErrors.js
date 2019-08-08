const Web3 = require('web3');
const { fundRecipient } = require('@openzeppelin/gsn-helpers');
const { abi: GreeterAbi, bytecode: GreeterBytecode } = require('../build/contracts/Greeter.json');
const { abi: VanillaGreeterAbi, bytecode: VanillaGreeterBytecode } = require('../build/contracts/VanillaGreeter.json');
const { HARDCODED_RELAYER_OPTS } = require('../utils');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

function handlesErrors(createProviderFn) {
  context('on gsn errors', function () {
    beforeEach(async function () {
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
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
    beforeEach(async function () {
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS, useGSN: false });
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
    beforeEach(async function () {
      const gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
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
    beforeEach(async function () {
      this.gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
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
    beforeEach(async function () {
      this.gsnProvider = await createProviderFn.call(this, PROVIDER_URL, { ...HARDCODED_RELAYER_OPTS });
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
      await fundRecipient(this.web3, { amount: 1e8, recipient: greeter.options.address });
      greeter.setProvider(this.gsnProvider);

      await expect (
        greeter.methods.greet("Hello").send({ from: this.signer })
      ).to.be.rejectedWith(/has not enough funds/i);
    });
  });
}

module.exports = handlesErrors;