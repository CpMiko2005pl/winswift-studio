// Activation. Licenses are sold by the shop at xdecode.cyberscope.pl:
//  - a license key (WS1-…) from the shop profile is activated through winswift.tacticalops.fun/api, which checks it with the
//    shop, ties it to ONE PC and signs the activation (Ed25519) — the app checks that signature offline, so an activated copy
//    works forever; Settings ▸ License ▸ Deactivate frees the key for any PC again;
//  - the free 15-minute trial is a token the user starts in the shop profile; the shop's license_api.php validates it.
// No shop secret is in the app: the shop and the activation server do all the checking.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DEV = !app.isPackaged;
// running from source (npm start) needs no license; SWIFTCODE_LICENSE_TEST=1 turns it on for testing
const ENABLED = !DEV || !!process.env.SWIFTCODE_LICENSE_TEST;
const SHOP = 'https://xdecode.cyberscope.pl';
const SHOP_API = (DEV && process.env.SWIFTCODE_SHOP_API) || `${SHOP}/license_api.php`;
const API = (DEV && process.env.SWIFTCODE_LICENSE_API) || 'https://winswift.tacticalops.fun/api';
const PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.from((DEV && process.env.SWIFTCODE_LICENSE_PUBKEY) || 'MCowBQYDK2VwAyEA8NcPiLs0a9zdgtQ3O93pPzbvBnIVMjWxpFSb0XnFcMc=', 'base64'),
  format: 'der', type: 'spki',
});
const TRIAL_MINUTES = 15;
const TICK = 5000;
const TRIAL_RECHECK = 60 * 1000;          // the shop is asked again every minute while the trial runs
const LICENSE_RECHECK = 6 * 3600 * 1000;  // and every few hours for an activated copy (offline it just keeps working)

let dir = null, deviceId = null;
let license = null;   // { p: signed payload, key }
let trial = null;     // { token, expiresAt }
let notify = () => {};
let lastStatus = null, lastTrialCheck = 0, lastLicenseCheck = 0, droppedReason = null;

const licenseFile = () => path.join(dir, 'license.json');
const trialFile = () => path.join(dir, 'trial.json');

function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// the key is kept encrypted for this Windows account (DPAPI)
function protect(s) {
  try { if (safeStorage.isEncryptionAvailable()) return { k: safeStorage.encryptString(s).toString('base64'), enc: true }; } catch {}
  return { k: s, enc: false };
}
function unprotect(rec) {
  try { return rec.enc ? safeStorage.decryptString(Buffer.from(rec.k, 'base64')) : rec.k; } catch { return null; }
}

// ------------------------------------------------------------------ device

function machineGuid() {
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    return (/MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out) || [])[1] || '';
  } catch { return ''; }
}

function loadDeviceId() {
  const guid = machineGuid();
  if (guid) return crypto.createHash('sha256').update('winswift-device|' + guid.toLowerCase()).digest('hex').slice(0, 32);
  const f = path.join(dir, 'device.json');   // no MachineGuid (very unusual): a random id kept next to the license
  const saved = readJson(f);
  if (saved && /^[0-9a-f]{32}$/.test(saved.id)) return saved.id;
  const id = crypto.randomBytes(16).toString('hex');
  writeJson(f, { id });
  return id;
}

// ------------------------------------------------------------------ keys

// the shop's format: WS1 + 64 hex digits (dashes optional)
function normKey(input) {
  const s = String(input || '').toUpperCase().replace(/[\s-]/g, '');
  return /^WS1[0-9A-F]{64}$/.test(s) ? s : null;
}
const prettyKey = k => 'WS1-' + k.slice(3).match(/.{8}/g).join('-');
const isTrialToken = s => /^[A-Za-z0-9_-]{10,1500}\.[A-Za-z0-9_-]{20,100}$/.test(String(s || '').trim());

function verify(lic, key) {
  try {
    const payload = Buffer.from(lic.payload, 'base64url');
    if (!crypto.verify(null, payload, PUBLIC_KEY, Buffer.from(lic.sig, 'base64url'))) return null;
    const p = JSON.parse(payload.toString('utf8'));
    if (p.v !== 2 || p.device !== deviceId) return null;
    if (key && p.kh !== crypto.createHash('sha256').update(key).digest('hex')) return null;
    return p;
  } catch { return null; }
}

function loadLicense() {
  const rec = readJson(licenseFile());
  if (!rec) return null;
  const key = normKey(unprotect(rec) || '');
  const p = verify(rec, key);
  return p ? { p, key } : null;
}

// ------------------------------------------------------------------ state

function status() {
  if (!ENABLED) return 'disabled';
  if (license) return 'licensed';
  if (!trial) return 'new';
  return Date.now() < trial.expiresAt ? 'trial' : 'expired';
}

