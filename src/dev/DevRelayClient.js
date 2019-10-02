const HubAbi = require('../tabookey-gasless/IRelayHub');
const RecipientAbi = require('../tabookey-gasless/IRelayRecipient');
const BN = require('bignumber.js');
const {
  getApprovalData,
  appendAddress,
  preconditionCodeToDescription,
  createRelayHubFromRecipient,
} = require('../utils');
const { getTransactionHash, getTransactionSignature } = require('../tabookey-gasless/utils');
const { getCallDataGas } = require('../utils');

const TARGET_BALANCE = 2e18;
const MIN_BALANCE = 2e17;
const UNSTAKE_DELAY = 3600 * 24 * 7 * 4;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const RELAY_STATE = Object.freeze({
  Unknown: 0, // The relay is unknown to the system: it has never been staked for
  Staked: 1, // The relay has been staked for, but it is not yet active
  Registered: 2, // The relay has registered itself, and is active (can relay calls)
  Removed: 3    // The relay has been removed by its owner and can no longer relay calls. It must wait for its unstakeDelay to elapse before it can unstake
})

class DevRelayClient {
  constructor(web3, ownerAddress, relayerAddress, opts = {}) {
    this.ownerAddress = ownerAddress;
    this.relayerAddress = relayerAddress;
    this.txFee = opts.txFee || 10;
    this.web3 = web3;
    this.approveFunction = opts.approveFunction;
    this.options = opts;
    this.debug = opts.debug;
  }

  async sendTransaction(payload) {
    // Set accounts if not set in ctor
    await this.ensureAccounts();

    // Start by registering in the relayer hub
    const txParams = payload.params[0];
    const hub = await createRelayHubFromRecipient(this.web3, txParams.to);
    if(!(await this.isRegistered(hub))) {
      if (this.debug) console.log(`Relayer is not registered yet. Registering...`);
      await this.register(hub);
    }

    // Then sign the transaction as a regular provider would do
    const nonce = parseInt(await hub.methods.getNonce(txParams.from).call());
    const gasPrice = this.options.fixedGasPrice || txParams.gasPrice || (await this.web3.eth.getGasPrice());
    const gas = this.options.fixedGasLimit || txParams.gas || (await this.estimateGas(txParams, hub.options.address));

    await this.validateRecipientBalance(hub, txParams.to, gas, gasPrice);
    if (this.debug) console.log(`Recipient has enough balance to pay for meta tx`);

    const txHashToSign = getTransactionHash(
      txParams.from,
      txParams.to,
      txParams.data,
      this.txFee,
      gasPrice,
      gas,
      nonce,
      hub.options.address,
      this.relayerAddress,
    );

    const signature = await getTransactionSignature(this.web3, txParams.from, txHashToSign);
    if (this.debug) console.log(`Got transaction hash ${txHashToSign} with signature ${signature}`);

    const approvalData = await getApprovalData(txParams.approveFunction || this.approveFunction, {
      from: txParams.from,
      to: txParams.to,
      encodedFunctionCall: txParams.data,
      txFee: this.txFee,
      gasPrice,
      gas,
      nonce,
      relayerAddress: this.relayerAddress,
      relayHubAddress: hub.options.address,
    });
    if (this.approvalData !== '0x' && this.debug) console.log(`Approval data is ${approvalData}`);

    // Here the client would send the txParams, signature, and approvalData to the relayer
    // Instead, we send it from the same process, posing as a relayer
    await this.validateCanRelay(hub, txParams, gasPrice, gas, nonce, signature, approvalData);
    if (this.debug) console.log(`Can relay check succeeded`);

    const requiredGas = BN(await hub.methods.requiredGas(gas.toString()).call())
      .plus(getCallDataGas(txParams.data))
      .toString();
    if (this.debug) console.log(`Relaying transaction with gas ${requiredGas}`);

    return new Promise((resolve, reject) => {
      hub.methods
        .relayCall(txParams.from, txParams.to, txParams.data, this.txFee, gasPrice, gas, nonce, signature, approvalData)
        .send({ from: this.relayerAddress, gasPrice, gas: requiredGas })
        .on('transactionHash', txHash => {
          resolve(txHash);
        })
        .on('error', err => {
          reject(err);
        });
    });
  }

