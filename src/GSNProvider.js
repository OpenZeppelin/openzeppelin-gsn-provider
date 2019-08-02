const Web3 = require('web3');
const RelayClient = require('./tabookey-gasless/RelayClient');
const PrivateKeyProvider = require('./PrivateKeyProvider');

class GSNProvider {
  constructor(base, options = {}) {
    if (typeof(base) === 'string') {
      base = new Web3.providers.HttpProvider(base);
    }

    if (options.signKey) {
      base = new PrivateKeyProvider(base, options.signKey);
    }

    const web3 = new Web3(base);
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
}

module.exports = GSNProvider;
