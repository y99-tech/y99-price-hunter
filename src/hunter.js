// The hunt: for every enabled item, search every enabled source with each query, keep matching offers,
// track price history, pick the best price and raise alerts.
const { matches, bestOffer, parsePrice, splitList } = require('./match');
const { searchWoo, searchShopify, pageUrl, EXTRACT } = require('./sources');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => min + Math.random() * (max - min);

class Hunter {
  // deps: { store, fetcher, openPage(url) -> {items, loginWall}, notify(title, body, url), log(msg), emit(state) }
  constructor(deps) {
    Object.assign(this, deps);
    this.running = false;
    this.cancel = false;
    this.progress = null;
  }

  async searchSource(src, q) {
    if (src.kind === 'woo') return searchWoo(src, q, this.fetcher);
    if (src.kind === 'shopify') return searchShopify(src, q, this.fetcher);
    const url = pageUrl(src, q, this.store.data.settings);
    if (!url) throw new Error('No search URL set');
    const res = await this.openPage(url, src.kind, EXTRACT);
    if (res.loginWall) throw new Error('Not signed in — open Accounts and sign in');
    return res.items.map((x) => ({ title: x.title, url: x.url, price: parsePrice(x.priceText), inStock: true, image: x.image, location: x.location }));
  }

  async run(trigger = 'manual', onlyItemId = null) {
    if (this.running) return;
    const d = this.store.data;
    this.running = true;
    this.cancel = false;
    const items = d.items.filter((i) => i.enabled && (!onlyItemId || i.id === onlyItemId));
    const sources = d.sources.filter((s) => s.enabled);
    const run = { id: Date.now(), startedAt: new Date().toISOString(), trigger, items: items.length, offers: 0, alerts: 0, errors: [] };
    const total = items.length * sources.length;
    let done = 0;
    this.emit();

    for (const item of items) {
      if (this.cancel) break;
      const prevBest = bestOffer(item.offers || [])?.price ?? null;
      const seenNow = new Set();
      const errs = [];
      for (const src of sources) {
        if (this.cancel) break;
        this.progress = { item: item.name, source: src.name, done, total };
        this.emit();
        for (const q of splitList(item.queries)) {
          try {
            const found = await this.searchSource(src, q);
            for (const f of found) {
              if (!f.url || !(f.price > 0) || (item.minPrice && f.price < item.minPrice) || !matches(item, f.title)) continue;
              seenNow.add(f.url);
              this.upsertOffer(item, src, f);
            }
          } catch (e) {
            errs.push(`${src.name}: ${e.message}`);
            break; // one failing query usually means the whole source is failing
          }
          // be polite; marketplaces are slower and stricter
          await sleep(process.env.NODE_TEST_CONTEXT ? 0 : src.needsLogin ? jitter(4000, 9000) : jitter(400, 1200));
        }
        done++;
      }
      // anything from a source we searched successfully but didn't see again is gone
      const okSources = new Set(sources.filter((s) => !errs.some((e) => e.startsWith(s.name + ':'))).map((s) => s.key));
      for (const o of item.offers) if (okSources.has(o.source) && !seenNow.has(o.url) && !o.manual) o.gone = true;

      const best = bestOffer(item.offers);
      item.lastRun = new Date().toISOString();
      item.lastError = errs.length ? errs.join(' · ') : null;
      run.offers += seenNow.size;
      if (errs.length) run.errors.push(`${item.name}: ${errs.join(' · ')}`);

      if (best) {
        const hitTarget = item.targetPrice && best.price <= item.targetPrice;
        const newLow = prevBest != null && best.price < prevBest;
        if (hitTarget || newLow) {
          run.alerts++;
          const why = hitTarget ? `at or under your target ${fmt(item.targetPrice)}` : `down from ${fmt(prevBest)}`;
          d.alerts.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), itemId: item.id, item: item.name, price: best.price, source: best.sourceName, url: best.url, why, read: false });
          d.alerts = d.alerts.slice(0, 200);
          this.notify(`${item.name}: ${fmt(best.price)}`, `${best.sourceName} — ${why}`, best.url);
        }
      }
      this.store.save();
      this.emit();
    }

    run.finishedAt = new Date().toISOString();
    d.runs.unshift(run);
    d.runs = d.runs.slice(0, 50);
    d.lastRunAt = run.finishedAt;
    this.store.save();
    this.running = false;
    this.progress = null;
    this.log(`Hunt finished: ${run.items} items, ${run.offers} offers, ${run.alerts} alerts`);
    this.emit();
    return run;
  }

  upsertOffer(item, src, f) {
    const now = new Date().toISOString();
    let o = item.offers.find((x) => x.url === f.url);
    if (!o) {
      o = { url: f.url, source: src.key, sourceName: src.name, firstSeen: now, history: [] };
      item.offers.push(o);
    }
    if (o.price !== f.price) o.history.push({ at: now, price: f.price });
    o.history = o.history.slice(-60);
    o.prevPrice = o.price ?? null;
    Object.assign(o, {
      title: f.title, price: f.price, regularPrice: f.regularPrice || null, inStock: f.inStock !== false,
      image: f.image || o.image || null, location: f.location || o.location || '', lastSeen: now, gone: false,
      lowPrice: Math.min(o.lowPrice ?? f.price, f.price),
    });
  }
}

const fmt = (n) => `EGP ${Math.round(n).toLocaleString('en-US')}`;

module.exports = { Hunter };
