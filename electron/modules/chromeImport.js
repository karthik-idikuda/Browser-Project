const fs = require('fs');
const path = require('path');
let initSqlJs;
async function getSql() {
  if (!initSqlJs) initSqlJs = require('sql.js');
  return await initSqlJs();
}

function importBookmarksFromProfile(profileDir) {
  const file = path.join(profileDir, 'Bookmarks');
  if (!fs.existsSync(file)) throw new Error('Bookmarks file not found');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const results = [];
  function walk(node) {
    if (!node) return;
    if (node.type === 'url') results.push({ title: node.name, url: node.url });
    if (node.children) node.children.forEach(walk);
  }
  const roots = data.roots || {};
  Object.values(roots).forEach(walk);
  return { imported: results.length, items: results.slice(0, 100) };
}

async function importHistoryFromProfile(profileDir, limit = 200) {
  const dbPath = path.join(profileDir, 'History');
  if (!fs.existsSync(dbPath)) throw new Error('History DB not found');
  const SQL = await getSql();
  const data = fs.readFileSync(dbPath);
  const db = new SQL.Database(new Uint8Array(data));
  const stmt = db.prepare('SELECT url, title, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT $limit');
  const items = [];
  stmt.bind({ $limit: limit });
  while (stmt.step()) {
    const row = stmt.getAsObject();
    items.push(row);
  }
  stmt.free();
  db.close();
  return { imported: items.length, items };
}

module.exports = { importBookmarksFromProfile, importHistoryFromProfile };