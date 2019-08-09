const { GSNDevProvider } = require('../src');
const { setupAccounts, deployGreeter } = require('./setup');
const sendsTransactions = require('./behaviours/sendsTransactions');
const handlesSubscriptions = require('./behaviours/handlesSubscriptions');
const handlesErrors = require('./behaviours/handlesErrors');

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
});

