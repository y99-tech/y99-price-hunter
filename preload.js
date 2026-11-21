const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('hunter', {
  getState: call('get-state'),
  hunt: call('hunt'),
  stop: call('stop'),
  saveItem: call('save-item'),
  deleteItem: call('delete-item'),
  saveSource: call('save-source'),
  deleteSource: call('delete-source'),
  saveSettings: call('save-settings'),
  alertsRead: call('alerts-read'),
  login: call('login'),
  logout: call('logout'),
  open: call('open'),
  exportData: call('export'),
  importData: call('import'),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
});
