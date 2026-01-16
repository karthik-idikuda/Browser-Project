const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getKey() {
  const k = process.env.XERIRONX_STORE_KEY;
  if (!k || k.length < 32) {
    console.warn('[secureStore] Missing XERIRONX_STORE_KEY; using ephemeral key. Set a 32+ char key in production.');
    return crypto.createHash('sha256').update('xerironx-dev-key').digest();
  }
  return crypto.createHash('sha256').update(k).digest();
}

function encryptJson(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(obj));
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJson(b64) {
  const key = getKey();
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

class SecureStore {
  constructor(baseDir, fileName = 'audit.enc') {
    this.filePath = path.join(baseDir, fileName);
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) this._write([]);
  }
  _readRaw() { return fs.readFileSync(this.filePath, 'utf8'); }
  _writeRaw(s) { fs.writeFileSync(this.filePath, s, 'utf8'); }
  _read() {
    const raw = this._readRaw();
    try { return decryptJson(raw); } catch { return []; }
  }
  _write(obj) {
    const enc = encryptJson(obj);
    this._writeRaw(enc);
  }
  append(entry) {
    const now = new Date().toISOString();
    const data = this._read();
    data.push({ ts: now, ...entry });
    this._write(data);
    return { ok: true };
  }
  readAll() { return this._read(); }
  wipe() { this._write([]); return { ok: true }; }
}

module.exports = { SecureStore };
