const {
  getRecipientFunds,
  isRelayHubDeployedForRecipient,
  getCallDataGas,
  fixTransactionReceiptResponse,
} = require('../src/utils');
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

  describe('#getCallDataGas', function() {
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

  describe('#fixTransactionReceiptResponse', function() {
    it('gets result status 0 when canRelay fails', function() {
      const respInput = {
        result: {
          logs: [
            {
              address: '0xd216153c06e857cd7f72665e0af1d7d82172f494',
              blockHash: '0x5127fd656480d97fab7d2c3300d3e92452765c48bbc16ec6e67d61203e3e0650',
              blockNumber: '0x57da45',
              data:
                '0x9e80c074000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002',
              logIndex: '0x14',
              removed: false,
              topics: [ // These include a CanRelayFailed event
                '0xafb5afd6d1c2e8ffbfb480e674a169f493ece0b22658d4f4484e7334f0241e22',
                '0x000000000000000000000000eb3e8ad0c83d5e5c8af7ad073d5dd5b1507d73f8',
                '0x00000000000000000000000002d9123692a15bd08bf151154c6f2a47cd1b4040',
                '0x000000000000000000000000f49f5f2458f27b3e52d0755bfac623877b1fc3f5',
              ],
              transactionHash: '0x0836aa8f15336f1a203c4c57170fe0d77d389bcf37d2dd6c0238e378f4c2cc36',
              transactionIndex: '0x5',
            },
          ],
        },
      };
      const respOutput = fixTransactionReceiptResponse(respInput);
      expect(respOutput.result.status).to.be.eq(0);
    });
  });
});
