const GSNProvider = require('./GSNProvider.js');

/**
 * Modifies a web3 instance to use a GSNProvider
 * @param {*} web3 instance to modify
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function onWeb3(web3, options) {
  if (isGSNProvider(web3.currentProvider)) return;

  const gsnProvider = new GSNProvider(web3.currentProvider, options || {});
  web3.setProvider(gsnProvider);
  return web3;
}

/**
 * Returns a copy of a truffle contract instance, set to use a GSNProvider
 * @param {*} instance instance to copy. This is not mutated
 * @param {*} options useGSN, signKey, other RelayClient options
 */
function onTruffleContract(instance, options) {
  // truffle-contract instances don't each have their own provider: rather, they go through their parent's (the
  // 'contract abstraction'). We therefore need to create a new contract abstraction, configure it to use the relay
  // provider, and create a new contract instance for that abstraction.

  if (isGSNProvider(instance.constructor.web3.currentProvider)) return;

  // Contract abstractions have a .clone method that copies all values for a new network id (the same one, in this
  // case), except the class_defaults (e.g. default from address), so we manually copy that one.
  const abstractionWithGSNProvider = instance.constructor.clone(instance.constructor.network_id);
  abstractionWithGSNProvider.class_defaults = Object.assign({}, instance.constructor.class_defaults);

  abstractionWithGSNProvider.setProvider(new GSNProvider(web3.eth.currentProvider, options));

  return abstractionWithGSNProvider.at(instance.address);
}

function isGSNProvider(provider) {
  return (provider.isGSNProvider || provider.constructor.name === 'RelayProvider');
}

module.exports = {
  onWeb3,
  onTruffleContract,
};
