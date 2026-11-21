// Tiny JSON store in the app's user-data folder (per user, per computer).
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir, defaults) {
    this.file = path.join(dir, 'price-hunter.json');
    this.data = structuredClone(defaults);
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      this.data = { ...this.data, ...saved, settings: { ...this.data.settings, ...(saved.settings || {}) } };
    } catch { /* first run */ }
    this._t = null;
  }
  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 200);
  }
  flush() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
