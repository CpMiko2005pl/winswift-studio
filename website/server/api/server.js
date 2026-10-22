// WinSwift Studio activation server. License keys (WS1-…) are sold and managed by the shop at xdecode.cyberscope.pl;
// this server only adds what the shop's API doesn't have: a key works on ONE PC at a time, the app can deactivate it
// (then it works on any PC again), and every activation is signed (Ed25519) so the app keeps working offline forever.
// Every activation and periodic check asks the shop whether the key is still valid (paid, not switched off by the admin).
// Runs in the container winswift-api (node:22-alpine, host network) on 127.0.0.1:8794; the site's nginx proxies /api/ here.
// Data (key bindings, signing key, admin token) lives in DATA_DIR = ~/winswift-web/license on the server.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +(process.env.PORT || 8794);
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || '/data';
const SHOP_API = process.env.SHOP_API || 'https://xdecode.cyberscope.pl/license_api.php';
const DB_FILE = path.join(DATA, 'licenses.json');
const KEY_FILE = path.join(DATA, 'signing-key.pem');
const TOKEN_FILE = path.join(DATA, 'admin-token');

fs.mkdirSync(DATA, { recursive: true });

// Ed25519 signing key: the app has the public half built in and checks every license offline
if (!fs.existsSync(KEY_FILE)) {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
const PUBLIC_KEY = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');

if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(24).toString('base64url') + '\n', { mode: 0o600 });
const ADMIN_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

