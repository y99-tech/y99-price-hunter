// Y99 Price Hunter — Electron main process (Windows + macOS).
const { app, BrowserWindow, ipcMain, session, shell, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { Store } = require('./src/store');
const { Hunter } = require('./src/hunter');
const { BUILTIN_SOURCES } = require('./src/sources');

const PARTITION = 'persist:y99-hunter'; // the app's own private browser profile: your Marketplace/OLX cookies live here only
const isMac = process.platform === 'darwin';

let win = null;
let tray = null;
let quitting = false;
let store;
let hunter;

const DEFAULTS = {
  settings: { intervalHours: 3, autoHunt: true, fbCity: 'cairo', keepInTray: true, currency: 'EGP' },
  sources: BUILTIN_SOURCES,
  items: [
    sampleItem('Sony NP-FZ100 battery', '🔋', 'NP-FZ100\nFZ100', 'fz100', 'dummy, adapter, coupler, charger, charging, station, kit, plate, grip, cable, decoder', 2363),
    sampleItem('SD card 128 GB V30/V90', '💾', '128GB SD\n256GB SDXC', 'sd', 'micro, microsd, reader, case', 2999),
  ],
  alerts: [],
  runs: [],
  lastRunAt: null,
};

function sampleItem(name, icon, queries, must, exclude, value) {
  return { id: `i${Math.random().toString(36).slice(2, 9)}`, name, icon, queries, must, exclude, value, targetPrice: null, enabled: true, offers: [], lastRun: null, lastError: null };
}

function hunterSession() {
  return session.fromPartition(PARTITION);
}

function safeOpen(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(u.href);
  } catch { /* ignore */ }
}

// Load a search page invisibly with the user's own session and read the listings.
function openPage(url, kind, extractSrc) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({
      show: false, width: 1280, height: 900,
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
    });
    const timer = setTimeout(() => { finish(); reject(new Error('Timed out loading search page')); }, 60000);
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); if (!w.isDestroyed()) w.destroy(); };
    w.webContents.setAudioMuted(true);
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.once('did-fail-load', (_e, code, desc) => { if (code !== -3) { finish(); reject(new Error(desc || `Load failed (${code})`)); } });
    w.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 2500));
        const res = await w.webContents.executeJavaScript(`${extractSrc}(${JSON.stringify(kind)})`, true);
        finish();
        resolve(res);
      } catch (e) { finish(); reject(e); }
    });
    w.loadURL(url).catch(() => {});
  });
}

// Sign-in window for Facebook / OLX. The user types their own password into the real site; the app never sees it.
const LOGIN_URLS = { facebook: 'https://www.facebook.com/login', olx: 'https://www.dubizzle.com.eg/en/' };
function openLogin(kind) {
  const url = LOGIN_URLS[kind];
  if (!url) return;
  const w = new BrowserWindow({
    width: 1100, height: 820, parent: win, title: `Sign in — ${kind === 'facebook' ? 'Facebook' : 'OLX'}`,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  w.webContents.setWindowOpenHandler(({ url: u }) => { w.loadURL(u); return { action: 'deny' }; });
  w.loadURL(url);
  w.on('closed', () => emit());
}

async function accountStatus() {
  const ses = hunterSession();
  const fb = await ses.cookies.get({ domain: 'facebook.com' });
  const olx = [...await ses.cookies.get({ domain: 'dubizzle.com.eg' }), ...await ses.cookies.get({ domain: 'olx.com.eg' })];
  return {
    facebook: { signedIn: fb.some((c) => c.name === 'c_user'), cookies: fb.length },
    olx: { signedIn: olx.some((c) => /token|session|auth|user/i.test(c.name)), cookies: olx.length },
  };
}

async function signOut(kind) {
  const ses = hunterSession();
  const domains = kind === 'facebook' ? ['facebook.com'] : ['dubizzle.com.eg', 'olx.com.eg'];
  const list = [];
  for (const domain of domains) list.push(...await ses.cookies.get({ domain }));
  for (const c of list) {
    const url = `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`;
    await ses.cookies.remove(url, c.name);
  }
  emit();
}

function state() {
  const d = store.data;
  return { ...d, running: hunter.running, progress: hunter.progress, platform: process.platform, version: app.getVersion() };
}

let emitTimer = null;
function emit() {
  clearTimeout(emitTimer);
  emitTimer = setTimeout(async () => {
    if (win && !win.isDestroyed()) win.webContents.send('state', { ...state(), accounts: await accountStatus() });
    updateTray();
  }, 120);
}

function notify(title, body, url) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => (url ? safeOpen(url) : showWindow()));
  n.show();
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  else { win.show(); win.focus(); }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 980, minHeight: 640,
    title: 'Y99 Price Hunter', backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  if (process.env.Y99_SMOKE_SHOT) {
    // CI/dev smoke test: screenshot the UI and quit
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      require('fs').writeFileSync(process.env.Y99_SMOKE_SHOT, (await win.capturePage()).toPNG());
      quitting = true; app.quit();
    }, 2500));
  }
  win.webContents.setWindowOpenHandler(({ url }) => { safeOpen(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); safeOpen(url); } });
  win.on('close', (e) => {
    if (!quitting && store.data.settings.keepInTray) { e.preventDefault(); win.hide(); }
  });
}

