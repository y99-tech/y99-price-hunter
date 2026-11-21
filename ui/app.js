// Y99 Price Hunter — renderer. All actions use data-act attributes + one delegated click handler (no inline JS).
const api = window.hunter;
let S = null;
let tab = 'watch';
const open = new Set(); // expanded item cards

const $ = (q, el = document) => el.querySelector(q);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n == null ? '—' : `EGP ${Math.round(n).toLocaleString('en-US')}`);
const ago = (iso) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const best = (it) => {
  const live = (it.offers || []).filter((o) => !o.gone && o.inStock !== false && o.price > 0);
  return live.length ? live.reduce((a, b) => (b.price < a.price ? b : a)) : null;
};
const KIND_LABEL = { woo: 'WooCommerce', shopify: 'Shopify', web: 'Web page', facebook: 'Facebook Marketplace', olx: 'OLX' };

function render() {
  if (!S) return;
  document.body.classList.toggle('mac', S.platform === 'darwin');
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const unread = S.alerts.filter((a) => !a.read).length;
  $('#alertCount').textContent = unread || '';
  $('#huntBtn').textContent = S.running ? 'Stop' : 'Hunt now';
  $('#status').textContent = S.running && S.progress
    ? `Hunting ${S.progress.item} · ${S.progress.source} (${S.progress.done}/${S.progress.total})`
    : `Last hunt ${ago(S.lastRunAt)}${S.settings.autoHunt ? ` · every ${S.settings.intervalHours} h` : ''}`;
  $('#view').innerHTML = { watch, alerts, sources, accounts, settings }[tab]();
}

// ---------- Watchlist ----------
function watch() {
  const items = S.items;
  const withBest = items.map((i) => ({ i, b: best(i) }));
  const savings = withBest.reduce((s, { i, b }) => s + (b && i.value ? Math.max(0, i.value - b.price) : 0), 0);
  const offers = items.reduce((s, i) => s + (i.offers || []).filter((o) => !o.gone).length, 0);
  const hits = withBest.filter(({ i, b }) => b && i.targetPrice && b.price <= i.targetPrice).length;
  return `
    <div class="head"><div><h2>Watchlist</h2><div class="muted">What you want, where it's cheapest right now.</div></div><span class="sp"></span>
      <button data-act="import">Import</button><button data-act="export">Export</button>
      <button class="primary" data-act="add-item">+ Add item</button></div>
    <div class="kpis">
      <div class="kpi"><span class="muted">Items watched</span><b>${items.length}</b></div>
      <div class="kpi"><span class="muted">Live offers</span><b>${offers}</b></div>
      <div class="kpi g"><span class="muted">Possible savings</span><b>${money(savings)}</b></div>
      <div class="kpi"><span class="muted">At target price</span><b>${hits}</b></div>
    </div>
    ${items.length ? `<div class="grid">${withBest.map(({ i, b }) => card(i, b)).join('')}</div>` : `<div class="empty">Add the first thing you want to buy. Example: "Sony NP-FZ100 battery" with searches "NP-FZ100" and "FZ100".</div>`}`;
}

function card(i, b) {
  const live = (i.offers || []).filter((o) => !o.gone).sort((x, y) => x.price - y.price);
  const saving = b && i.value ? i.value - b.price : null;
  const target = i.targetPrice ? (b && b.price <= i.targetPrice ? `<span class="chip g">🎯 At target ${money(i.targetPrice)}</span>` : `<span class="chip">🎯 Target ${money(i.targetPrice)}</span>`) : '';
  const isOpen = open.has(i.id);
  return `<div class="card ${i.enabled ? '' : 'off'}">
    <div class="t"><span class="ic">${esc(i.icon || '📦')}</span><span class="nm">${esc(i.name)}</span>${i.enabled ? '' : '<span class="chip">Paused</span>'}</div>
    <div class="price">${b ? money(b.price) : '<span class="muted">No offers yet</span>'}${b ? `<small>at ${esc(b.sourceName)}</small>` : ''}</div>
    <div class="chips">
      ${saving > 0 ? `<span class="chip g">Save ${money(saving)} vs ${money(i.value)}</span>` : i.value ? `<span class="chip">Reference ${money(i.value)}</span>` : ''}
      ${target}
      <span class="chip">${live.length} offers</span>
      <span class="chip">Checked ${ago(i.lastRun)}</span>
      ${i.lastError ? `<span class="chip b" title="${esc(i.lastError)}">⚠ ${esc(i.lastError.split(' · ').length)} source errors</span>` : ''}
    </div>
    <div class="actions">
      <button data-act="hunt-item" data-id="${i.id}" ${S.running ? 'disabled' : ''}>Hunt</button>
      <button data-act="toggle-offers" data-id="${i.id}">${isOpen ? 'Hide offers' : 'Show offers'}</button>
      <button data-act="edit-item" data-id="${i.id}">Edit</button>
      <button class="danger" data-act="del-item" data-id="${i.id}">Delete</button>
    </div>
    ${isOpen ? `<div class="offers">${live.length ? live.map((o) => offerRow(o, b)).join('') : '<span class="muted">Nothing found yet. Hunt to search all sources.</span>'}</div>` : ''}
    ${isOpen && i.lastError ? `<div class="err">${esc(i.lastError)}</div>` : ''}
  </div>`;
}

