const ProviderEngine = require("web3-provider-engine");
const ProviderSubprovider = require('web3-provider-engine/subproviders/provider');
const WalletSubprovider = require('web3-provider-engine/subproviders/wallet');
const EthereumjsWallet = require('ethereumjs-wallet');

class PrivateKeyProvider {
  constructor(base, privateKey, options = {}) {
    // Build ethereumjs-wallet from privateKey
    if (!privateKey) throw new Error("Private key must be set");
    if (privateKey.privateKey) privateKey = privateKey.privateKey;
    const keyBuffer = typeof(privateKey) === 'string' 
      ? new Buffer(privateKey.replace(/^0x/, ''), "hex")
      : privateKey;
    const wallet = EthereumjsWallet.fromPrivateKey(keyBuffer);
    
    // Patch base provider if needed
    if (base.send && !base.sendAsync) {
      base.sendAsync = base.send.bind(base);
    }

    const engine = new ProviderEngine();
    engine.addProvider(new WalletSubprovider(wallet, options));
    engine.addProvider(new ProviderSubprovider(base));
    engine.start();

    this.engine = engine;
  }

  send() {
    return this.engine.send.apply(this.engine, arguments);
  }

  sendAsync() {
    return this.engine.sendAsync.apply(this.engine, arguments);
  };
}

module.exports = PrivateKeyProvider;
