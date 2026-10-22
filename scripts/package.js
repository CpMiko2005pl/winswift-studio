// Builds the portable Windows package: dist/WinSwift Studio/ (+ .zip) with the app, a guide and helper scripts.
// Run with: npm run package
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const NAME = pkg.productName;                         // "WinSwift Studio"
const out = path.join(root, 'dist', NAME);
const appDir = path.join(out, 'resources', 'app');
const zip = path.join(root, 'dist', `WinSwift-Studio-${pkg.version}-Windows-x64.zip`);

const copy = (from, to, filter) => fs.cpSync(from, to, { recursive: true, filter: filter || (() => true) });
const log = s => console.log(s);

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(appDir, { recursive: true });

// 1) Electron runtime — only the English and Polish UI locales
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
copy(electronDist, out, src => {
  const rel = path.relative(electronDist, src);
  if (rel.startsWith('locales' + path.sep)) return /^(en-US|pl)\.pak$/.test(path.basename(src));
  return !/^resources[\\/]default_app\.asar$/.test(rel);
});
fs.renameSync(path.join(out, 'electron.exe'), path.join(out, `${NAME}.exe`));
log('electron runtime copied');

// 2) the app
for (const f of ['main.js', 'preload.js', 'sim-preload.js', 'buildtools.js', 'activation.js', 'updater.js', 'LICENSE', 'README.md']) copy(path.join(root, f), path.join(appDir, f));
for (const d of ['src', 'runtime']) copy(path.join(root, d), path.join(appDir, d));
copy(path.join(root, 'scripts', 'fetch-winsdk.js'), path.join(appDir, 'scripts', 'fetch-winsdk.js'));
for (const f of ['icon.ico', 'icon.png']) copy(path.join(root, 'build', f), path.join(appDir, 'build', f));
const appPkg = { name: pkg.name, productName: NAME, version: pkg.version, description: pkg.description, main: pkg.main, author: pkg.author, license: pkg.license };
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2));
// runtime dependencies (only the parts the app loads)
const nm = p => path.join(root, 'node_modules', p);
copy(nm('monaco-editor/min'), path.join(appDir, 'node_modules/monaco-editor/min'));
copy(nm('monaco-editor/LICENSE'), path.join(appDir, 'node_modules/monaco-editor/LICENSE'));
copy(nm('monaco-editor/package.json'), path.join(appDir, 'node_modules/monaco-editor/package.json'));
copy(nm('lucide-static/icons'), path.join(appDir, 'node_modules/lucide-static/icons'));
copy(nm('lucide-static/LICENSE'), path.join(appDir, 'node_modules/lucide-static/LICENSE'));
copy(nm('@fontsource/inter'), path.join(appDir, 'node_modules/@fontsource/inter'), src => !/\.(woff)$/i.test(src) || /latin/i.test(src));
log('app files copied');

// 3) exe icon and version info
const rcedit = nm('rcedit/bin/rcedit-x64.exe');
if (fs.existsSync(rcedit)) {
  execFileSync(rcedit, [path.join(out, `${NAME}.exe`),
    '--set-icon', path.join(root, 'build', 'icon.ico'),
    '--set-version-string', 'ProductName', NAME,
    '--set-version-string', 'FileDescription', NAME,
    '--set-version-string', 'CompanyName', 'WinSwift Studio (sponsor: ProZlecenie.pl)',
    '--set-version-string', 'LegalCopyright', `MIT License, ${pkg.author}`,
    '--set-version-string', 'OriginalFilename', `${NAME}.exe`,
    '--set-file-version', pkg.version, '--set-product-version', pkg.version]);
  log('exe icon and version info set');
} else log('rcedit not found — exe keeps the Electron icon');

// 4) guide and helper scripts next to the exe
copy(path.join(root, 'packaging'), out);
log('guide and scripts copied');

// 5) zip
execFileSync('tar', ['-a', '-c', '-f', zip, '-C', path.join(root, 'dist'), NAME], { stdio: 'inherit' });
log(`zip: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`);