function offerRow(o, b) {
  const was = o.regularPrice && o.regularPrice > o.price ? `<s>${money(o.regularPrice)}</s>` : o.prevPrice && o.prevPrice !== o.price ? `<s>${money(o.prevPrice)}</s>` : '';
  return `<div class="offer ${b && o.url === b.url ? 'best' : ''}" data-act="open" data-url="${esc(o.url)}" title="${esc(o.title)}">
    ${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" />` : '<img alt="" />'}
    <div><div class="ot">${esc(o.title)}</div><div class="os">${esc(o.sourceName)}${o.location ? ` · ${esc(o.location)}` : ''}${o.lowPrice && o.lowPrice < o.price ? ` · low ${money(o.lowPrice)}` : ''}</div></div>
    <div class="op">${money(o.price)}${was}</div></div>`;
}

// ---------- Alerts ----------
function alerts() {
  const list = S.alerts;
  return `<div class="head"><div><h2>Alerts</h2><div class="muted">New lows and prices at or under your target.</div></div><span class="sp"></span>${list.some((a) => !a.read) ? '<button data-act="alerts-read">Mark all read</button>' : ''}</div>
    ${list.length ? `<table class="table"><tr><th>When</th><th>Item</th><th>Price</th><th>Where</th><th>Why</th></tr>
      ${list.map((a) => `<tr style="${a.read ? '' : 'font-weight:600'}"><td>${ago(a.at)}</td><td>${esc(a.item)}</td><td>${money(a.price)}</td><td><button class="link" data-act="open" data-url="${esc(a.url)}">${esc(a.source)}</button></td><td class="muted">${esc(a.why)}</td></tr>`).join('')}</table>`
      : '<div class="empty">No alerts yet. Set a target price on an item to get one when it drops.</div>'}
    ${S.runs.length ? `<h2 style="margin-top:28px">Recent hunts</h2><table class="table"><tr><th>Started</th><th>Trigger</th><th>Items</th><th>Offers</th><th>Alerts</th><th>Errors</th></tr>
      ${S.runs.slice(0, 12).map((r) => `<tr><td>${ago(r.startedAt)}</td><td>${esc(r.trigger)}</td><td>${r.items}</td><td>${r.offers}</td><td>${r.alerts}</td><td class="muted" title="${esc((r.errors || []).join('\n'))}">${(r.errors || []).length}</td></tr>`).join('')}</table>` : ''}`;
}

// ---------- Sources ----------
function sources() {
  return `<div class="head"><div><h2>Sources</h2><div class="muted">Stores and marketplaces searched on every hunt.</div></div><span class="sp"></span><button class="primary" data-act="add-source">+ Add store</button></div>
    <table class="table"><tr><th></th><th>Name</th><th>Site</th><th>Type</th><th>On</th><th></th></tr>
    ${S.sources.map((s) => `<tr><td>${esc(s.icon)}</td><td>${esc(s.name)}</td><td class="muted">${esc(s.host)}</td><td>${esc(KIND_LABEL[s.kind] || s.kind)}${s.needsLogin ? ' <span class="chip w">uses your login</span>' : ''}</td>
      <td><input type="checkbox" data-act="toggle-source" data-key="${esc(s.key)}" ${s.enabled ? 'checked' : ''} /></td>
      <td style="text-align:right"><button data-act="edit-source" data-key="${esc(s.key)}">Edit</button> <button class="danger" data-act="del-source" data-key="${esc(s.key)}">Remove</button></td></tr>`).join('')}</table>
    <p class="muted">Tip: WooCommerce and Shopify stores work with just the site address. For any other store use "Web page" with its search URL, putting <code>{q}</code> where the search words go.</p>`;
}

// ---------- Accounts ----------
function accounts() {
  const a = S.accounts || {};
  const box = (kind, name, s) => `<div class="card"><div class="t"><span class="ic">${kind === 'facebook' ? '📘' : '🟣'}</span><span class="nm">${name}</span>
      ${s?.signedIn ? '<span class="chip g">Signed in</span>' : s?.cookies ? '<span class="chip w">Visited, not signed in</span>' : '<span class="chip">Not connected</span>'}</div>
      <div class="muted">${kind === 'facebook' ? 'Marketplace only shows full results to signed-in people. Sign in once with your own account.' : 'OLX search works without signing in; signing in shows the same results you see in your browser.'}</div>
      <div class="actions"><button class="primary" data-act="login" data-kind="${kind}">${s?.signedIn ? 'Open / switch account' : 'Sign in'}</button>${s?.cookies ? `<button class="danger" data-act="logout" data-kind="${kind}">Sign out & clear cookies</button>` : ''}</div></div>`;
  return `<div class="head"><div><h2>Accounts</h2><div class="muted">Your own logins, used only on this computer.</div></div></div>
    <div class="note">You sign in on the real Facebook / OLX page inside this app. The app never sees your password; it just keeps the site's cookies in its own private browser profile on your computer, the same way Chrome does, and uses them to open search pages for you. Nothing is uploaded anywhere. Use "Sign out & clear cookies" to remove them at any time.</div>
    <div class="acc">${box('facebook', 'Facebook Marketplace', a.facebook)}${box('olx', 'OLX Egypt', a.olx)}</div>
    <p class="muted">Marketplace searches run slowly on purpose (a few seconds between searches). Automated browsing may still be against Facebook's or OLX's terms; keep the hunt interval reasonable.</p>`;
}

// ---------- Settings ----------
function settings() {
  const s = S.settings;
  return `<div class="head"><div><h2>Settings</h2></div></div>
    <form id="setForm" class="card" style="max-width:560px">
      <label class="row"><input type="checkbox" name="autoHunt" ${s.autoHunt ? 'checked' : ''}/> Hunt automatically</label>
      <label>Every (hours)<input type="number" name="intervalHours" min="1" max="48" value="${esc(s.intervalHours)}"/></label>
      <label>Facebook Marketplace city (as in the Marketplace link, e.g. cairo, alexandria, giza)<input name="fbCity" value="${esc(s.fbCity)}"/></label>
      <label class="row"><input type="checkbox" name="keepInTray" ${s.keepInTray ? 'checked' : ''}/> Keep running in the ${S.platform === 'darwin' ? 'menu bar' : 'system tray'} when the window is closed</label>
      <div class="dlg-actions"><button class="primary" data-act="save-settings">Save</button></div>
    </form>
    <p class="muted">Y99 Price Hunter ${esc(S.version)} · data is stored only on this computer.</p>`;
}

// ---------- dialogs ----------
function dialog(html, onSubmit) {
  const d = $('#dlg');
  const f = $('#dlgForm');
  f.innerHTML = html + '<div class="err" id="dlgErr"></div><div class="dlg-actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">Save</button></div>';
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(f))); d.close(); }
    catch (err) { $('#dlgErr').textContent = String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  };
  d.showModal();
}

function itemDialog(it = {}) {
  dialog(`<h2>${it.id ? 'Edit item' : 'Add item'}</h2>
    <div class="two"><label>Name<input name="name" required value="${esc(it.name)}" placeholder="Sony NP-FZ100 battery"/></label><label>Icon<input name="icon" value="${esc(it.icon || '📦')}"/></label></div>
    <label>Search for (one per line)<textarea name="queries" required placeholder="NP-FZ100&#10;FZ100">${esc(it.queries)}</textarea></label>
    <label>Title must contain (comma separated, all required)<input name="must" value="${esc(it.must)}" placeholder="fz100"/></label>
    <label>Skip titles with (comma separated)<input name="exclude" value="${esc(it.exclude)}" placeholder="dummy, charger, adapter"/></label>
    <div class="two"><label>Reference price (EGP)<input type="number" name="value" value="${esc(it.value ?? '')}"/></label><label>Alert me at or under (EGP)<input type="number" name="targetPrice" value="${esc(it.targetPrice ?? '')}"/></label></div>
    <label>Ignore prices under (EGP) — skips fake "EGP 1" marketplace listings<input type="number" name="minPrice" value="${esc(it.minPrice ?? '')}"/></label>
    <label class="row"><input type="checkbox" name="enabled" ${it.enabled === false ? '' : 'checked'}/> Include in hunts</label>`,
  (v) => api.saveItem({ ...v, id: it.id, enabled: v.enabled === 'on' }));
}

function sourceDialog(s = {}) {
  dialog(`<h2>${s.key ? 'Edit source' : 'Add store'}</h2>
    <div class="two"><label>Name<input name="name" required value="${esc(s.name)}"/></label><label>Icon<input name="icon" value="${esc(s.icon || '🛒')}"/></label></div>
    <label>Site address<input name="host" required value="${esc(s.host)}" placeholder="example-store.com"/></label>
    <label>Type<select name="kind">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Search URL (only for "Web page"; put {q} where the search goes)<input name="searchUrl" value="${esc(s.searchUrl)}" placeholder="https://example-store.com/search?q={q}"/></label>
    <label class="row"><input type="checkbox" name="enabled" ${s.enabled === false ? '' : 'checked'}/> Search this source</label>`,
  (v) => api.saveSource({ ...v, key: s.key, enabled: v.enabled === 'on' }));
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; return render(); }
  const { act, id, key, kind, url } = t.dataset;
  const item = id && S.items.find((i) => i.id === id);
  const src = key && S.sources.find((s) => s.key === key);
  switch (act) {
    case 'add-item': return itemDialog();
    case 'edit-item': return itemDialog(item);
    case 'del-item': if (confirmInline(t, 'Delete?')) await api.deleteItem(id); return;
    case 'hunt-item': return api.hunt(id);
    case 'toggle-offers': open.has(id) ? open.delete(id) : open.add(id); return render();
    case 'open': return api.open(url);
    case 'alerts-read': return api.alertsRead();
    case 'add-source': return sourceDialog();
    case 'edit-source': return sourceDialog(src);
    case 'del-source': if (confirmInline(t, 'Remove?')) await api.deleteSource(key); return;
    case 'toggle-source': return api.saveSource({ ...src, enabled: t.checked });
    case 'login': return api.login(kind);
    case 'logout': if (confirmInline(t, 'Clear cookies?')) await api.logout(kind); return;
    case 'save-settings': {
      e.preventDefault();
      const f = Object.fromEntries(new FormData($('#setForm')));
      await api.saveSettings({ ...f, autoHunt: f.autoHunt === 'on', keepInTray: f.keepInTray === 'on' });
      t.textContent = 'Saved ✓'; return;
    }
    case 'export': {
      const json = await api.exportData();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'y99-price-hunter-watchlist.json'; a.click();
      return;
    }
    case 'import': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => { try { await api.importData(await inp.files[0].text()); } catch (err) { alertBox(String(err)); } };
      inp.click();
      return;
    }
  }
});

// two-click confirm on the button itself (no blocking confirm() dialogs)
function confirmInline(btn, label) {
  if (btn.dataset.armed) return true;
  const old = btn.textContent;
  btn.dataset.armed = '1'; btn.textContent = label;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3000);
  return false;
}
function alertBox(msg) { $('#status').textContent = msg; }

$('#huntBtn').addEventListener('click', () => (S.running ? api.stop() : api.hunt()));
api.onState((s) => { S = s; render(); });
api.getState().then((s) => { S = s; render(); });
setInterval(render, 60000); // keep "x min ago" fresh
