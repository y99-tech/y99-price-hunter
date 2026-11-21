// Source adapters. Each returns [{ title, url, price, regularPrice, inStock, image }].
//
//  woo      – WooCommerce Store API (public JSON, no login)
//  shopify  – Shopify search suggest (public JSON, no login)
//  web      – any store: open its search page in a hidden window and read product cards
//  facebook – Facebook Marketplace search, inside the user's own logged-in session
//  olx      – OLX search, inside the user's own logged-in session
//
// "Own session" means the user signs in once in the app's built-in login window (Accounts tab).
// Those cookies live only in the app's private browser profile on the user's computer and are never
// copied anywhere else.

const { parsePrice } = require('./match');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const BUILTIN_SOURCES = [
  { key: 'facebook', name: 'Facebook Marketplace', host: 'www.facebook.com', kind: 'facebook', icon: '📘', enabled: true, needsLogin: true },
  { key: 'olx', name: 'OLX Egypt (dubizzle)', host: 'www.dubizzle.com.eg', kind: 'olx', icon: '🟣', enabled: true, needsLogin: true },
  { key: 'shams', name: 'Shams Stores', host: 'shams-stores.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'dotcam', name: 'Dot Cam Stores', host: 'dotcamstores.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'raystore', name: 'RayStore', host: 'raystoreeg.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'general', name: 'General Group', host: 'general.eg', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'cam-market', name: 'Cam Market', host: 'cam-market.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'kingdigital', name: 'King Digital', host: 'kingdigitaleg.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'lordcam', name: 'Lord Cam Store', host: 'lord-camstore.com', kind: 'woo', icon: '🛒', enabled: true },
  { key: 'fotoexpress', name: 'Fotoexpress', host: 'fotoexpresseg.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'ennap', name: 'Ennap', host: 'ennap.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'dokkantech', name: 'DokkanTech', host: 'dokkantech.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'elyamama', name: 'El Yamama Store', host: 'elyamamastore.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'firstmobile', name: 'First Mobile Store', host: 'firstmobilestore.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'ahw', name: 'AHW Store', host: 'ahw.store', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'dmt', name: 'DMT Stores', host: 'www.dmt-stores.com', kind: 'shopify', icon: '🛍️', enabled: true },
  { key: 'camerax', name: 'CameraX', host: 'www.cameraxstore.com', kind: 'web', searchUrl: 'https://www.cameraxstore.com/search-products?q={q}', icon: '🌐', enabled: true },
  { key: 'esacam', name: 'ESA CAM', host: 'esacamstore.com', kind: 'web', searchUrl: 'https://esacamstore.com/store?search={q}', icon: '🌐', enabled: true },
];

async function getJson(fetcher, url) {
  const res = await fetcher(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchWoo(src, q, fetcher) {
  const url = `https://${src.host}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=30`;
  const list = await getJson(fetcher, url);
  return (Array.isArray(list) ? list : []).map((p) => {
    const minor = Number(p.prices?.currency_minor_unit ?? 2);
    const div = 10 ** minor;
    const price = p.prices?.price ? Number(p.prices.price) / div : null;
    const reg = p.prices?.regular_price ? Number(p.prices.regular_price) / div : null;
    return {
      title: decodeEntities(p.name),
      url: p.permalink,
      price,
      regularPrice: reg && reg !== price ? reg : null,
      inStock: p.is_in_stock !== false,
      image: p.images?.[0]?.src || null,
    };
  });
}

async function searchShopify(src, q, fetcher) {
  const url = `https://${src.host}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=10`;
  const data = await getJson(fetcher, url);
  const list = data?.resources?.results?.products || [];
  return list.map((p) => ({
    title: decodeEntities(p.title),
    url: p.url ? new URL(p.url, `https://${src.host}`).href : null,
    price: parsePrice(p.price),
    regularPrice: parsePrice(p.compare_at_price_max) || null,
    inStock: p.available !== false,
    image: p.image || p.featured_image?.url || null,
  }));
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '').trim();
}

// Search-page URLs for the page-reading sources.
function pageUrl(src, q, settings) {
  const enc = encodeURIComponent(q);
  if (src.kind === 'facebook') {
    const city = (settings.fbCity || 'cairo').trim() || 'cairo';
    return `https://www.facebook.com/marketplace/${encodeURIComponent(city)}/search/?query=${enc}&exact=false`;
  }
  if (src.kind === 'olx') {
    // OLX Egypt now lives at dubizzle.com.eg (olx.com.eg redirects there)
    return `https://www.dubizzle.com.eg/en/ads/q-${encodeURIComponent(q.trim().replace(/\s+/g, '-'))}/`;
  }
  return String(src.searchUrl || '').replace('{q}', enc);
}

// Runs inside the search page. Finds listing cards by their links and pulls title + price from the card text.
// Kept generic on purpose: these sites change their class names often, but listing links and price text stay.
const EXTRACT = String.raw`(async (kind) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 4; i++) { window.scrollBy(0, window.innerHeight * 1.5); await sleep(700); }
  // price on one line: "EGP 3,500", "EGP3,500", "3.500 ج.م" (never across line breaks)
  const priceRe = /(?:EGP|E£|LE|L\.E|ج\.?م|جنيه)[ \t ]*[\d٠-٩][\d٠-٩.,٬  ]*|[\d٠-٩][\d٠-٩.,٬  ]*[ \t ]*(?:EGP|E£|LE|L\.E|ج\.?م|جنيه)/i;
  const sel = {
    facebook: 'a[href*="/marketplace/item/"]',
    olx: 'a[href*="/ad/"]',
  }[kind] || 'a[href*="/product"], a[href*="/products/"], a[href*="/item"], a[href*="/p/"]';
  const seen = new Set(); const out = [];
  for (const a of document.querySelectorAll(sel)) {
    const href = a.href.split('?')[0];
    if (seen.has(href)) continue;
    let card = a; let text = (a.innerText || '').trim();
    for (let up = 0; up < 5 && !priceRe.test(text) && card.parentElement; up++) { card = card.parentElement; text = (card.innerText || '').trim(); }
    const priceEl = card.querySelector('[aria-label="Price"], [data-testid*="price" i], .price');
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const priceText = (priceEl && priceRe.test(priceEl.innerText) && priceEl.innerText.trim()) || lines.find((l) => priceRe.test(l));
    if (!priceText) continue;
    const pm = [priceText.match(priceRe)[0]];
    const titleIdx = lines.findIndex((l) => !priceRe.test(l) && l.length > 3 && !/^\d/.test(l));
    const title = (a.getAttribute('aria-label') || a.title || lines[titleIdx] || '').slice(0, 200);
    if (!title) continue;
    const img = card.querySelector('img');
    seen.add(href);
    out.push({ title, url: href, priceText: pm[0], image: img ? img.currentSrc || img.src : null, location: kind === 'facebook' ? (lines[lines.length - 1] || '') : kind === 'olx' ? (lines[titleIdx + 1] || '') : '' });
    if (out.length >= 40) break;
  }
  const loginWall = kind === 'facebook' ? !!document.querySelector('form[action*="login"], input[name="email"]') : false;
  return { items: out, loginWall, url: location.href };
})`;

module.exports = { BUILTIN_SOURCES, searchWoo, searchShopify, pageUrl, EXTRACT, decodeEntities };
