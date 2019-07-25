const Web3 = require('web3');
const RelayClient = require('./RelayClient');

class GSNProvider {
  constructor(base, options) {
    const web3 = new Web3(base);
    this.baseSend = (base.sendAsync || base.send).bind(base);
    this.relayClient = new RelayClient(web3, options);
    this.useGSN = (options && typeof(options.useGSN) !== "undefined") ? options.useGSN : true;
    if (options.signKey) this.relayClient.useKeypairForSigning(options.signKey);
    this.isGSNProvider = true;
  }

  send(payload, callback) {
    if (!this.withGSN(payload)) {
      return this.baseSend(callback);
    }

    switch (payload.method) {
      case 'eth_sendTransaction':
        this.relayClient.runRelay(payload, callback);
        return;

      case 'eth_getTransactionReceipt':
        this.baseSend(payload, (err, receipt) => {
          if (err) callback(err, null);
          else callback(null, this.relayClient.fixTransactionReceiptResp(receipt));
        });
        return;

      default:
        return this.baseSend(callback);
    }
  }

  sendAsync(payload, callback) {
    return this.send(payload, callback);
  }

  useKey(key) {
    this.relayClient.useKeypairForSigning(key);
  }

  withGSN(payload) {
    const useGSN = payload[0].useGSN;
    if (typeof(useGSN) !== 'undefined') {
      return useGSN;
    }

    return (typeof(this.useGSN) === 'function')
      ? this.useGSN(payload)
      : this.useGSN;
  }
}

module.exports = GSNProvider;
