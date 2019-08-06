const ethUtils = require('ethereumjs-util');

function appendAddress(data, address) {
  return data + ethUtils.setLengthLeft(ethUtils.toBuffer(address), 32).toString('hex');
}

function callAsJsonRpc(fn, args, id, callback, mapResponseFn = (x => ({ result: x }))) {
  const response = { jsonrpc: "2.0", id };
  try {
    fn(...args)
      .then(result => { 
        callback(null, { ...response, ...mapResponseFn(result) });
      })
      .catch(err => { 
        callback({ ...response, error: err.toString() }, null);
      });
  } catch (err) {
    callback({ ... response, error: err.toString() });
  }
}


module.exports = {
  appendAddress,
  callAsJsonRpc
}