  async validateCanRelay(hub, txParams, gasPrice, gas, nonce, signature, approvalData) {
    let status, recipientContext;
    try {
      ({ status, recipientContext } = await hub.methods
        .canRelay(
          this.relayerAddress,
          txParams.from,
          txParams.to,
          txParams.data,
          this.txFee,
          gasPrice,
          gas,
          nonce,
          signature,
          approvalData,
        )
        .call({ from: this.relayerAddress }));
    } catch (err) {
      throw new Error(`Error checking canRelay for transaction: ${err.message || err}`);
    }
    if (parseInt(status) !== 0) {
      throw new Error(`Recipient canRelay call was rejected with ${preconditionCodeToDescription(status)}`);
    }
    return recipientContext;
  }

  async estimateGas(txParams, hubAddress) {
    if (!hubAddress) {
      const hub = await createRelayHubFromRecipient(this.web3, txParams.to);
      hubAddress = hub.options.address;
    }
    const txParamsFromHub = {
      ...txParams,
      from: hubAddress,
      data: appendAddress(txParams.data, txParams.from),
    };
    return this.web3.eth.estimateGas(txParamsFromHub);
  }

  async validateRecipientBalance(hub, recipient, gasLimit, gasPrice) {
    const relayFee = this.txFee;
    const balance = await hub.methods.balanceOf(recipient).call();
    if (BN(balance).isZero()) {
      throw new Error(`Recipient ${recipient} has no funds for paying for relayed calls on the relay hub.`);
    }

    const maxCharge = await hub.methods.maxPossibleCharge(gasLimit, gasPrice, relayFee).call();
    if (BN(maxCharge).isGreaterThan(BN(balance))) {
      throw new Error(
        `Recipient ${recipient} has not enough funds for paying for this relayed call (has ${balance}, requires ${maxCharge}).`,
      );
    }
  }

  async register(hub) {
    await this.ensureAccounts();
    await this.ensureStake(hub);
    await hub.methods
      .registerRelay(this.txFee.toString(), 'http://gsn-dev-relayer.openzeppelin.com/')
      .send({ from: this.relayerAddress });
    if (this.debug) console.log(`Registered relayer with address ${this.relayerAddress}`);
  }

  async ensureStake(hub, targetBalance = TARGET_BALANCE, minBalance = MIN_BALANCE) {
    await this.ensureAccounts();
    const currentStake = await this.getCurrentStake(hub);
    const target = new BN(targetBalance);
    const min = new BN(minBalance);

    if (currentStake.gte(min)) {
      if (this.debug) console.log(`Current stake ${currentStake.toString()} is over minimum stake ${min.toString()}`);
      return;
    }

    if (this.debug) console.log(`Staking to reach ${targetBalance.toString()}`);
    await hub.methods
      .stake(this.relayerAddress, UNSTAKE_DELAY.toString())
      .send({ from: this.ownerAddress, value: target.minus(currentStake).toString() });
  }

  async getCurrentStake(hub) {
    await this.ensureAccounts();
    let currentStake;
    try {
      currentStake = (await hub.methods.getRelay(this.relayerAddress).call()).totalStake;
    } catch (err) {
      console.error(`Error getting current relayer stake ${err.message}`)
      currentStake = 0;
    }
    return new BN(currentStake);
  }

  async isRegistered(hub) {
    let currentState;
    try {
      currentState = (await hub.methods.getRelay(this.relayerAddress).call()).state;
    } catch (err) {
      console.error(`Error getting current relayer state ${err.message}`)
      currentState = 0;
    }
    return Number(currentState) === RELAY_STATE.Registered;
  }

  async ensureAccounts() {
    if (this.ownerAddress && this.relayerAddress) return;

    // If the current provider is a PrivateKey one, then eth.getAccounts will return the account
    // that corresponds to signKey. We need to bypass it to get the actual accounts found on the node.
    const web3 = this.web3.currentProvider.isPrivateKeyProvider
      ? new this.web3.constructor(this.web3.currentProvider.baseProvider)
      : this.web3;

    // Get all accounts and take the first two to use as relayer and owner
    let accounts;
    try {
      accounts = await web3.eth.getAccounts();
    } catch (err) {
      throw new Error(
        `Error getting accounts from local node for GSNDevProvider (${err.message}). Please set them manually using the ownerAddress and relayerAddress options.`,
      );
    }

    if (accounts.length < 2) {
      throw new Error(
        `Error setting up owner and relayer accounts for GSNDevProvider (at least two unlocked accounts are needed on the local node but found ${accounts.length}). Please set them manually using the ownerAddress and relayerAddress options.`,
      );
    }
    this.ownerAddress = this.ownerAddress || accounts[0];
    this.relayerAddress = this.relayerAddress || accounts[1];
  }
}

module.exports = DevRelayClient;