function state() {
  const s = status();
  const out = { status: s, dev: DEV, deviceName: os.hostname(), trialMinutes: TRIAL_MINUTES, shop: SHOP };
  if (trial) out.remaining = Math.max(0, Math.ceil((trial.expiresAt - Date.now()) / 1000));
  if (license) {
    const k = license.key;
    out.key = k ? `WS1-${k.slice(3, 11)}-…-${k.slice(-8)}` : 'WS1-…';
    out.activatedAt = license.p.at;
    out.licensedTo = license.p.name;
  }
  if (droppedReason) out.dropped = droppedReason;
  return out;
}

const isLocked = () => ['new', 'expired'].includes(status());

function changed() {
  lastStatus = status();
  notify(state());
}

function tick() {
  const s = status();
  if (s === 'trial') {
    if (Date.now() - lastTrialCheck > TRIAL_RECHECK) { lastTrialCheck = Date.now(); recheckTrial(); }
    // a new minute on the trial clock
    if (Math.ceil((trial.expiresAt - Date.now()) / 60000) !== Math.ceil((trial.expiresAt - Date.now() - TICK) / 60000)) notify(state());
  }
  if (s === 'licensed' && Date.now() - lastLicenseCheck > LICENSE_RECHECK) checkOnline();
  if (s !== lastStatus) changed();
}

// ------------------------------------------------------------------ server calls

async function post(url, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `WinSwift-Studio/${app.getVersion()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch { return { status: 0, error: 'offline' }; }
  let json = null;
  try { json = await res.json(); } catch {}
  if (!json) return { status: res.status, error: 'server' };
  return { status: res.status, ...json };
}

const broker = (endpoint, body) => post(`${API}/${endpoint}`, { ...body, device: deviceId, name: os.hostname(), version: app.getVersion() });

// the trial token from the shop profile: the shop says how many seconds are left
async function startTrial(token) {
  const r = await post(SHOP_API, { trial_token: token });
  if (r.status === 0) return { ok: false, error: 'offline' };
  if (r.valid !== true || r.type !== 'trial') return { ok: false, error: r.status === 200 ? 'trial_invalid' : 'server' };
  trial = { token, expiresAt: Date.now() + Math.max(0, +r.remaining_seconds || 0) * 1000 };
  writeJson(trialFile(), trial);
  lastTrialCheck = Date.now();
  droppedReason = null;
  changed();
  return { ok: true, trial: true, remaining: state().remaining };
}

async function recheckTrial() {
  if (!trial) return;
  const r = await post(SHOP_API, { trial_token: trial.token });
  if (r.status !== 200) return;   // offline or a shop error: the local clock keeps counting
  const expiresAt = r.valid === true ? Date.now() + Math.max(0, +r.remaining_seconds || 0) * 1000 : Date.now();
  if (Math.abs(expiresAt - trial.expiresAt) > 5000) { trial.expiresAt = expiresAt; writeJson(trialFile(), trial); }
  if (status() !== lastStatus) changed();
}

// one field takes either a license key or a trial token
async function activate(input) {
  if (!ENABLED) return { ok: true };
  const text = String(input || '').trim();
  if (isTrialToken(text)) return startTrial(text);
  const key = normKey(text);
  if (!key) return { ok: false, error: 'format' };
  const r = await broker('activate', { license_key: key });
  if (r.status !== 200 || !r.license) return { ok: false, error: r.error || 'server', deviceName: r.deviceName };
  const p = verify(r.license, key);
  if (!p) return { ok: false, error: 'server' };
  writeJson(licenseFile(), { ...r.license, ...protect(key) });
  license = { p, key };
  lastLicenseCheck = Date.now();
  droppedReason = null;
  changed();
  return { ok: true };
}

async function deactivate() {
  if (!license) return { ok: true };
  if (!license.key) return { ok: false, error: 'nokey' };
  const r = await broker('deactivate', { license_key: license.key });
  // the server must free the key first — otherwise it would stay locked to this PC
  if (r.status !== 200) return { ok: false, error: r.error || 'server', deviceName: r.deviceName };
  dropLicense(null);
  return { ok: true };
}

function dropLicense(reason) {
  try { fs.unlinkSync(licenseFile()); } catch {}
  license = null;
  droppedReason = reason;
  changed();
}

// asks (when online) whether this PC still holds the key and the shop still has it active; offline nothing changes
async function checkOnline() {
  if (!license || !license.key) return state();
  lastLicenseCheck = Date.now();
  const r = await broker('check', { license_key: license.key });
  if (r.status === 200 && r.active === false) dropLicense(r.reason || 'moved');
  return state();
}

function init(opts) {
  notify = opts.notify || notify;
  dir = path.join(app.getPath('userData'), DEV ? 'license-dev' : 'license');
  fs.mkdirSync(dir, { recursive: true });
  deviceId = loadDeviceId();
  license = loadLicense();
  const t = readJson(trialFile());
  trial = t && typeof t.token === 'string' && Number.isFinite(t.expiresAt) ? t : null;
  lastStatus = status();
  lastLicenseCheck = Date.now() - LICENSE_RECHECK + 15000;   // first online check shortly after start
  if (ENABLED) setInterval(tick, TICK);
}

module.exports = { init, state, isLocked, activate, deactivate, checkOnline, prettyKey, SHOP };
