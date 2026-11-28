'use strict';
// Swift packages for iOS projects (File ▸ Add Package Dependencies…). The list lives where Xcode keeps it —
// project.pbxproj (XCRemoteSwiftPackageReference + XCSwiftPackageProductDependency) — so Xcode on a Mac resolves the
// real packages from the same repository. On Windows WinSwift builds them with SwiftPM: a generated wrapper package
// depends on every product the app links and is built as one static library against the SwiftUI for Windows runtime.
// Packages written only for Apple platforms (they need UIKit) are replaced by a compatible package that ships with
// WinSwift (runtime/Packages/<Name>), exposing the same API.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// repositories WinSwift swaps for its own package (key: host/owner/repo, lower case)
const COMPAT = {
  'github.com/onevcat/kingfisher': { dir: 'Kingfisher', products: ['Kingfisher'],
    note: 'In WinSwift Studio Kingfisher runs as a compatible version made for the simulator (KFImage, ImageCache, ImagePrefetcher); Xcode uses the real package.' },
};

// shown in Add Package Dependencies; every one of them builds on Windows
const SUGGESTED = [
  { url: 'https://github.com/onevcat/Kingfisher.git', name: 'Kingfisher', products: ['Kingfisher'],
    summary: 'Downloads and caches images from the web — KFImage(url) in SwiftUI.' },
  { url: 'https://github.com/apple/swift-algorithms.git', name: 'swift-algorithms', products: ['Algorithms'],
    summary: 'Commonly used sequence and collection algorithms: chunks, combinations, uniqued…' },
  { url: 'https://github.com/apple/swift-collections.git', name: 'swift-collections', products: ['Collections'],
    summary: 'Deque, OrderedSet, OrderedDictionary, Heap and other data structures.' },
];

const WRAPPER = 'WinSwiftPackages';

/** host/owner/repo in lower case — the same repository however its URL is written. */
function repoKey(url) {
  let s = String(url || '').trim();
  const ssh = /^[\w.-]+@([^:]+):(.+)$/.exec(s);
  if (ssh) s = ssh[1] + '/' + ssh[2];
  s = s.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  return s.toLowerCase();
}

/** The package's name as SwiftPM derives it from the URL (its identity is the lower-case form). */
function repoName(url) {
  const last = String(url || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/i, '').split(/[/:]/).pop();
  return last || 'Package';
}
const identity = url => repoName(url).toLowerCase();

function compatFor(url) { return COMPAT[repoKey(url)] || null; }

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const quoteSafe = s => /^[^"\\\n]+$/.test(String(s || ''));

/** Xcode's dependency rule as the argument list of SwiftPM's `.package(url:…)`. */
function requirementSwift(req = {}) {
  const v = k => {
    const x = req[k];
    if (!quoteSafe(x)) throw new Error(`Invalid ${k} in the package's dependency rule`);
    return JSON.stringify(String(x));
  };
  switch (req.kind) {
    case 'upToNextMajorVersion': return `from: ${v('minimumVersion')}`;
    case 'upToNextMinorVersion': return `.upToNextMinor(from: ${v('minimumVersion')})`;
    case 'exactVersion': return `exact: ${v('version')}`;
    case 'versionRange': return `${v('minimumVersion')}..<${v('maximumVersion')}`;
    case 'branch': return `branch: ${v('branch')}`;
    case 'revision': return `revision: ${v('revision')}`;
    default: throw new Error(`Unsupported dependency rule “${req.kind || '?'}”`);
  }
}

/** One-line description of a rule, the way Xcode's Package Dependencies table shows it. */
function requirementLabel(req = {}) {
  switch (req.kind) {
    case 'upToNextMajorVersion': return `${req.minimumVersion} – Next Major`;
    case 'upToNextMinorVersion': return `${req.minimumVersion} – Next Minor`;
    case 'exactVersion': return req.version;
    case 'versionRange': return `${req.minimumVersion} – ${req.maximumVersion}`;
    case 'branch': return `Branch: ${req.branch}`;
    case 'revision': return `Commit: ${String(req.revision || '').slice(0, 7)}`;
    default: return '—';
  }
}

const swiftPath = p => JSON.stringify(p.replace(/\\/g, '/'));

/**
 * The wrapper's Package.swift. `packs`: [{ kind: 'remote'|'local', url | path, requirement, products: [{ name }] }].
 * `compatRoot`: WinSwift's runtime/Packages folder.
 */
function wrapperManifest(packs, compatRoot) {
  const deps = [], products = [];
  const seen = new Set();
  for (const pk of packs) {
    const names = pk.products.map(x => x.name || x).filter(Boolean);
    if (!names.length) continue;
    let dep, id;
    const compat = pk.kind === 'remote' && compatFor(pk.url);
    if (compat) {
      dep = `.package(path: ${swiftPath(path.join(compatRoot, compat.dir))})`;
      id = compat.dir.toLowerCase();
    } else if (pk.kind === 'local') {
      dep = `.package(path: ${swiftPath(pk.path)})`;
      id = path.basename(pk.path).toLowerCase();
    } else {
      dep = `.package(url: ${JSON.stringify(pk.url)}, ${requirementSwift(pk.requirement)})`;
      id = identity(pk.url);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    deps.push(dep);
    for (const n of names) {
      if (!quoteSafe(n)) throw new Error(`Invalid product name “${n}”`);
      products.push(`.product(name: ${JSON.stringify(n)}, package: ${JSON.stringify(id)})`);
    }
  }
  return `// swift-tools-version:5.9
// Generated by WinSwift Studio from the project's Package Dependencies: every package product the app links,
// built as one static library for the Windows simulator. Don't edit — it is rewritten before each build.
import PackageDescription

let package = Package(
    name: "${WRAPPER}",
    products: [.library(name: "${WRAPPER}", type: .static, targets: ["${WRAPPER}"])],
    dependencies: [
${deps.map(d => `        ${d},\n`).join('')}    ],
    targets: [
        .target(name: "${WRAPPER}", dependencies: [
${products.map(d => `            ${d},\n`).join('')}        ]),
    ]
)
`;
}

/** The wrapper's build folder (…/.build/<triple>/debug) once SwiftPM has built it. */
function buildFolder(dir) {
  const b = path.join(dir, '.build');
  let names = [];
  try { names = fs.readdirSync(b); } catch { return null; }
  for (const n of names.filter(n => /-windows-/.test(n)).sort()) {
    const d = path.join(b, n, 'debug');
    if (fs.existsSync(path.join(d, 'description.json'))) return d;
  }
  return null;
}

/**
 * What the app's compile needs from a built wrapper: the module folder, the C module maps of C targets (as SwiftPM
 * passed them to the wrapper itself) and the static library.
 */
function linkInfo(dir) {
  const dbg = buildFolder(dir);
  if (!dbg) return null;
  const lib = path.join(dbg, `lib${WRAPPER}.a`);
  if (!fs.existsSync(lib)) return null;
  const desc = JSON.parse(fs.readFileSync(path.join(dbg, 'description.json'), 'utf8'));
  const cmd = Object.entries(desc.swiftCommands || {}).find(([k]) => k.startsWith(`C.${WRAPPER}-`));
  if (!cmd) return null;
  const a = cmd[1].otherArguments || [];
  const xcc = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-Xcc' && /^-fmodule-map-file=/.test(a[i + 1] || '')) { xcc.push('-Xcc', a[i + 1]); i++; }
    else if (a[i] === '-Xcc' && a[i + 1] === '-I' && a[i + 2] === '-Xcc' && a[i + 3]) { xcc.push('-Xcc', '-I', '-Xcc', a[i + 3]); i += 3; }
  }
  return { importPath: cmd[1].importPath, xcc, lib };
}

// ------------------------------------------------------------------ looking a package up before adding it

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' } : null;
}
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] - y[k];
  if (x.pre === y.pre) return 0;
  return !x.pre ? 1 : !y.pre ? -1 : x.pre < y.pre ? -1 : 1;
}

