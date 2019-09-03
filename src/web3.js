const GSNProvider = require('./GSNProvider.js');

/**
 * Returns a new web3 instance backed by a GSNProvider
 * @param {*} baseWeb3 wraps the provider of this instance on a GSN one
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function withGSN(baseWeb3, options = {}) {
  const gsnProvider = isGSNProvider(baseWeb3.currentProvider)
    ? baseWeb3.currentProvider
    : new GSNProvider(baseWeb3.currentProvider, options);
  return new baseWeb3.constructor(gsnProvider);
}

/**
 * Modifies a web3 instance to use a GSNProvider
 * @param {*} web3 instance to modify
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function setGSN(web3, options = {}) {
  if (isGSNProvider(web3.currentProvider)) return web3;

  const gsnProvider = new GSNProvider(web3.currentProvider, options);
  web3.setProvider(gsnProvider);
  return web3;
}

function isGSNProvider(provider) {
  return provider.isGSNProvider || provider.constructor.name === 'RelayProvider';
}

module.exports = {
  setGSN,
  withGSN,
  isGSNProvider,
};
