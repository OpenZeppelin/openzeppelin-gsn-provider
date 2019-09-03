const { fromPrivateKey } = require('ethereumjs-wallet');
const { callAsJsonRpc } = require('./utils');
const ethUtil = require('ethereumjs-util');
const sigUtil = require('eth-sig-util');
const EthereumTx = require('ethereumjs-tx');

class PrivateKeyProvider {
  constructor(base, privateKey) {
    // Build ethereumjs-wallet from privateKey
    this.wallet = this._getWalletFromPrivateKey(privateKey);
    this.address = ethUtil.toChecksumAddress(ethUtil.bufferToHex(this.wallet.getAddress()));

    // Patch base provider if needed
    this.baseSend = (base.sendAsync || base.send).bind(base);
    this.sendAsync = this.send.bind(this);
    this.baseProvider = base;

    this.messageId = 0;
    this.isPrivateKeyProvider = true;
  }

  send(payload, callback) {
    let from, data, txParams, signature;
    const id = payload.id;

    switch (payload.method) {
      case 'eth_accounts':
        callAsJsonRpc(this.ethAccounts.bind(this), [], id, callback);
        break;

      case 'eth_sign':
        [from, data] = payload.params;
        callAsJsonRpc(this.ethSign.bind(this), [from, data], id, callback);
        break;

      case 'eth_signTransaction':
        [txParams] = payload.params;
        callAsJsonRpc(this.ethSignTransaction.bind(this), [txParams], id, callback, signedTx => ({
          tx: txParams,
          raw: signedTx,
        }));
        break;

      case 'eth_signTypedData':
        [from, data] = payload.params;
        callAsJsonRpc(this.ethSignTypedData.bind(this), [from, data], id, callback);
        break;

      case 'eth_sendTransaction':
        // TODO: Implement this method before releasing this as a standalone provider
        return this.baseSend(payload, callback);

      case 'personal_sign':
        [data, from] = payload.params;
        callAsJsonRpc(this.personalSign.bind(this), [from, data], id, callback);
        break;

      case 'personal_ecRecover':
        [data, signature] = payload.params;
        callAsJsonRpc(this.personalEcRecover.bind(this), [data, signature], id, callback);
        break;

      default:
        return this.baseSend(payload, callback);
    }
  }

  async ethAccounts() {
    return [this.address];
  }

  // Adapted from https://github.com/MetaMask/web3-provider-engine/blob/master/subproviders/hooked-wallet-ethtx.js
  async ethSign(signer, data) {
    this._validateSigner(signer);
    if (!data) throw new Error('Data to sign cannot be null');

    const dataBuff = ethUtil.toBuffer(data);
    const msgHash = ethUtil.hashPersonalMessage(dataBuff);
    const sig = ethUtil.ecsign(msgHash, this.wallet.getPrivateKey());
    return ethUtil.bufferToHex(concatSig(sig.v, sig.r, sig.s));
  }

  async ethSignTypedData(signer, data) {
    this._validateSigner(signer);
    if (!data) throw new Error('Data to sign cannot be null');
    return sigUtil.signTypedData(this.wallet.getPrivateKey(), { data });
  }

  async personalSign(signer, data) {
    this._validateSigner(signer);
    if (!data) throw new Error('Data to sign cannot be null');
    return sigUtil.personalSign(this.wallet.getPrivateKey(), { data });
  }

  async personalEcRecover(data, sig) {
    if (!sig) throw new Error('Signature for ecRecover cannot be null');
    if (!data) throw new Error('Data for ecRecover cannot be null');
    return sigUtil.recoverPersonalSignature({ data, sig });
  }

  // Adapted from https://github.com/MetaMask/web3-provider-engine/blob/master/subproviders/hooked-wallet-ethtx.js
  async ethSignTransaction(txData) {
    this._validateSigner(txData.from);

    // TODO: Fill in gas, gasPrice, and nonce if missing instead of failing
    if (!txData.gas && !txData.gasLimit) throw new Error(`Gas limit for transaction is required (${txData})`);
    if (!txData.gasPrice) throw new Error(`Gas price for transaction is required (${txData})`);
    if (!txData.nonce) throw new Error(`Nonce for transaction is required (${txData})`);

    // Format gas, value, and data for ethereum-tx
    if (txData.gas !== undefined) txData.gasLimit = txData.gas;
    txData.value = txData.value || '0x00';
    txData.data = ethUtil.addHexPrefix(txData.data);

    // Build ethereum-tx object and sign it
    const privateKey = this.wallet.getPrivateKey();
    const tx = new EthereumTx(txData);
    tx.sign(privateKey);
    return ethUtil.bufferToHex(tx.serialize());
  }

  _validateSigner(signer) {
    if (!signer) {
      throw new Error(`Signer address is required`);
    }
    if (signer.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(`Unknown signer ${signer} (current signer is ${this.address})`);
    }
  }

  _getWalletFromPrivateKey(privateKey) {
    if (!privateKey) throw new Error('Private key must be set');
    // This is an ethereumjs-wallet already
    if (privateKey.getPrivateKey && privateKey.getAddress) return privateKey;
    // This is an object that contains the private key
    if (privateKey.privateKey) privateKey = privateKey.privateKey;
    // Transform the private key into a buffer
    const keyBuffer = typeof privateKey === 'string' ? new Buffer(privateKey.replace(/^0x/, ''), 'hex') : privateKey;
    // Build the wallet from the key
    return fromPrivateKey(keyBuffer);
  }
}

// Copied from https://github.com/MetaMask/web3-provider-engine/blob/master/subproviders/hooked-wallet-ethtx.js
function concatSig(v, r, s) {
  r = ethUtil.fromSigned(r);
  s = ethUtil.fromSigned(s);
  v = ethUtil.bufferToInt(v);
  r = ethUtil
    .toUnsigned(r)
    .toString('hex')
    .padStart(64, 0);
  s = ethUtil
    .toUnsigned(s)
    .toString('hex')
    .padStart(64, 0);
  v = ethUtil.stripHexPrefix(ethUtil.intToHex(v));
  return ethUtil.addHexPrefix(r.concat(s, v).toString('hex'));
}

module.exports = PrivateKeyProvider;
