const GSNProvider = require('./GSNProvider.js');

/**
 * Modifies a web3 instance to use a GSNProvider
 * @param {*} web3 instance to modify
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function onWeb3(web3, options = {}) {
  if (isGSNProvider(web3.currentProvider)) return;

  const gsnProvider = new GSNProvider(web3.currentProvider, options);
  web3.setProvider(gsnProvider);
  return web3;
}

function isGSNProvider(provider) {
  return (provider.isGSNProvider || provider.constructor.name === 'RelayProvider');
}

module.exports = {
  onWeb3,
};
