const GSNProvider = require('./GSNProvider.js');
const GSNDevProvider = require('./GSNDevProvider.js');
const web3 = require('./web3.js');
const {
  fixSignature,
  appendAddress,
  makeApproveFunction,
  getRecipientFunds,
  isRelayHubDeployedForRecipient,
  createRelayHub,
} = require('./utils');

module.exports = {
  GSNProvider,
  GSNDevProvider,
  web3,
  utils: {
    fixSignature,
    appendAddress,
    makeApproveFunction,
    getRecipientFunds,
    isRelayHubDeployedForRecipient,
    createRelayHub,
  },
};
