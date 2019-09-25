const { getRecipientFunds, isRelayHubDeployedForRecipient, getCallDataGas } = require('../src/utils');
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

  describe.only('#getCallDataGas', function() {
    it('gets a valid CallData cost for long data', function() {
      const gas = getCallDataGas(
        '2ac0df260000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000b68656c6c6f20776f726c64000000000000000000000000000000000000000000',
      );
      expect(gas).to.be.eq(1488);
    });
    it('gets a valid CallData cost for simple data', function() {
      let gas = getCallDataGas('0xaf');
      expect(gas).to.be.eq(68);
      gas = getCallDataGas('00');
      expect(gas).to.be.eq(4);
    });
    it('throws if data not a string', function() {
      expect(() => getCallDataGas({ data: '0x00' })).to.throw(/Data has to be a string/);
    });
  });
});
