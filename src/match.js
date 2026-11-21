// Pure helpers: price parsing and offer matching. No Electron here, so they can be unit-tested.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function normDigits(s) {
  return String(s ?? '').replace(/[٠-٩۰-۹]/g, (d) => {
    const i = AR_DIGITS.indexOf(d);
    return String(i >= 0 ? i : FA_DIGITS.indexOf(d));
  }).replace(/٬/g, ',').replace(/٫/g, '.');
}

// "EGP 12,500", "12.500 ج.م", "LE 1,250.00", "1 250 جنيه" -> 12500 / 12500 / 1250 / 1250
function parsePrice(text) {
  if (text == null) return null;
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 ? text : null;
  const s = normDigits(text).replace(/ /g, ' ');
  const m = s.match(/\d[\d\s.,]*\d|\d/);
  if (!m) return null;
  let num = m[0].replace(/\s+/g, '');
  const decSep = Math.max(num.lastIndexOf('.'), num.lastIndexOf(','));
  if (decSep >= 0) {
    const sep = num[decSep];
    const tail = num.slice(decSep + 1);
    const sepCount = num.split(sep).length - 1;
    // The last separator is a decimal point only if 1–2 digits follow it and it appears once
    // ("1,250" and "12.500" are thousands; "1250.50" and "1.250,75" have decimals).
    const isDecimal = tail.length >= 1 && tail.length <= 2 && sepCount === 1;
    num = isDecimal ? num.slice(0, decSep).replace(/[.,]/g, '') + '.' + tail : num.replace(/[.,]/g, '');
  }
  const v = Number(num);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

const squash = (s) => normDigits(s).toLowerCase().replace(/[\s\-_/.]+/g, '');
const splitList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

// Does this listing title belong to the watched item?
//  - must:    comma list, every term has to appear (spaces/dashes ignored)
//  - exclude: comma list, any term drops the listing
function matches(item, title) {
  const t = squash(title);
  if (!t) return false;
  for (const m of splitList(item.must)) if (!t.includes(squash(m))) return false;
  const words = normDigits(title).toLowerCase();
  for (const x of splitList(item.exclude)) {
    const re = new RegExp(`(^|[^a-z0-9؀-ۿ])${x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (re.test(words)) return false;
  }
  return true;
}

function bestOffer(offers) {
  const live = offers.filter((o) => !o.gone && o.inStock !== false && o.price > 0);
  if (!live.length) return null;
  return live.reduce((a, b) => (b.price < a.price ? b : a));
}

module.exports = { parsePrice, matches, bestOffer, splitList, normDigits };
