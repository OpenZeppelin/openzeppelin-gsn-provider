const { DevRelayClient } = require('./dev');
const GSNProvider = require('./GSNProvider');

class GSNDevProvider extends GSNProvider {
  constructor(base, options = {}) {
    super(base, options);

    // Overwrite relayClient with development one
    this.relayClient = new DevRelayClient(this.relayClient.web3, options.ownerAddress, options.relayerAddress, options);
  }
}

module.exports = GSNDevProvider;
