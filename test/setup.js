const Web3 = require('web3');
const { fundRecipient } = require('@openzeppelin/gsn-helpers');
const { abi: GreeterAbi, bytecode: GreeterBytecode } = require('./build/contracts/Greeter.json');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

async function setupAccounts() {
  this.web3 = new Web3(PROVIDER_URL);
  this.accounts = await this.web3.eth.getAccounts();
  if (this.accounts.length !== 10) throw new Error(`Expected 10 accounts but found ${this.accounts}`);

  this.deployer = this.accounts[0];
  this.sender = this.accounts[1];
  this.signer = this.accounts[2];
  this.failsPre = this.accounts[7];
  this.failsPost = this.accounts[8];
}

async function deployGreeter() {
  const Greeter = new this.web3.eth.Contract(GreeterAbi, null, { data: GreeterBytecode });
  this.greeter = await Greeter.deploy().send({ from: this.deployer, gas: 2e6 });
  await fundRecipient(this.web3, { recipient: this.greeter.options.address });
}

module.exports = {
  setupAccounts,
  deployGreeter,
};
