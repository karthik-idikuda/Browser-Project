const fs = require('fs');

function parseNetscapeBookmarks(html) {
  const linkRegex = /<A[^>]*HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
  const results = [];
  let match;
  while ((match = linkRegex.exec(html))) {
    results.push({ url: match[1], title: match[2] });
  }
  return results;
}

async function importBookmarksHtml(html) {
  const items = parseNetscapeBookmarks(html);
  // TODO: persist encrypted to local storage; return count for now
  return { imported: items.length, items: items.slice(0, 50) };
}

function readFile(path) {
  return fs.readFileSync(path, 'utf8');
}

module.exports = { importBookmarksHtml, readFile };
