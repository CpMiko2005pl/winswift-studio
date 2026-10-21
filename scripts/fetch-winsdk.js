// Downloads the Windows SDK pieces Swift needs (UCRT + Desktop headers/libs for x64) straight from the
// Visual Studio package feed and unpacks them with `msiexec /a` into a per-user folder. No admin rights needed.
//   node scripts/fetch-winsdk.js [targetDir]
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const LOCAL = process.env.LOCALAPPDATA;
const TARGET = path.resolve(process.argv[2] || path.join(LOCAL, 'SwiftCode', 'WinSDK'));
const DL = path.join(TARGET, '_download');

function get(url, redirects = 8) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SwiftCode' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function download(payload, dest) {
  if (fs.existsSync(dest)) {
    const have = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    if (!payload.sha256 || have.toLowerCase() === payload.sha256.toLowerCase()) return;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await get(payload.url);
      if (payload.sha256) {
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        if (h.toLowerCase() !== payload.sha256.toLowerCase()) throw new Error('hash mismatch');
      }
      fs.writeFileSync(dest, buf);
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`  retry ${path.basename(dest)} (${e.message})`);
    }
  }
}

function msiCabs(msiPath) {
  // ask Windows Installer for the external cabinets listed in the Media table
  const ps = `$i=New-Object -ComObject WindowsInstaller.Installer;$d=$i.GetType().InvokeMember('OpenDatabase','InvokeMethod',$null,$i,@('${msiPath.replace(/'/g, "''")}',0));` +
    `$v=$d.GetType().InvokeMember('OpenView','InvokeMethod',$null,$d,@('SELECT Cabinet FROM Media'));$v.GetType().InvokeMember('Execute','InvokeMethod',$null,$v,$null);` +
    `while(($r=$v.GetType().InvokeMember('Fetch','InvokeMethod',$null,$v,$null)) -ne $null){$c=$r.GetType().InvokeMember('StringData','GetProperty',$null,$r,1);if($c -and -not $c.StartsWith('#')){$c}}`;
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
  return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

(async () => {
  fs.mkdirSync(DL, { recursive: true });
  console.log('Reading Visual Studio channel manifest…');
  const channel = JSON.parse(await get('https://aka.ms/vs/17/release/channel'));
  const vsItem = channel.channelItems.find(i => i.id === 'Microsoft.VisualStudio.Manifests.VisualStudio');
  const manifest = JSON.parse(await get(vsItem.payloads[0].url));

  const sdkPkgs = manifest.packages.filter(p => /^Win1[01]SDK_10\.0\.\d+$/.test(p.id) && p.payloads?.length);
  sdkPkgs.sort((a, b) => +b.id.split('.').pop() - +a.id.split('.').pop());
  const pkg = sdkPkgs[0];
  const version = '10.0.' + pkg.id.split('.').pop();
  console.log(`Using ${pkg.id}`);

  const byName = new Map(pkg.payloads.map(p => [p.fileName.replace(/^Installers\\/, '').toLowerCase(), p]));
  const wanted = [
    'Windows SDK for Windows Store Apps Headers-x86_en-us.msi',
    'Windows SDK for Windows Store Apps Headers OnecoreUap-x86_en-us.msi',
    'Windows SDK for Windows Store Apps Libs-x86_en-us.msi',
    'Universal CRT Headers Libraries and Sources-x86_en-us.msi',
    'Windows SDK Desktop Headers x64-x86_en-us.msi',
    'Windows SDK Desktop Headers x86-x86_en-us.msi',
    'Windows SDK OnecoreUap Headers x64-x86_en-us.msi',
    'Windows SDK OnecoreUap Headers x86-x86_en-us.msi',
    'Windows SDK Desktop Libs x64-x86_en-us.msi',
  ];

  const msis = [];
  for (const name of wanted) {
    const p = byName.get(name.toLowerCase());
    if (!p) { console.log(`  (missing in feed: ${name})`); continue; }
    const dest = path.join(DL, name);
    process.stdout.write(`Downloading ${name}… `);
    await download(p, dest);
    const cabs = msiCabs(dest);
    let missing = 0;
    for (const cab of cabs) {
      const cp = byName.get(cab.toLowerCase());
      if (cp) await download(cp, path.join(DL, cab)); else missing++;
    }
    console.log(`ok (${cabs.length} cab${missing ? `, ${missing} not in feed` : ''})`);
    msis.push(dest);
  }

  for (const msi of msis) {
    process.stdout.write(`Unpacking ${path.basename(msi)}… `);
    execFileSync('msiexec.exe', ['/a', msi, '/quiet', '/qn', `TARGETDIR=${TARGET}`], { stdio: 'inherit' });
    console.log('ok');
  }

  // msiexec /a also drops copies of the MSIs next to the target; remove them
  for (const f of fs.readdirSync(TARGET)) if (f.toLowerCase().endsWith('.msi')) fs.rmSync(path.join(TARGET, f), { force: true });

  const kit = path.join(TARGET, 'Windows Kits', '10');
  const fullVersion = fs.readdirSync(path.join(kit, 'Include')).filter(d => d.startsWith(version)).sort().pop();
  const inc = path.join(kit, 'Include', fullVersion);
  for (const d of ['ucrt', 'um', 'shared']) if (!fs.existsSync(path.join(inc, d))) throw new Error(`Missing ${path.join(inc, d)}`);
  fs.writeFileSync(path.join(TARGET, 'sdk.json'), JSON.stringify({ root: kit, version: fullVersion }, null, 2));
  fs.rmSync(DL, { recursive: true, force: true });
  console.log(`\nWindows SDK ${version} ready in ${kit}`);
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
