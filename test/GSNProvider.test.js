const Web3 = require('web3');
const { omit } = require('lodash');
const { fundRecipient, getRelayHub } = require('@openzeppelin/gsn-helpers');
const { GSNProvider } = require('../src');
const { abi: GreeterAbi, bytecode: GreeterBytecode } = require('./build/contracts/Greeter.json');
const { abi: RejectfulGreeterAbi, bytecode: RejectfulGreeterBytecode } = require('./build/contracts/RejectfulGreeter.json');
const { abi: VanillaGreeterAbi, bytecode: VanillaGreeterBytecode } = require('./build/contracts/VanillaGreeter.json');
const { sendTx, createSignKey, HARDCODED_RELAYER_OPTS } = require('./utils');
const { setupAccounts, deployGreeter } = require('./setup');
const sendsTransactions = require('./behaviours/sendsTransactions');
const handlesSubscriptions = require('./behaviours/handlesSubscriptions');
const handlesErrors = require('./behaviours/handlesErrors');
const managesFees = require('./behaviours/managesFees');
const sinon = require('sinon');
const axios = require('axios');

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

describe('GSNProvider', function () {
  before('setting up web3', async function () {
    await setupAccounts.call(this);
  });

  beforeEach('setting up sample contract', async function () {
    await deployGreeter.call(this);
  });

  const createProvider = (url, opts) => new GSNProvider(url, opts);

  sendsTransactions(createProvider);
  managesFees(createProvider);
  handlesSubscriptions(createProvider);
  handlesErrors(createProvider);

  context('on relayer errors', function () {
    beforeEach(async function () {
      this.onPost = null;
      sinon.stub(axios, 'create').returns({
        post: () => this.onPost()
      });

      const gsnProvider = new GSNProvider(PROVIDER_URL, { ... HARDCODED_RELAYER_OPTS });
      this.greeter.setProvider(gsnProvider);
    });

    afterEach(function () {
      sinon.restore();
    })

    it('reports relayer not answering', async function () {
      this.onPost = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:8099'));
      await expect(sendTx.call(this)).to.be.rejectedWith(/connect ECONNREFUSED/);
    });

    it('reports relayer server error', async function () {
      this.onPost = () => Promise.reject(new Error('internal server error'));
      await expect(sendTx.call(this)).to.be.rejectedWith(/internal server error/);
    });

    it('reports relayer not ready', async function () {
      this.onPost = () => Promise.resolve({ data: { Ready: false } });
      await expect(sendTx.call(this)).to.be.rejectedWith(/not ready/i);
    });

    it('reports relayer with gas price too high', async function() {
      this.onPost = () => Promise.resolve({ data: { Ready: true, MinGasPrice: 50000000000 } });
      await expect(sendTx.call(this)).to.be.rejectedWith(/gas price/i);
    });    
  });

  context('on no relayers available', async function () {
    it('reports all relayers filtered out', async function () {
      const gsnProvider = new GSNProvider(PROVIDER_URL, { ... HARDCODED_RELAYER_OPTS, minStake: 100e18 });
      this.greeter.setProvider(gsnProvider);
      await expect(sendTx.call(this)).to.be.rejectedWith(/no relayers elligible after filtering/i);
    });

    it('reports no registered relayers', async function () {
      const hub = await getRelayHub(this.web3).deploy().send({ from: this.deployer, gas: 6.5e6 });
      await this.greeter.methods.setHub(hub.options.address).send({ from: this.sender });
      
      const gsnProvider = new GSNProvider(PROVIDER_URL, HARDCODED_RELAYER_OPTS);
      this.greeter.setProvider(gsnProvider);
      await fundRecipient(this.web3, { recipient: this.greeter.options.address, relayHubAddress: hub.options.address });

      await expect(sendTx.call(this)).to.be.rejectedWith(/no relayers registered/i);
    });

    it('throws if canRelay failed', async function () {      
      const RejectfulGreeter = new this.web3.eth.Contract(RejectfulGreeterAbi, null, { data: RejectfulGreeterBytecode});
      const greeter = await RejectfulGreeter.deploy().send({ from: this.deployer, gas: 3e6 });
      const gsnProvider = new GSNProvider(PROVIDER_URL, HARDCODED_RELAYER_OPTS);
      greeter.setProvider(gsnProvider);
      await fundRecipient(this.web3, { recipient: greeter.options.address });
      
      await expect(sendTx.call(this, greeter)).to.be.rejectedWith(/no relayer.+canRelay check failed with error 20/is);
    });

  });

  context('detecting relays added', function () {
    const withoutGsnDev = (relayers) => (
      relayers.filter(r => r.relayUrl !== "http://gsn-dev-relayer.openzeppelin.com/")
    );

    before('getting relayHub', async function () {
      this.relayHub = await getRelayHub(this.web3);
    });

    beforeEach('creating provider', async function () {
      this.gsnProvider = new GSNProvider(PROVIDER_URL, HARDCODED_RELAYER_OPTS);

      // it's necessary to send a transaction through the gsnProvider for the serverHelper
      // to get hold of an instance of the relayHub
      this.greeter.setProvider(this.gsnProvider);
      await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: true });
    });

    it('finds the one relay added', async function () {
      const relays = await this.gsnProvider.relayClient.serverHelper.fetchRelaysAdded();
      expect(withoutGsnDev(relays)).to.have.lengthOf(1);
    });

    context('with a second relay added', async function () {
      beforeEach('adding second relay', async function () {
        this.secondRelay = this.accounts[6];
        await this.relayHub.methods.stake(this.secondRelay, 60*60*24*10 /* 10 days */)
          .send({
            value: Web3.utils.toWei('1', 'ether'),
            from: this.deployer,
            useGSN: false,
          });
        await this.relayHub.methods.registerRelay(0, 'url')
          .send({
            from: this.secondRelay,
            useGSN: false,
          });
      });

      it('finds the two relays', async function () {
        const relays = await this.gsnProvider.relayClient.serverHelper.fetchRelaysAdded();
        expect(withoutGsnDev(relays)).to.have.lengthOf(2);
      });

      context('with the second relay removed', async function () {
        beforeEach('removing second relay', async function () {
          await this.relayHub.methods.removeRelayByOwner(this.secondRelay)
            .send({
              from: this.deployer,
              useGSN: false,
            });
        });

        it('finds only one relay', async function () {
          const relays = await this.gsnProvider.relayClient.serverHelper.fetchRelaysAdded();
          expect(withoutGsnDev(relays)).to.have.lengthOf(1);
        });
      });
    });
  });
});

