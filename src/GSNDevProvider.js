const Web3 = require('web3');
const { DevRelayClient } = require('./dev');
const GSNProvider = require('./GSNProvider');

class GSNDevProvider extends GSNProvider {
  constructor(base, options = {}) {
    super(base, options);

    // Overwrite relayClient with development one
    this.relayClient = new DevRelayClient(
      this.relayClient.web3, 
      options.ownerAddress, 
      options.relayerAddress, 
      options
    );
  }
}

GSNDevProvider.default = async function(base = 'http://localhost:8545', options = {}) {
  const web3 = new Web3(base);
  const accounts = await web3.eth.getAccounts();
  const ownerAddress = options.ownerAddress || accounts[0];
  const relayerAddress = options.relayerAddress || accounts[1];
  return new GSNDevProvider(base, {
    ...options,
    ownerAddress,
    relayerAddress
  })
  
}

module.exports = GSNDevProvider;
