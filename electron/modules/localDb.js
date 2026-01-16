const path = require('path');
const { app } = require('electron');
const { SecureStore } = require('./secureStore');

function getStore(name) {
  const base = app ? app.getPath('userData') : process.cwd();
  return new SecureStore(path.join(base, 'storage'), `${name}.enc`);
}

function saveItems(name, items) {
  const store = getStore(name);
  const data = store.readAll();
  const next = Array.isArray(data) ? data.concat(items) : items;
  store.wipe();
  store.append({ type: 'bulk', items: next });
  return { ok: true, count: items.length };
}

function readItems(name) {
  const store = getStore(name);
  const data = store.readAll();
  if (Array.isArray(data)) return data;
  return data.items || [];
}

function exportItems(name) {
  const items = readItems(name);
  return { items };
}

module.exports = { saveItems, readItems, exportItems };
