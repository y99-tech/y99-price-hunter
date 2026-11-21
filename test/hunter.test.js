const test = require('node:test');
const assert = require('node:assert');
const { Hunter } = require('../src/hunter');

test('hunt finds best offer, filters, alerts on target', async () => {
  const data = {
    settings: { fbCity: 'cairo' },
    sources: [
      { key: 'w', name: 'WooShop', host: 'woo.test', kind: 'woo', enabled: true },
      { key: 's', name: 'ShopifyShop', host: 'shop.test', kind: 'shopify', enabled: true },
      { key: 'olx', name: 'OLX', host: 'x', kind: 'olx', enabled: true, needsLogin: false },
    ],
    items: [{ id: 'a', name: 'FZ100', queries: 'FZ100', must: 'fz100', exclude: 'charger', minPrice: 300, targetPrice: 900, value: 2000, enabled: true, offers: [] }],
    alerts: [], runs: [], lastRunAt: null,
  };
  const fetcher = async (url) => ({
    ok: true,
    json: async () => url.includes('woo.test')
      ? [{ name: 'Sony NP-FZ100', permalink: 'https://woo.test/p1', prices: { price: '120000', regular_price: '150000', currency_minor_unit: 2 }, is_in_stock: true, images: [] },
         { name: 'FZ100 charger', permalink: 'https://woo.test/p2', prices: { price: '50000', currency_minor_unit: 2 }, is_in_stock: true, images: [] }]
      : { resources: { results: { products: [{ title: 'Beston NP-FZ100', url: '/products/b', price: '850.00', available: true }] } } },
  });
  const openPage = async () => ({ items: [{ title: 'Sony FZ100 used', url: 'https://olx/1', priceText: 'EGP 120' }, { title: 'FZ100 original', url: 'https://olx/2', priceText: 'EGP 1,000' }], loginWall: false });
  const notes = [];
  const h = new Hunter({ store: { data, save() {} }, fetcher, openPage, notify: (t) => notes.push(t), log() {}, emit() {} });
  // first run: no previous best, so only target can alert
  await h.run('test');
  const it = data.items[0];
  const live = it.offers.filter((o) => !o.gone).map((o) => [o.sourceName, o.price]).sort();
  assert.deepStrictEqual(live, [['OLX', 1000], ['ShopifyShop', 850], ['WooShop', 1200]]);
  assert.equal(data.alerts.length, 1);
  assert.match(notes[0], /EGP 850/);
  assert.equal(it.offers.find((o) => o.sourceName === 'ShopifyShop').url, 'https://shop.test/products/b');
});