function git(gitExe, args, env) {
  return new Promise(resolve => {
    execFile(gitExe, args, { windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024, env: { ...env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || (err && err.message) || '') }));
  });
}

/** Release versions of a repository (newest first), its branches, and the products its manifest declares. */
async function lookup(url, { gitExe, env }) {
  url = String(url || '').trim();
  if (!/^(https?:\/\/|git@|ssh:\/\/)/i.test(url)) {
    // a name instead of a URL: one of the suggested packages
    const q = url.toLowerCase().replace(/\s+/g, '');
    const hits = q ? SUGGESTED.filter(s => s.name.toLowerCase().includes(q) || s.products.some(p => p.toLowerCase().includes(q))) : [];
    if (hits.length !== 1) return { ok: false, error: 'Enter the URL of a Git repository, e.g. https://github.com/onevcat/Kingfisher.git' };
    url = hits[0].url;
  }
  if (!gitExe) return { ok: false, error: 'Git is needed to download packages. Install Git for Windows (https://git-scm.com/download/win) and restart WinSwift Studio.' };
  const r = await git(gitExe, ['ls-remote', '--tags', '--heads', url], env);
  if (!r.ok) return { ok: false, error: `Couldn’t reach ${url}. Check the address and your connection.\n${r.err.trim().split('\n').slice(-2).join('\n')}` };
  const tags = [], branches = [];
  for (const line of r.out.split('\n')) {
    const m = /^[0-9a-f]+\trefs\/(tags|heads)\/(.+?)(\^\{\})?$/.exec(line.trim());
    if (!m || m[3]) continue;
    if (m[1] === 'heads') branches.push(m[2]);
    else if (parseVersion(m[2]) && VERSION.test(m[2].replace(/^v/, ''))) tags.push(m[2]);
  }
  const versions = [...new Set(tags)].sort((a, b) => compareVersions(b, a));
  const releases = versions.filter(v => !parseVersion(v).pre);
  const latest = (releases[0] || versions[0] || '').replace(/^v/, '');
  const compat = compatFor(url);
  const known = SUGGESTED.find(s => repoKey(s.url) === repoKey(url));
  let products = compat ? compat.products : await manifestProducts(url, releases[0] || versions[0] || branches.find(b => b === 'main') || branches[0]);
  if ((!products || !products.length) && known) products = known.products;
  return { ok: true, url, name: repoName(url), latest, versions: versions.map(v => v.replace(/^v/, '')).slice(0, 40), branches: branches.slice(0, 40),
    products: products || [], productsKnown: !!(products && products.length), compat: compat ? compat.note : null };
}

/** Library products from the repository's Package.swift — read straight from GitHub, so nothing is cloned yet. */
async function manifestProducts(url, ref) {
  const m = /^github\.com\/([^/]+)\/([^/]+)$/.exec(repoKey(url));
  if (!m || !ref) return null;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${encodeURIComponent(ref).replace(/%2F/g, '/')}/Package.swift`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const text = await res.text();
    const out = [];
    for (const x of text.matchAll(/\.library\s*\(\s*name\s*:\s*"([^"]+)"/g)) if (!out.includes(x[1])) out.push(x[1]);
    return out;
  } catch { return null; }
}

module.exports = { COMPAT, SUGGESTED, WRAPPER, repoKey, repoName, identity, compatFor, requirementSwift, requirementLabel, wrapperManifest, linkInfo, lookup, compareVersions };
