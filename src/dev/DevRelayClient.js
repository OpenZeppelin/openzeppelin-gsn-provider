const HubAbi = require('../tabookey-gasless/IRelayHub');
const RecipientAbi = require('../tabookey-gasless/IRelayRecipient');
const BN = require('bignumber.js');
const { getApprovalData, appendAddress, preconditionCodeToDescription } = require('../utils');
const { getTransactionHash, getTransactionSignature } = require('../tabookey-gasless/utils');

const TARGET_BALANCE = 2e18;
const MIN_BALANCE = 2e17;
const UNSTAKE_DELAY = 3600 * 24 * 7 * 4;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

class DevRelayClient {
  constructor(web3, ownerAddress, relayerAddress, opts={}) {
    if (!ownerAddress) throw new Error(`Relayer owner address is required`);
    if (!relayerAddress) throw new Error(`Relayer address is required`);

    this.ownerAddress = ownerAddress;
    this.relayerAddress = relayerAddress;
    this.txFee = opts.txFee || 10;
    this.web3 = web3;
    this.approveFunction = opts.approveFunction;
    this.options = opts;
    this.debug = opts.debug;
  }

  async sendTransaction(payload) {
    // Start by registering in the relayer hub
    const txParams = payload.params[0];
    const hub = await this.getHubFromRecipient(txParams.to);
    await this.register(hub);

    // Then sign the transaction as a regular provider would do
    const nonce = parseInt(await hub.methods.getNonce(txParams.from).call());
    const gasPrice = this.options.fixedGasPrice || txParams.gasPrice || await this.web3.eth.getGasPrice();
    const gas = this.options.fixedGasLimit || txParams.gas || await this.estimateGas(txParams, hub.options.address);
    
    await this.validateRecipientBalance(hub, txParams.to, gas, gasPrice);
    if (this.debug) console.log(`Recipient has enough balance to pay for meta tx`);

    const txHashToSign = getTransactionHash(
      txParams.from, txParams.to, txParams.data, this.txFee, gasPrice, gas, nonce, 
      hub.options.address, this.relayerAddress
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
      relayHubAddress: hub.options.address
    });
    if (this.approvalData !== '0x' && this.debug) console.log(`Approval data is ${approvalData}`);
    
    // Here the client would send the txParams, signature, and approvalData to the relayer
    // Instead, we send it from the same process, posing as a relayer
    await this.validateCanRelay(hub, txParams, gasPrice, gas, nonce, signature, approvalData);
    if (this.debug) console.log(`Can relay check succeeded`);

    const requiredGas = await hub.methods.requiredGas(gas.toString()).call();
    if (this.debug) console.log(`Relaying transaction with gas ${requiredGas}`);

    return new Promise((resolve, reject) => {
      hub.methods.relayCall(
        txParams.from, txParams.to, txParams.data, this.txFee, gasPrice, gas, nonce, signature, approvalData
      ).send({ from: this.relayerAddress, gasPrice, gas: requiredGas })
      .on('transactionHash', (txHash) => {
        resolve(txHash);
      })
      .on('error', (err) => {
        reject(err);
      })
    });
  }

  async validateCanRelay(hub, txParams, gasPrice, gas, nonce, signature, approvalData) {
    let status, recipientContext;
    try {
      ({ status, recipientContext } = await hub.methods.canRelay(
        this.relayerAddress, txParams.from, txParams.to, txParams.data, this.txFee, gasPrice, gas, nonce, signature, approvalData
      ).call({ from: this.relayerAddress }));
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
      const hub = await this.getHubFromRecipient(txParams.to);
      hubAddress = hub.options.address;
    }
    const txParamsFromHub = {
      ... txParams, 
      from: hubAddress,
      data: appendAddress(txParams.data, txParams.from)
    }
    return this.web3.eth.estimateGas(txParamsFromHub);
  }

  async validateRecipientBalance(hub, recipient, gasLimit, gasPrice) {
    const relayFee = this.txFee;
    const balance = await hub.methods.balanceOf(recipient).call();
    if (BN(balance).isZero()) {
      throw new Error(`Recipient ${recipient} has no funds for paying for relayed calls on the relay hub.`)
    }

    const maxCharge = await hub.methods.maxPossibleCharge(gasLimit, gasPrice, relayFee).call();
    if (BN(maxCharge).isGreaterThan(BN(balance))) {
      throw new Error(`Recipient ${recipient} has not enough funds for paying for this relayed call (has ${balance}, requires ${maxCharge}).`);
    }
}

  async getHubFromRecipient(recipientAddress) {
    if (!recipientAddress) throw new Error(`Recipient address is required`);
    const recipient = new this.web3.eth.Contract(RecipientAbi, recipientAddress);
    
    let hubAddress;
    try {
      hubAddress = await recipient.methods.getHubAddr().call();
    } catch (err) {
      throw new Error(`Could not get relay hub address from recipient at ${recipientAddress}: ${err.message || err}`);
    }
    
    if (hubAddress === ZERO_ADDRESS) {
      throw new Error(`The relay hub address is set to zero in recipient at ${recipientAddress}. Make sure it is a valid recipient contract.`);
    }

    const hub = new this.web3.eth.Contract(HubAbi, hubAddress);

    let hubVersion;
    try {
      hubVersion = await hub.methods.version().call();
    } catch (err) {
      throw new Error(`Could not query relay hub version at ${hubAddress} (${err.message}). Make sure the address corresponds to a relay hub.`);
    }

    if (!hubVersion.startsWith('1')) {
        throw new Error(`Unsupported relay hub version '${hubVersion}'.`);
    }
    return hub;
  }

  async register(hub) {
    await this.ensureStake(hub);
    await hub.methods.registerRelay(this.txFee.toString(), "http://gsn-dev-relayer.openzeppelin.com/").send({ from: this.relayerAddress });
    if (this.debug) console.log(`Registered relayer with address ${this.relayerAddress}`);
  }

  async ensureStake(hub, targetBalance=TARGET_BALANCE, minBalance=MIN_BALANCE) {
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
    let currentStake;
    try {
      currentStake = (await hub.methods.getRelay(this.relayerAddress).call()).totalStake;
    } catch(err) {
      currentStake = 0;
    }
    return new BN(currentStake);
  }
}

module.exports = DevRelayClient;