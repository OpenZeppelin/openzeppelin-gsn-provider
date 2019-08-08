const Web3 = require('web3');
const { createSignKey, HARDCODED_RELAYER_OPTS } = require('../utils');

const PROVIDER_URL = process.env.PROVIDER_URL || 'http://localhost:9545';

const expect = require('chai')
  .use(require('chai-as-promised'))
  .expect;

function handlesSubscriptions(createProviderFn) {
  context('on subscriptions', function () {
    async function testSubscription(provider) {
      this.greeter.setProvider(provider);

      let event = null;
      this.greeter.events.Greeted()
        .on('data', data => { event = data; });
      await this.greeter.methods.greet("Hello").send({ from: this.sender, useGSN: false });
      await provider.disconnect();

      expect(event).to.exist;
      expect(event.returnValues.message).to.eq("Hello");
    }

    it('subscribes to events with ws provider', async function () {
      const provider = (new Web3(PROVIDER_URL.replace(/^http/, 'ws'))).currentProvider;
      await testSubscription.call(this, provider);
    });

    it('subscribes to events with gsn ws provider', async function () {
      const gsnProvider = await createProviderFn(PROVIDER_URL.replace(/^http/, 'ws'), HARDCODED_RELAYER_OPTS);
      await testSubscription.call(this, gsnProvider);
    });

    it('subscribes to events with gsn ws provider with sign key', async function () {
      const gsnProvider = await createProviderFn(PROVIDER_URL.replace(/^http/, 'ws'), {
        ... HARDCODED_RELAYER_OPTS,
        signKey: createSignKey()
      });
      await testSubscription.call(this, gsnProvider);
    });
  });
}

module.exports = handlesSubscriptions;