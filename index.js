const Provider = require('./src/Provider.js');

/**
 * Modifies a web3 instance to use a GSNProvider
 * @param {*} web3 instance to modify
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function useGSN(web3, options) {
  const base = web3.currentProvider;
  if (base.isGSNProvider || base.constructor.name === 'RelayProvider') return;
  const provider = new Provider(base, options || {});
  web3.setProvider(provider);
  return web3;
}

module.exports = {
  Provider,
  useGSN
};