// keys: sha256(normalized key) → { device: { id, name, activatedAt, lastSeen, version } | null, activations, history }
// (the key itself is never stored — the same hash the shop uses)
let db = { keys: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {}
db.keys = db.keys || {};
delete db.codes;   // the first version generated its own codes
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

// ------------------------------------------------------------------ helpers

// same rules as the shop's normalize_license_key(): WS1 + 64 hex digits, dashes ignored
function normKey(input) {
  const s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  return /^WS1[0-9A-F]{64}$/.test(s) ? s : null;
}
const keyHash = k => crypto.createHash('sha256').update(k).digest('hex');
const validDevice = d => typeof d === 'string' && /^[0-9a-f]{32,64}$/.test(d);
const cleanText = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const now = () => new Date().toISOString();

function history(rec, ev, extra) {
  rec.history = rec.history || [];
  rec.history.push({ t: now(), ev, ...extra });
  if (rec.history.length > 40) rec.history.splice(0, rec.history.length - 40);
}

function issue(hash, rec) {
  const payload = Buffer.from(JSON.stringify({ v: 2, kh: hash, device: rec.device.id, name: rec.device.name, at: rec.device.activatedAt }));
  return { payload: payload.toString('base64url'), sig: crypto.sign(null, payload, privateKey).toString('base64url') };
}

// the shop decides whether a key is real and still active: 'valid' | 'invalid' | 'deactivated' | 'unavailable'
async function shopStatus(key) {
  try {
    const res = await fetch(SHOP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'WinSwift-Activation/2' },
      body: JSON.stringify({ license_key: key }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    if (j.valid === true && j.type === 'license') return 'valid';
    if (j.valid === false && j.reason === 'deactivated') return 'deactivated';
    if (j.valid === false && j.reason === 'invalid_key') return 'invalid';
    return 'unavailable';
  } catch { return 'unavailable'; }
}

// simple per-IP limits (the real client IP comes from Cloudflare)
const buckets = new Map();
function bump(key, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  return ++b.n;
}
const peek = key => { const b = buckets.get(key); return b && b.reset >= Date.now() ? b.n : 0; };
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60000).unref();

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 16384) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1].trim()).digest();
  const b = crypto.createHash('sha256').update(ADMIN_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ app endpoints

const FAIL_LIMIT = 10;                  // wrong keys per IP per 15 minutes
const FAIL_WINDOW = 15 * 60 * 1000;
const fail = ip => bump('fail|' + ip, FAIL_WINDOW);
const blocked = ip => peek('fail|' + ip) >= FAIL_LIMIT;

async function activate(ip, body) {
  if (!validDevice(body.device)) return [400, { error: 'bad_request' }];
  if (blocked(ip)) return [429, { error: 'rate' }];
  const key = normKey(body.license_key);
  if (!key) { fail(ip); return [404, { error: 'invalid' }]; }
  const shop = await shopStatus(key);
  if (shop === 'unavailable') return [503, { error: 'upstream' }];
  if (shop === 'invalid') { fail(ip); return [404, { error: 'invalid' }]; }
  if (shop === 'deactivated') return [403, { error: 'revoked' }];
  const hash = keyHash(key);
  const rec = db.keys[hash] || (db.keys[hash] = { device: null, activations: 0, history: [], first: now() });
  const name = cleanText(body.name, 64) || 'PC';
  const version = cleanText(body.version, 20);
  if (rec.device && rec.device.id !== body.device) return [409, { error: 'in_use', deviceName: rec.device.name, since: rec.device.activatedAt }];
  if (!rec.device) {
    rec.device = { id: body.device, name, activatedAt: now(), lastSeen: now(), version };
    rec.activations = (rec.activations || 0) + 1;
    history(rec, 'activate', { name });
    console.log(`activate ${hash.slice(0, 8)} on ${name}`);
  } else {
    Object.assign(rec.device, { name, lastSeen: now(), version });
  }
  save();
  return [200, { ok: true, license: issue(hash, rec) }];
}

async function deactivate(ip, body) {
  if (!validDevice(body.device)) return [400, { error: 'bad_request' }];
  if (blocked(ip)) return [429, { error: 'rate' }];
  const key = normKey(body.license_key);
  if (!key) { fail(ip); return [404, { error: 'invalid' }]; }
  const rec = db.keys[keyHash(key)];
  if (!rec || !rec.device) return [200, { ok: true }];
  if (rec.device.id !== body.device) return [409, { error: 'in_use', deviceName: rec.device.name, since: rec.device.activatedAt }];
  history(rec, 'deactivate', { name: rec.device.name });
  console.log(`deactivate ${keyHash(key).slice(0, 8)} on ${rec.device.name}`);
  rec.device = null;
  save();
  return [200, { ok: true }];
}

async function check(ip, body) {
  if (!validDevice(body.device)) return [400, { error: 'bad_request' }];
  if (blocked(ip)) return [429, { error: 'rate' }];
  const key = normKey(body.license_key);
  if (!key) { fail(ip); return [200, { active: false, reason: 'invalid' }]; }
  const rec = db.keys[keyHash(key)];
  if (!rec || !rec.device) return [200, { active: false, reason: 'free' }];
  if (rec.device.id !== body.device) return [200, { active: false, reason: 'moved' }];
  const shop = await shopStatus(key);
  if (shop === 'deactivated' || shop === 'invalid') return [200, { active: false, reason: 'revoked' }];
  rec.device.lastSeen = now();
  const version = cleanText(body.version, 20);
  if (version) rec.device.version = version;
  save();
  return [200, { active: true, shop: shop === 'valid' ? 'ok' : 'unavailable' }];
}

// ------------------------------------------------------------------ admin endpoints (website/license-admin.ps1)

// a key can be given in full (WS1-…) or as its hash / the first 8+ characters of the hash
function findKey(ref) {
  const k = normKey(ref);
  if (k) return keyHash(k);
  const h = String(ref || '').toLowerCase();
  if (!/^[0-9a-f]{8,64}$/.test(h)) return null;
  const hits = Object.keys(db.keys).filter(x => x.startsWith(h));
  return hits.length === 1 ? hits[0] : null;
}

function admin(method, parts) {
  if (parts[0] !== 'keys') return [404, { error: 'not_found' }];
  if (parts.length === 1 && method === 'GET') {
    const keys = Object.entries(db.keys).map(([hash, r]) => ({ hash, ...r })).sort((a, b) => String(b.first).localeCompare(String(a.first)));
    return [200, { keys, active: keys.filter(k => k.device).length }];
  }
  const hash = findKey(parts[1]);
  if (!hash) return [404, { error: 'invalid' }];
  const rec = db.keys[hash];
  if (method === 'POST' && parts[2] === 'reset') {
    if (rec.device) { history(rec, 'reset', { name: rec.device.name }); console.log(`admin: reset ${hash.slice(0, 8)} (${rec.device.name})`); }
    rec.device = null;
    save();
    return [200, { ok: true, hash, ...rec }];
  }
  if (method === 'GET' && parts.length === 2) return [200, { hash, ...rec }];
  return [404, { error: 'not_found' }];
}

// ------------------------------------------------------------------ server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '');
  const ip = clientIp(req);
  try {
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, keys: Object.keys(db.keys).length });
    if (req.method === 'GET' && p === '/api/pubkey') return send(res, 200, { alg: 'ed25519', spki: PUBLIC_KEY });

    if (p.startsWith('/api/admin/')) {
      if (peek('adminfail|' + ip) >= 20) return send(res, 429, { error: 'rate' });
      if (!isAdmin(req)) { bump('adminfail|' + ip, FAIL_WINDOW); return send(res, 401, { error: 'unauthorized' }); }
      if (req.method === 'POST') await readBody(req);
      const [status, obj] = admin(req.method, p.slice('/api/admin/'.length).split('/').map(decodeURIComponent));
      return send(res, status, obj);
    }

    const handlers = { '/api/activate': activate, '/api/deactivate': deactivate, '/api/check': check };
    const h = handlers[p];
    if (!h) return send(res, 404, { error: 'not_found' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (bump('req|' + ip, 10 * 60 * 1000) > 60) return send(res, 429, { error: 'rate' });
    const [status, obj] = await h(ip, await readBody(req));
    return send(res, status, obj);
  } catch (e) {
    return send(res, 400, { error: 'bad_request' });
  }
});

server.listen(PORT, HOST, () => console.log(`winswift-api listening on ${HOST}:${PORT}, ${Object.keys(db.keys).length} key(s), shop ${SHOP_API}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); });
