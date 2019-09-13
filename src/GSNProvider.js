const Web3 = require('web3');
const RelayClient = require('./tabookey-gasless/RelayClient');
const PrivateKeyProvider = require('./PrivateKeyProvider');
const { callAsJsonRpc, fixTransactionReceiptResponse } = require('./utils');

class GSNProvider {
  constructor(base, options = {}) {
    const web3 = new Web3(base);
    this._delegateToProvider(web3.currentProvider);
    this._wrapWithPrivateKey(web3, options);

    base = web3.currentProvider;
    this.baseProvider = base;
    this.baseSend = (base.sendAsync || base.send).bind(base);

    this.sendAsync = this.send.bind(this);
    this.relayClient = new RelayClient(web3, {
      ...options,
      userAgent: `oz-gsn-provider-${require('../package.json').version}`,
    });
    this.useGSN = options && typeof options.useGSN !== 'undefined' ? options.useGSN : true;
    this.isGSNProvider = true;
    this.options = options;
    this.relayedTxs = new Set();
  }

  send(payload, callback) {
    switch (payload.method) {
      case 'eth_sendTransaction':
        if (this._handleSendTransaction(payload, callback)) return;
        break;

      case 'eth_estimateGas':
        if (this._handleEstimateGas(payload, callback)) return;
        break;

      case 'eth_getTransactionReceipt':
        if (this._handleGetTransactionReceipt(payload, callback)) return;
        break;
    }

    // Default by sending to base provider
    return this.baseSend(payload, callback);
  }

  _handleGetTransactionReceipt(payload, callback) {
    // Check for GSN usage
    const txHash = payload.params[0];
    if (!this._withGSN(payload) && !this.relayedTxs.has(txHash)) return false;

    // Set error status if tx was rejected
    this.baseSend(payload, (err, receipt) => {
      if (err) callback(err, null);
      else callback(null, fixTransactionReceiptResponse(receipt, this.options.verbose));
    });

    return true;
  }

  _handleSendTransaction(payload, callback) {
    // Check for GSN usage
    const txParams = payload.params[0];
    if (!this._withGSN(payload, txParams)) return false;

    // Use sign key address if set
    if (!txParams.from && this.base.address) txParams.from = this.base.address;

    // TODO: move validations to the relay client
    if (!txParams.to) {
      return callback(new Error('Cannot deploy a new contract via the GSN'), null);
    }
    if (txParams.value) {
      const strValue = txParams.value.toString();
      if (strValue !== '0' && strValue !== '0x0') {
        return callback(new Error('Cannot send funds via the GSN'), null);
      }
    }

    // Delegate to relay client
    callAsJsonRpc(this.relayClient.sendTransaction.bind(this.relayClient), [payload], payload.id, callback, txHash => {
      this.relayedTxs.add(txHash);
      return { result: txHash };
    });

    return true;
  }

  _handleEstimateGas(payload, callback) {
    const txParams = payload.params[0];
    if (!this._withGSN(payload, txParams)) return false;
    callAsJsonRpc(this.relayClient.estimateGas.bind(this.relayClient), [txParams], payload.id, callback);

    return true;
  }

  _withGSN(payload, options) {
    if (options) {
      const useGSN = options.useGSN;
      if (typeof useGSN !== 'undefined') {
        return useGSN;
      }
    }

    return typeof this.useGSN === 'function' ? this.useGSN(payload) : this.useGSN;
  }

  _delegateToProvider(provider) {
    const delegate = fn => {
      if (provider[fn]) this[fn] = provider[fn].bind(provider);
    };

    // If the subprovider is a ws or ipc provider, then register all its methods on this provider
    // and delegate calls to the subprovider. This allows subscriptions to work.
    delegate('on');
    delegate('removeListener');
    delegate('removeAllListeners');
    delegate('reset');
    delegate('disconnect');
    delegate('addDefaultEvents');
    delegate('once');
    delegate('reconnect');
  }

  _wrapWithPrivateKey(web3, options) {
    if (options.signKey) {
      const provider = new PrivateKeyProvider(web3.currentProvider, options.signKey);
      web3.setProvider(provider);
    }
  }
}

module.exports = GSNProvider;
