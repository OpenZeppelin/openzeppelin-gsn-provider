const { getRecipientFunds, isRelayHubDeployedForRecipient } = require('../src/utils');
const { setupAccounts, deployGreeter } = require('./setup');

const expect = require('chai').use(require('chai-as-promised')).expect;

describe('utils', function() {
  beforeEach(async function() {
    await setupAccounts.call(this);
    await deployGreeter.call(this);
  });

  describe('#getRecipientFunds', function() {
    it('gets the recipient funds', async function() {
      const funds = await getRecipientFunds(this.web3, this.greeter.options.address);
      expect(funds.toString()).to.eq('1000000000000000000');
    });

    it('fails if no valid hub is deployed for the recipient', async function() {
      await this.greeter.methods.setHub(this.deployer).send({ from: this.sender });
      await expect(getRecipientFunds(this.web3, this.greeter.options.address)).to.be.eventually.rejectedWith(
        /hub is not deployed/,
      );
    });
  });

  describe('#isRelayHubDeployedForRecipient', function() {
    it('returns true if hub is deployed for recipient', async function() {
      const result = await isRelayHubDeployedForRecipient(this.web3, this.greeter.options.address);
      expect(result).to.be.true;
    });

    it('returns false if hub is not deployed for recipient', async function() {
      await this.greeter.methods.setHub(this.deployer).send({ from: this.sender });
      const result = await isRelayHubDeployedForRecipient(this.web3, this.greeter.options.address);
      expect(result).to.be.false;
    });
  });
});
