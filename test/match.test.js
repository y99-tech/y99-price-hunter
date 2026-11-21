const test = require('node:test');
const assert = require('node:assert');
const { parsePrice, matches, bestOffer } = require('../src/match');

test('parsePrice handles Egyptian formats', () => {
  assert.equal(parsePrice('EGP 12,500'), 12500);
  assert.equal(parsePrice('12.500 ج.م'), 12500);
  assert.equal(parsePrice('LE 1,250.00'), 1250);
  assert.equal(parsePrice('١٬٢٥٠ جنيه'), 1250);
  assert.equal(parsePrice('EGP1,999'), 1999);
  assert.equal(parsePrice('850'), 850);
  assert.equal(parsePrice('1250.5'), 1250.5);
  assert.equal(parsePrice('Free'), null);
  assert.equal(parsePrice(2999), 2999);
});

test('matches uses must and exclude', () => {
  const item = { must: 'fz100', exclude: 'dummy, charger, kit' };
  assert.ok(matches(item, 'Sony NP-FZ100 Battery'));
  assert.ok(matches(item, 'Beston NP FZ-100 battery'));
  assert.ok(!matches(item, 'NP-FZ100 Dummy Battery'));
  assert.ok(!matches(item, 'Dual charger for NP-FZ100'));
  assert.ok(!matches(item, 'Canon LP-E6 battery'));
  assert.ok(matches({ must: '', exclude: '' }, 'anything'));
});

test('bestOffer skips gone and out-of-stock', () => {
  const b = bestOffer([{ price: 500, gone: true }, { price: 700, inStock: false }, { price: 900 }, { price: 850 }]);
  assert.equal(b.price, 850);
});
