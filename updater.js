// Updates from the project website: the app reads update.json (published by website/publish-update.ps1), downloads the
// installer, checks its SHA-256 and runs it silently (/S --updated --force-run) — the installer starts the new version.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// update.json can sit on either site (uploading it to the shop's hosting by FTP works too); the newest version wins
const MANIFESTS = process.env.SWIFTCODE_UPDATE_URL ? [process.env.SWIFTCODE_UPDATE_URL]
  : ['https://winswift.tacticalops.fun/update.json', 'https://xdecode.cyberscope.pl/update.json'];
const headers = () => ({ 'User-Agent': `WinSwift-Studio/${app.getVersion()}` });
let downloading = null;   // AbortController of the running download

function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

const allowedUrl = u => typeof u === 'string' && (/^https:\/\//i.test(u) || (!!process.env.SWIFTCODE_UPDATE_URL && /^http:\/\/127\.0\.0\.1[:/]/i.test(u)));

// installed with Setup.exe (not the ZIP or a source checkout) → the app can update itself
function canSelfInstall() {
  if (!app.isPackaged) return false;
  try { return fs.readdirSync(path.dirname(process.execPath)).some(f => /^Uninstall .+\.exe$/i.test(f)); } catch { return false; }
}

async function readManifest(url) {
  const current = app.getVersion();
  let res;
  try {
    res = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${current}`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch { return { offline: true }; }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  try {
    const m = await res.json();
    const version = String(m.version || '').replace(/^v/i, '');
    return /^\d+\.\d+\.\d+$/.test(version) && allowedUrl(m.url) ? { m, version } : { error: 'bad manifest' };
  } catch { return { error: 'bad manifest' }; }
}

async function check() {
  const current = app.getVersion();
  const found = await Promise.all(MANIFESTS.map(readManifest));
  const good = found.filter(f => f.m).sort((a, b) => (newer(a.version, b.version) ? -1 : newer(b.version, a.version) ? 1 : 0));
  if (!good.length) return found.every(f => f.offline) ? { current, offline: true } : { current, error: found.map(f => f.error).filter(Boolean)[0] || 'no manifest' };
  const { m, version: latest } = good[0];
  return {
    current, latest, available: newer(latest, current),
    date: m.date || '', notes: m.notes || '', notesEn: m.notes_en || m.notes || '',
    url: m.url, fallbackUrl: m.fallbackUrl, sha256: String(m.sha256 || '').toLowerCase(), size: +m.size || 0,
    mandatory: !!m.mandatory, page: allowedUrl(m.page) ? m.page : 'https://winswift.tacticalops.fun/',
    canInstall: canSelfInstall(),
  };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function fetchTo(url, file, info, onProgress, ctrl) {
  const res = await fetch(url, { headers: headers(), signal: ctrl.signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || info.size || 0;
  const tmp = file + '.part';
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(tmp);
  let writeError = null;
  out.on('error', e => { writeError = e; });
  let received = 0, lastSent = 0;
  try {
    for await (const chunk of res.body) {
      if (writeError) throw writeError;
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise(r => out.once('drain', r));
      if (Date.now() - lastSent > 150) { lastSent = Date.now(); onProgress({ received, total }); }
    }
    await new Promise((resolve, reject) => out.end(e => (e || writeError ? reject(e || writeError) : resolve())));
  } catch (e) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  onProgress({ received, total });
  if ((info.sha256 && hash.digest('hex') !== info.sha256) || (info.size && received !== info.size)) {
    fs.rmSync(tmp, { force: true });
    throw new Error('checksum');
  }
  fs.rmSync(file, { force: true });
  fs.renameSync(tmp, file);
}

async function download(info, onProgress) {
  if (downloading) return { error: 'busy' };
  if (!info || !/^\d+\.\d+\.\d+$/.test(info.latest || '')) return { error: 'bad manifest' };
  const dir = path.join(os.tmpdir(), 'WinSwift-Update');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `WinSwift-Studio-Setup-${info.latest}.exe`);
  try { if (info.sha256 && fs.existsSync(file) && (await sha256File(file)) === info.sha256) return { file }; } catch {}
  let error = 'no download link';
  for (const url of [info.url, info.fallbackUrl].filter(allowedUrl)) {
    const ctrl = downloading = new AbortController();
    try {
      await fetchTo(url, file, info, onProgress, ctrl);
      downloading = null;
      return { file };
    } catch (e) {
      downloading = null;
      if (ctrl.signal.aborted) return { error: 'cancelled' };
      error = e.message === 'checksum' ? 'checksum' : 'network';
    }
  }
  return { error };
}

function cancel() { if (downloading) downloading.abort(); }

// runs the downloaded installer silently; the caller quits the app right after so the files can be replaced
function install(file) {
  if (!canSelfInstall() || !file || !fs.existsSync(file) || path.dirname(file) !== path.join(os.tmpdir(), 'WinSwift-Update')) return false;
  // the restarted app inherits the installer's environment: leave our test/debug switches behind
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^SWIFTCODE_/i.test(k)));
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', env }).unref();
  return true;
}

module.exports = { check, download, cancel, install, newer };
