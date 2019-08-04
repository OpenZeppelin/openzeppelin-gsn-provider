const Web3 = require('web3');
const RelayClient = require('./tabookey-gasless/RelayClient');
const PrivateKeyProvider = require('./PrivateKeyProvider');

class GSNProvider {
  constructor(base, options = {}) {
    const web3 = new Web3(base);
    this._delegateToProvider(web3.currentProvider);
    this._wrapWithPrivateKey(web3, options);
    
    base = web3.currentProvider;
    this.baseProvider = base;
    this.baseSend = (base.sendAsync || base.send).bind(base);
    
    this.sendAsync = this.send.bind(this);
    this.relayClient = new RelayClient(web3, options);
    this.useGSN = (options && typeof(options.useGSN) !== "undefined") ? options.useGSN : true;
    this.isGSNProvider = true;
  }

  send(payload, callback) {
    if (!this.withGSN(payload)) {
      return this.baseSend(payload, callback);
    }

    switch (payload.method) {
      case 'eth_sendTransaction':
        // Use sign key address if set  
        const txParams = payload.params[0];
        if (!txParams.from && this.base.address) txParams.from = this.base.address;
        this.relayClient.runRelay(payload, callback);
        return;

      case 'eth_getTransactionReceipt':
        this.baseSend(payload, (err, receipt) => {
          if (err) callback(err, null);
          else callback(null, this.relayClient.fixTransactionReceiptResp(receipt));
        });
        return;

      default:
        return this.baseSend(payload, callback);
    }
  }

  withGSN(payload) {
    if (payload.method === 'eth_sendTransaction') {
      const useGSN = payload.params[0].useGSN;
      if (typeof(useGSN) !== 'undefined') {
        return useGSN;
      }
    }

    return (typeof(this.useGSN) === 'function')
      ? this.useGSN(payload)
      : this.useGSN;
  }

  _delegateToProvider(provider) {
    const delegate = fn => {
      if (provider[fn]) this[fn] = provider[fn].bind(provider);
    }
    
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