function updateTray() {
  if (!tray) return;
  const unread = store.data.alerts.filter((a) => !a.read).length;
  tray.setToolTip(`Y99 Price Hunter${hunter.running ? ' — hunting…' : ''}${unread ? ` — ${unread} new alerts` : ''}`);
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: isMac ? 18 : 16 });
  tray = new Tray(img);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Y99 Price Hunter', click: showWindow },
    { label: 'Hunt now', click: () => hunter.run('manual') },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
  updateTray();
}

// Scheduler: checks once a minute whether a hunt is due.
function startScheduler() {
  setInterval(() => {
    const s = store.data.settings;
    if (!s.autoHunt || hunter.running) return;
    const last = store.data.lastRunAt ? Date.parse(store.data.lastRunAt) : 0;
    if (Date.now() - last >= Math.max(1, Number(s.intervalHours) || 3) * 3600e3) hunter.run('timer');
  }, 60e3);
}

// ---------- IPC (renderer -> main) ----------
function registerIpc() {
  const d = () => store.data;
  ipcMain.handle('get-state', async () => ({ ...state(), accounts: await accountStatus() }));
  ipcMain.handle('hunt', (_e, itemId) => { hunter.run('manual', itemId || null); return true; });
  ipcMain.handle('stop', () => { hunter.cancel = true; return true; });
  ipcMain.handle('save-item', (_e, item) => {
    const clean = {
      name: String(item.name || '').slice(0, 120), icon: String(item.icon || '📦').slice(0, 4),
      queries: String(item.queries || '').slice(0, 500), must: String(item.must || '').slice(0, 200),
      exclude: String(item.exclude || '').slice(0, 500),
      value: Number(item.value) || null, minPrice: Number(item.minPrice) || null, targetPrice: Number(item.targetPrice) || null, enabled: item.enabled !== false,
    };
    if (!clean.name || !clean.queries.trim()) throw new Error('Name and at least one search query are required');
    const existing = d().items.find((i) => i.id === item.id);
    if (existing) Object.assign(existing, clean);
    else d().items.unshift({ id: `i${Date.now().toString(36)}`, offers: [], lastRun: null, lastError: null, ...clean });
    store.save(); emit(); return true;
  });
  ipcMain.handle('delete-item', (_e, id) => { d().items = d().items.filter((i) => i.id !== id); store.save(); emit(); return true; });
  ipcMain.handle('save-source', (_e, src) => {
    const kinds = ['woo', 'shopify', 'web', 'facebook', 'olx'];
    const clean = {
      name: String(src.name || '').slice(0, 80), host: String(src.host || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 120),
      kind: kinds.includes(src.kind) ? src.kind : 'web', searchUrl: String(src.searchUrl || '').slice(0, 400),
      icon: String(src.icon || '🛒').slice(0, 4), enabled: src.enabled !== false,
    };
    const existing = d().sources.find((s) => s.key === src.key);
    if (existing) Object.assign(existing, clean);
    else d().sources.push({ key: `s${Date.now().toString(36)}`, ...clean, needsLogin: ['facebook', 'olx'].includes(clean.kind) });
    store.save(); emit(); return true;
  });
  ipcMain.handle('delete-source', (_e, key) => { d().sources = d().sources.filter((s) => s.key !== key); store.save(); emit(); return true; });
  ipcMain.handle('save-settings', (_e, s) => {
    const cur = d().settings;
    d().settings = {
      ...cur,
      intervalHours: Math.min(48, Math.max(1, Number(s.intervalHours) || cur.intervalHours)),
      autoHunt: !!s.autoHunt, keepInTray: !!s.keepInTray,
      fbCity: String(s.fbCity || cur.fbCity).trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'cairo',
    };
    store.save(); emit(); return true;
  });
  ipcMain.handle('alerts-read', () => { d().alerts.forEach((a) => { a.read = true; }); store.save(); emit(); return true; });
  ipcMain.handle('login', (_e, kind) => { openLogin(kind); return true; });
  ipcMain.handle('logout', (_e, kind) => signOut(kind));
  ipcMain.handle('open', (_e, url) => { safeOpen(url); return true; });
  ipcMain.handle('export', () => JSON.stringify({ items: d().items.map(({ offers, ...i }) => i), sources: d().sources }, null, 2));
  ipcMain.handle('import', (_e, json) => {
    const x = JSON.parse(json);
    if (Array.isArray(x.items)) for (const i of x.items) if (!d().items.some((e) => e.name === i.name)) d().items.push({ ...i, id: `i${Math.random().toString(36).slice(2, 9)}`, offers: [] });
    if (Array.isArray(x.sources)) for (const s of x.sources) if (!d().sources.some((e) => e.host === s.host)) d().sources.push(s);
    store.save(); emit(); return true;
  });
}

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('tech.y99.pricehunter');
    store = new Store(app.getPath('userData'), DEFAULTS);
    // add any newly shipped built-in sources without touching the user's own edits
    for (const s of BUILTIN_SOURCES) if (!store.data.sources.some((x) => x.key === s.key)) store.data.sources.push(s);
    const ses = hunterSession();
    hunter = new Hunter({
      store,
      fetcher: (url, opts) => ses.fetch(url, opts),
      openPage,
      notify,
      log: (m) => console.log(m),
      emit,
    });
    registerIpc();
    createWindow();
    createTray();
    startScheduler();
    app.on('activate', showWindow);
  });
  app.on('before-quit', () => { quitting = true; if (store) store.flush(); });
  app.on('window-all-closed', () => { if (!store?.data.settings.keepInTray) app.quit(); });
}
