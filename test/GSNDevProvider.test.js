const { GSNDevProvider } = require('../src');
const { setupAccounts, deployGreeter } = require('./setup');
const sendsTransactions = require('./behaviours/sendsTransactions');
const handlesSubscriptions = require('./behaviours/handlesSubscriptions');
const handlesErrors = require('./behaviours/handlesErrors');
const { assertSentViaGSN, HARDCODED_RELAYER_OPTS, createSignKey } = require('./utils');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

const expect = require('chai')
  .use(require('chai-string'))
  .expect;

describe('GSNDevProvider', function () {
  before('setting up web3', async function () {
    await setupAccounts.call(this);
  });

  beforeEach('setting up sample contract', async function () {
    await deployGreeter.call(this);
  });

  const createProvider = async function (url, opts) {
    return new GSNDevProvider(url, {
      ... opts,
      ownerAddress: this.accounts[4],
      relayerAddress: this.accounts[5]
    });
  }

  sendsTransactions(createProvider);
  handlesSubscriptions(createProvider);
  handlesErrors(createProvider);

  context('setup', function () {
    it('automatically fetches accounts for owner and relayer', async function () {
      const provider = new GSNDevProvider(PROVIDER_URL, HARDCODED_RELAYER_OPTS);
      this.greeter.setProvider(provider);
      
      const tx = await this.greeter.methods.greet("Hello").send({ from: this.signer });
      const receipt = await assertSentViaGSN(this.web3, tx.transactionHash);
      expect(receipt.from).to.be.equalIgnoreCase(this.accounts[1]);
    });

    it('automatically fetches accounts for owner and relayer when using a sign key', async function () {
      const signKey = createSignKey();
      const provider = new GSNDevProvider(PROVIDER_URL, {
        signKey,
        ...HARDCODED_RELAYER_OPTS
      });
      this.greeter.setProvider(provider);
      
      const tx = await this.greeter.methods.greet("Hello").send({ from: signKey.address });
      const receipt = await assertSentViaGSN(this.web3, tx.transactionHash);
      expect(receipt.from).to.be.equalIgnoreCase(this.accounts[1]);
    });
  })
});

