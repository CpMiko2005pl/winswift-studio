'use strict';
// Xcode projects (.xcodeproj). New WinSwift iOS projects carry a real project.pbxproj (Xcode 16 format with a
// folder-synchronized group), so the same git repository opens in Xcode on a Mac. For existing Xcode projects the file
// operations and settings made in WinSwift are written into project.pbxproj with small text edits that keep Xcode's own
// formatting — a teammate's git diff shows only the lines that really changed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ------------------------------------------------------------------ parser (OpenStep plist, with source positions)

function parse(text) {
  let i = 0;
  const n = text.length;
  const err = m => new Error(`project.pbxproj: ${m} (offset ${i})`);
  function skip() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
      if (text[i] === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) throw err('unterminated comment'); i = e + 2; continue; }
      return;
    }
  }
  function str() {
    if (text[i] === '"') {
      let s = '';
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\') { const c = text[i + 1]; s += c === 'n' ? '\n' : c === 't' ? '\t' : c; i += 2; } else s += text[i++];
      }
      if (text[i] !== '"') throw err('unterminated string');
      i++;
      return s;
    }
    const s0 = i;
    while (i < n && !/[\s{}();,="]/.test(text[i]) && !(text[i] === '/' && (text[i + 1] === '*' || text[i + 1] === '/'))) i++;
    if (i === s0) throw err('expected a value');
    return text.slice(s0, i);
  }
  function value() {
    skip();
    if (text[i] === '{') return dict();
    if (text[i] === '(') return array();
    const start = i;
    const v = str();
    return { type: 'str', value: v, start, end: i };
  }
  function dict() {
    const start = i++;
    const entries = [];
    for (;;) {
      skip();
      if (text[i] === '}') { i++; return { type: 'dict', entries, start, end: i }; }
      const kstart = i;
      const key = str();
      skip();
      if (text[i] !== '=') throw err('expected =');
      i++;
      const v = value();
      skip();
      if (text[i] !== ';') throw err('expected ;');
      i++;
      entries.push({ key, value: v, start: kstart, end: i });
    }
  }
  function array() {
    const start = i++;
    const items = [];
    for (;;) {
      skip();
      if (text[i] === ')') { i++; return { type: 'array', items, start, end: i }; }
      items.push(value());
      skip();
      if (text[i] === ',') i++;
      else if (text[i] !== ')') throw err('expected , or )');
    }
  }
  skip();
  const root = value();
  skip();
  if (i < n) throw err('unexpected text after the project');
  return root;
}

const field = (d, key) => (d && d.type === 'dict' ? (d.entries.find(e => e.key === key) || {}).value : undefined);
const str = (d, key) => { const v = field(d, key); return v && v.type === 'str' ? v.value : undefined; };
const list = (d, key) => { const v = field(d, key); return v && v.type === 'array' ? v.items.filter(x => x.type === 'str').map(x => x.value) : []; };

/** How Xcode writes a value: bare when it can, quoted otherwise. */
function q(v) {
  v = String(v);
  return /^[A-Za-z0-9_$/.:-]+$/.test(v) ? v : '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
}

const norm = p => path.resolve(p).toLowerCase();
const inside = (p, dir) => { const a = norm(p), b = norm(dir); return a === b || a.startsWith(b.endsWith('\\') ? b : b + '\\'); };

// ------------------------------------------------------------------ loading

/** The .xcodeproj of a project folder (the first one directly inside it), or null. */
function projectFile(root) {
  try {
    const x = fs.readdirSync(root).filter(n => n.toLowerCase().endsWith('.xcodeproj')).sort()[0];
    const pbx = x && path.join(root, x, 'project.pbxproj');
    return pbx && fs.existsSync(pbx) ? pbx : null;
  } catch { return null; }
}

/** The .xcodeproj that owns a file or folder: the nearest folder above it with one. */
function projectFileFor(p) {
  let dir = path.dirname(path.resolve(p));
  for (let k = 0; k < 12; k++) {
    const pbx = projectFile(dir);
    if (pbx) return pbx;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function load(pbxPath, text = fs.readFileSync(pbxPath, 'utf8')) {
  const root = parse(text);
  const objectsNode = field(root, 'objects');
  if (!objectsNode || objectsNode.type !== 'dict') throw new Error('project.pbxproj has no objects');
  const objects = new Map();
  for (const e of objectsNode.entries) objects.set(e.key, { id: e.key, entry: e, dict: e.value, isa: str(e.value, 'isa') });
  const p = { pbxPath, text, root, objects, rootId: str(root, 'rootObject'), eol: text.includes('\r\n') ? '\r\n' : '\n' };
  p.projectDir = path.dirname(path.dirname(pbxPath));
  p.project = objects.get(p.rootId);
  if (!p.project) throw new Error('project.pbxproj has no root object');
  return p;
}

/** Absolute paths of every group and file reference reachable from the main group. */
function resolveTree(p) {
  const base = path.resolve(p.projectDir, str(p.project.dict, 'projectDirPath') || '');
  const paths = new Map(), parents = new Map();
  (function walk(id, parentDir, parentId, depth) {
    const o = p.objects.get(id);
    if (!o || depth > 40) return;
    const tree = str(o.dict, 'sourceTree') || '<group>';
    const rel = str(o.dict, 'path');
    let abs;
    if (tree === '<group>') abs = rel ? path.resolve(parentDir, rel) : parentDir;
    else if (tree === 'SOURCE_ROOT') abs = rel ? path.resolve(base, rel) : base;
    else return;   // build products, SDK frameworks, absolute Mac paths
    paths.set(id, abs);
    parents.set(id, parentId);
    for (const c of list(o.dict, 'children')) walk(c, abs, id, depth + 1);
  })(str(p.project.dict, 'mainGroup'), base, null, 0);
  return { paths, parents };
}

function targets(p) {
  return list(p.project.dict, 'targets').map(id => p.objects.get(id)).filter(Boolean);
}
function appTarget(p) {
  const ts = targets(p);
  return ts.find(t => str(t.dict, 'productType') === 'com.apple.product-type.application')
    || ts.find(t => /application/.test(str(t.dict, 'productType') || '')) || null;
}
function phase(p, target, isa) {
  for (const id of list(target.dict, 'buildPhases')) { const o = p.objects.get(id); if (o && o.isa === isa) return o; }
  return null;
}
function syncedDirs(p, tree = resolveTree(p)) {
  const out = [];
  for (const o of p.objects.values()) if (o.isa === 'PBXFileSystemSynchronizedRootGroup' && tree.paths.has(o.id)) out.push(tree.paths.get(o.id));
  return out;
}

// ------------------------------------------------------------------ what WinSwift compiles

/** The app target's sources: files of its Sources phase plus its synchronized folders, minus membership exceptions. */
function appSources(root) {
  const pbx = projectFile(root);
  if (!pbx) return null;
  let p;
  try { p = load(pbx); } catch { return null; }
  const t = appTarget(p);
  if (!t) return null;
  const tree = resolveTree(p);
  const files = [], dirs = [], excluded = [];
  for (const g of list(t.dict, 'fileSystemSynchronizedGroups')) {
    const d = tree.paths.get(g);
    if (!d) continue;
    dirs.push(d);
    for (const ex of list(p.objects.get(g).dict, 'exceptions')) {
      const set = p.objects.get(ex);
      if (set && str(set.dict, 'target') === t.id) for (const m of list(set.dict, 'membershipExceptions')) excluded.push(path.resolve(d, m));
    }
  }
  const src = phase(p, t, 'PBXSourcesBuildPhase');
  if (src) for (const bf of list(src.dict, 'files')) {
    const ref = str((p.objects.get(bf) || {}).dict, 'fileRef');
    const f = ref && tree.paths.get(ref);
    if (f) files.push(f);
  }
  return { target: str(t.dict, 'name'), files, dirs, excluded };
}

// ------------------------------------------------------------------ settings shared with Xcode

const SETTING_KEYS = {
  bundleId: 'PRODUCT_BUNDLE_IDENTIFIER', version: 'MARKETING_VERSION', build: 'CURRENT_PROJECT_VERSION',
  displayName: 'INFOPLIST_KEY_CFBundleDisplayName', deploymentTarget: 'IPHONEOS_DEPLOYMENT_TARGET',
};
// Info.plist keys Xcode can generate from INFOPLIST_KEY_<key> build settings
const INFO_KEYS = new Set(['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription', 'NSContactsUsageDescription', 'NSCalendarsUsageDescription', 'NSCalendarsFullAccessUsageDescription',
  'NSCalendarsWriteOnlyAccessUsageDescription', 'NSRemindersUsageDescription', 'NSRemindersFullAccessUsageDescription',
  'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription', 'NSMotionUsageDescription', 'NSFaceIDUsageDescription',
  'NSSpeechRecognitionUsageDescription', 'NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription', 'NSHomeKitUsageDescription',
  'NSAppleMusicUsageDescription', 'NSLocalNetworkUsageDescription', 'NSUserTrackingUsageDescription', 'NSSiriUsageDescription',
  'NSHumanReadableCopyright', 'LSApplicationCategoryType', 'ITSAppUsesNonExemptEncryption', 'UIStatusBarStyle', 'UIRequiresFullScreen']);

function configs(p, owner) {
  const cl = p.objects.get(str(owner.dict, 'buildConfigurationList'));
  return cl ? list(cl.dict, 'buildConfigurations').map(id => p.objects.get(id)).filter(Boolean) : [];
}

/** Settings of the app target as WinSwift's project editor names them; null without an Xcode project. */
function readSettings(root) {
  const pbx = projectFile(root);
  if (!pbx) return null;
  let p;
  try { p = load(pbx); } catch { return null; }
  const t = appTarget(p);
  if (!t) return null;
  const pick = cfgs => cfgs.find(c => str(c.dict, 'name') === 'Debug') || cfgs[0];
  const tc = pick(configs(p, t)), pc = pick(configs(p, p.project));
  const bs = tc && field(tc.dict, 'buildSettings'), pbs = pc && field(pc.dict, 'buildSettings');
  const out = { xcodeProject: path.basename(path.dirname(pbx)), xcodeTarget: str(t.dict, 'name') };
  for (const [k, key] of Object.entries(SETTING_KEYS)) {
    const v = str(bs, key) ?? str(pbs, key);
    if (v != null && !v.includes('$(')) out[k] = v;
  }
  const info = {};
  if (bs) for (const e of bs.entries) {
    const m = /^INFOPLIST_KEY_(.+)$/.exec(e.key);
    if (m && INFO_KEYS.has(m[1]) && e.value.type === 'str') info[m[1]] = e.value.value;
  }
  out.info = info;
  return out;
}

// ------------------------------------------------------------------ editing

function lineStart(text, i) { return text.lastIndexOf('\n', i - 1) + 1; }
function lineEnd(text, i) { const e = text.indexOf('\n', i); return e < 0 ? text.length : e + 1; }
function indentOf(text, i) { const s = lineStart(text, i); return /^[ \t]*/.exec(text.slice(s, s + 64))[0]; }

function newId(p, used = new Set()) {
  for (;;) {
    const id = crypto.randomBytes(12).toString('hex').toUpperCase();
    if (!p.objects.has(id) && !used.has(id)) { used.add(id); return id; }
  }
}

/** Applies [start, end, replacement] edits (non-overlapping) and returns the new text. */
function apply(text, edits) {
  edits.sort((a, b) => b[0] - a[0]);
  for (const [s, e, r] of edits) text = text.slice(0, s) + r + text.slice(e);
  return text;
}

function sectionInsert(p, isa, objText) {
  const end = p.text.indexOf(`/* End ${isa} section */`);
  if (end >= 0) { const at = lineStart(p.text, end); return [at, at, `\t\t${objText}${p.eol}`]; }
  const objs = field(p.root, 'objects');
  const at = lineEnd(p.text, objs.start);
  return [at, at, `${p.eol}/* Begin ${isa} section */${p.eol}\t\t${objText}${p.eol}/* End ${isa} section */${p.eol}`];
}

function arrayInsert(p, owner, key, itemText) {
  const node = field(owner.dict, key);
  if (!node || node.type !== 'array') return null;
  const close = node.end - 1;
  const ls = lineStart(p.text, close);
  if (p.text.slice(ls, close).trim() === '') {
    const ind = indentOf(p.text, close) + '\t';
    return [ls, ls, `${ind}${itemText},${p.eol}`];
  }
  // written on one line: `files = ( );`
  const keyIndent = indentOf(p.text, node.start);
  const items = node.items.map(it => p.text.slice(it.start, it.end));
  const body = [...items, itemText].map(x => `${keyIndent}\t${x},${p.eol}`).join('');
  return [node.start, node.end, `(${p.eol}${body}${keyIndent})`];
}

function save(p, text) {
  load(p.pbxPath, text);   // never write a project Xcode could not read
  backup(p);
  const tmp = p.pbxPath + '.winswift-tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p.pbxPath);
}

// one copy of the original per project and day, outside the repository's tracked files
function backup(p) {
  try {
    const dir = path.join(p.projectDir, '.build', 'swiftcode', 'xcodeproj-backup');
    const f = path.join(dir, `project-${new Date().toISOString().slice(0, 10)}.pbxproj`);
    if (fs.existsSync(f)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(p.pbxPath, f);
    ensureBuildIgnore(p.projectDir);
  } catch {}
}

const FILE_TYPES = {
  '.swift': 'sourcecode.swift', '.xcassets': 'folder.assetcatalog', '.json': 'text.json', '.strings': 'text.plist.strings',
  '.xcstrings': 'text.json.xcstrings', '.plist': 'text.plist.xml', '.png': 'image.png', '.jpg': 'image.jpeg', '.jpeg': 'image.jpeg',
  '.gif': 'image.gif', '.pdf': 'image.pdf', '.svg': 'text.xml', '.txt': 'text', '.md': 'net.daringfireball.markdown',
  '.mp3': 'audio.mp3', '.wav': 'audio.wav', '.m4a': 'file', '.mp4': 'file', '.mov': 'video.quicktime', '.ttf': 'file', '.otf': 'file',
  '.storyboard': 'file.storyboard', '.xib': 'file.xib', '.h': 'sourcecode.c.h', '.m': 'sourcecode.c.objc', '.c': 'sourcecode.c.c',
};
const RESOURCE = /\.(xcassets|json|strings|xcstrings|png|jpe?g|gif|pdf|svg|txt|mp3|wav|m4a|mp4|mov|ttf|otf|storyboard|xib)$/i;
const SOURCE = /\.(swift|m|c|mm|cpp)$/i;

/** Makes sure a group exists for `dir` (creating nested groups like Xcode's New Group). Returns [p, groupId] or null. */
function ensureGroup(p, dir) {
  const tree = resolveTree(p);
  for (const [id, abs] of tree.paths) {
    const o = p.objects.get(id);
    if ((o.isa === 'PBXGroup' || o.isa === 'PBXFileSystemSynchronizedRootGroup') && norm(abs) === norm(dir)) return [p, id];
  }
  if (!inside(dir, p.projectDir) || norm(dir) === norm(p.projectDir)) return null;
  const parent = ensureGroup(p, path.dirname(dir));
  if (!parent) return null;
  [p] = parent;
  const parentObj = p.objects.get(parent[1]);
  if (parentObj.isa !== 'PBXGroup') return null;
  const name = path.basename(dir), gid = newId(p);
  const e = p.eol;
  const obj = `${gid} /* ${name} */ = {${e}\t\t\tisa = PBXGroup;${e}\t\t\tchildren = (${e}\t\t\t);${e}\t\t\tpath = ${q(name)};${e}\t\t\tsourceTree = "<group>";${e}\t\t};`;
  const text = apply(p.text, [sectionInsert(p, 'PBXGroup', obj), arrayInsert(p, parentObj, 'children', `${gid} /* ${name} */`)].filter(Boolean));
  const np = load(p.pbxPath, text);
  return [np, gid];
}

/**
 * A file or folder was created inside the project (New File, New Group, Add Files…). Classic Xcode projects get the
 * file reference, the group entry and the target membership Xcode would add; synchronized folders need nothing.
 * Returns what happened: 'none' | 'synced' | 'exists' | 'added'.
 */
function addPath(abs) {
  const pbx = projectFileFor(abs);
  if (!pbx) return 'none';
  let p = load(pbx);
  if (!inside(abs, p.projectDir)) return 'none';
  if (syncedDirs(p).some(d => inside(abs, d))) return 'synced';
  const isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory() && !/\.(xcassets|bundle)$/i.test(abs);
  if (isDir) { const g = ensureGroup(p, abs); if (g && g[0] !== p) save(p, g[0].text); return g ? 'added' : 'none'; }
  const tree = resolveTree(p);
  for (const [id, f] of tree.paths) if (norm(f) === norm(abs) && p.objects.get(id).isa === 'PBXFileReference') return 'exists';
  const g = ensureGroup(p, path.dirname(abs));
  if (!g) return 'none';
  const [gp, groupId] = g;
  p = gp;
  const groupDir = resolveTree(p).paths.get(groupId);
  const name = path.basename(abs), rel = path.relative(groupDir, abs).split(path.sep).join('/');
  const type = FILE_TYPES[path.extname(abs).toLowerCase()] || 'file';
  const used = new Set();
  const fid = newId(p, used);
  const nameField = rel !== name ? `name = ${q(name)}; ` : '';
  const edits = [
    sectionInsert(p, 'PBXFileReference', `${fid} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${type}; ${nameField}path = ${q(rel)}; sourceTree = "<group>"; };`),
    arrayInsert(p, p.objects.get(groupId), 'children', `${fid} /* ${name} */`),
  ];
  const t = appTarget(p);
  const ph = t && (SOURCE.test(name) ? phase(p, t, 'PBXSourcesBuildPhase') : RESOURCE.test(name) ? phase(p, t, 'PBXResourcesBuildPhase') : null);
  if (ph) {
    const bid = newId(p, used), where = ph.isa === 'PBXSourcesBuildPhase' ? 'Sources' : 'Resources';
    edits.push(sectionInsert(p, 'PBXBuildFile', `${bid} /* ${name} in ${where} */ = {isa = PBXBuildFile; fileRef = ${fid} /* ${name} */; };`));
    edits.push(arrayInsert(p, ph, 'files', `${bid} /* ${name} in ${where} */`));
  }
  save(p, apply(p.text, edits.filter(Boolean)));
  return 'added';
}

/** A file or folder was deleted: its references, build files and group entries go too. */
function removePath(abs) {
  const pbx = projectFileFor(abs);
  if (!pbx) return 'none';
  const p = load(pbx);
  if (!inside(abs, p.projectDir)) return 'none';
  const tree = resolveTree(p);
  const gone = new Set();
  for (const [id, f] of tree.paths) {
    const o = p.objects.get(id);
    if (o.isa === 'PBXFileSystemSynchronizedRootGroup') continue;
    if (inside(f, abs) && (o.isa === 'PBXFileReference' || o.isa === 'PBXGroup' || o.isa === 'PBXVariantGroup')) gone.add(id);
  }
  // a group with no path of its own resolves to its parent's folder: only take it when everything in it goes
  for (const id of [...gone]) { if (p.objects.get(id).isa !== 'PBXFileReference' && !str(p.objects.get(id).dict, 'path')) gone.delete(id); }
  if (!gone.size) return 'none';
  for (const o of p.objects.values()) if (o.isa === 'PBXBuildFile' && gone.has(str(o.dict, 'fileRef'))) gone.add(o.id);
  const edits = [];
  for (const id of gone) { const e = p.objects.get(id).entry; edits.push([lineStart(p.text, e.start), lineEnd(p.text, e.end - 1), '']); }
  for (const o of p.objects.values()) {
    if (gone.has(o.id)) continue;
    for (const e of o.dict.entries) {
      if (e.value.type !== 'array') continue;
      for (const it of e.value.items) if (it.type === 'str' && gone.has(it.value)) {
        const ls = lineStart(p.text, it.start);
        const own = p.text.slice(ls, it.start).trim() === '';
        if (own) edits.push([ls, lineEnd(p.text, it.end), '']);
        else { const comma = /^\s*(\/\*[^*]*\*\/)?\s*,?/.exec(p.text.slice(it.end))[0].length; edits.push([it.start, it.end + comma, '']); }
      }
    }
  }
  save(p, apply(p.text, edits));
  return 'removed';
}

/** A file or folder was renamed in place (same parent folder); a move is a remove and an add. */
function renamePath(from, to) {
  const pbx = projectFileFor(from);
  if (!pbx) return 'none';
  if (norm(path.dirname(from)) !== norm(path.dirname(to))) { removePath(from); return addPath(to); }
  const p = load(pbx);
  if (syncedDirs(p).some(d => inside(from, d) && norm(d) !== norm(from))) return 'synced';
  const tree = resolveTree(p);
  const ids = [...tree.paths].filter(([id, f]) => norm(f) === norm(from) && str(p.objects.get(id).dict, 'path')).map(([id]) => id);
  if (!ids.length) return addPath(to);
  const oldName = path.basename(from), newName = path.basename(to);
  const edits = [];
  for (const id of ids) {
    const o = p.objects.get(id);
    const pv = field(o.dict, 'path');
    if (pv && pv.type === 'str') {
      const parts = pv.value.split('/');
      if (parts[parts.length - 1] === oldName) { parts[parts.length - 1] = newName; edits.push([pv.start, pv.end, q(parts.join('/'))]); }
    }
    const nv = field(o.dict, 'name');
    if (nv && nv.type === 'str' && nv.value === oldName) edits.push([nv.start, nv.end, q(newName)]);
  }
  let text = apply(p.text, edits);
  // the /* comments */ Xcode writes next to every reference
  for (const id of ids) {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(${id} /\\* )${esc(oldName)}( in (?:Sources|Resources))?( \\*/)`, 'g'), `$1${newName}$2$3`);
  }
  for (const o of p.objects.values()) if (o.isa === 'PBXBuildFile' && ids.includes(str(o.dict, 'fileRef'))) {
    text = text.replace(new RegExp(`(${o.id} /\\* )${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( in (?:Sources|Resources) \\*/)`, 'g'), `$1${newName}$2`);
  }
  save(p, text);
  return 'renamed';
}

/** Writes WinSwift's project editor settings into every build configuration of the app target. */
function writeSettings(root, patch) {
  const pbx = projectFile(root);
  if (!pbx) return false;
  const want = [];
  for (const [k, key] of Object.entries(SETTING_KEYS)) if (patch[k] != null) want.push([key, String(patch[k])]);
  if (patch.info) {
    const now = readSettings(root)?.info || {};
    for (const [k, v] of Object.entries(patch.info)) if (INFO_KEYS.has(k)) want.push([`INFOPLIST_KEY_${k}`, v == null ? null : String(v)]);
    for (const k of Object.keys(now)) if (!(k in patch.info)) want.push([`INFOPLIST_KEY_${k}`, null]);
  }
  if (!want.length) return false;
  let p = load(pbx);
  const t = appTarget(p);
  if (!t) return false;
  const edits = [];
  for (const c of configs(p, t)) {
    const bs = field(c.dict, 'buildSettings');
    if (!bs || bs.type !== 'dict') continue;
    for (const [key, value] of want) {
      const e = bs.entries.find(x => x.key === key);
      if (e) {
        if (e.value.type !== 'str') continue;
        if (value == null || value === '') edits.push([lineStart(p.text, e.start), lineEnd(p.text, e.end - 1), '']);
        else if (e.value.value !== value) edits.push([e.value.start, e.value.end, q(value)]);
      } else if (value != null && value !== '') {
        const after = bs.entries.find(x => x.key > key);
        const at = after ? lineStart(p.text, after.start) : lineStart(p.text, bs.end - 1);
        const ind = after ? indentOf(p.text, after.start) : indentOf(p.text, bs.end - 1) + '\t';
        edits.push([at, at, `${ind}${q(key)} = ${q(value)};${p.eol}`]);
      }
    }
  }
  if (!edits.length) return false;
  save(p, apply(p.text, edits));
  return true;
}

// ------------------------------------------------------------------ new projects

function ensureBuildIgnore(root) {
  try {
    const dir = path.join(root, '.build');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, '.gitignore');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# WinSwift Studio / SwiftPM build output — never commit it\n*\n');
  } catch {}
}

const GITIGNORE = `# Xcode
xcuserdata/
*.xcuserstate
*.xcscmblueprint
*.xccheckout
DerivedData/
build/
.DS_Store

# Swift Package Manager and WinSwift Studio build output
.build/
.swiftpm/
`;

function writeGitignore(root) {
  const f = path.join(root, '.gitignore');
  if (fs.existsSync(f)) {
    const cur = fs.readFileSync(f, 'utf8');
    const missing = ['.build/', 'xcuserdata/', 'DerivedData/'].filter(l => !cur.split(/\r?\n/).some(x => x.trim() === l));
    if (missing.length) fs.appendFileSync(f, `${cur.endsWith('\n') ? '' : '\n'}\n# WinSwift Studio\n${missing.join('\n')}\n`);
    return;
  }
  fs.writeFileSync(f, GITIGNORE);
}

/**
 * Writes `<name>.xcodeproj` for a WinSwift iOS project laid out like Xcode's (sources in `<root>/<name>/`): the Xcode 16
 * iOS App template with a synchronized folder, so files added on Windows or on a Mac appear in both without project edits.
 */
function createProject(root, name, s = {}) {
  const dirName = path.basename(root);
  const group = name;
  const proj = path.join(root, `${dirName}.xcodeproj`);
  if (fs.existsSync(path.join(proj, 'project.pbxproj'))) return null;
  const ids = {};
  for (const k of ['app', 'group', 'frameworks', 'main', 'products', 'target', 'targetCfgList', 'sources', 'resources', 'project', 'projectCfgList', 'pDebug', 'pRelease', 'tDebug', 'tRelease', 'exceptions']) {
    ids[k] = crypto.randomBytes(12).toString('hex').toUpperCase();
  }
  const T = q(name);
  const hasInfoPlist = fs.existsSync(path.join(root, group, 'Info.plist'));
  const preview = fs.existsSync(path.join(root, group, 'Preview Content'));
  const info = Object.entries(s.info || {}).filter(([k, v]) => INFO_KEYS.has(k) && v);
  const common = `\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES;
\t\t\t\tCLANG_ANALYZER_NONNULL = YES;
\t\t\t\tCLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;
\t\t\t\tCLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
\t\t\t\tCLANG_WARN_BOOL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_COMMA = YES;
\t\t\t\tCLANG_WARN_CONSTANT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
\t\t\t\tCLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
\t\t\t\tCLANG_WARN_DOCUMENTATION_COMMENTS = YES;
\t\t\t\tCLANG_WARN_EMPTY_BODY = YES;
\t\t\t\tCLANG_WARN_ENUM_CONVERSION = YES;
\t\t\t\tCLANG_WARN_INFINITE_RECURSION = YES;
\t\t\t\tCLANG_WARN_INT_CONVERSION = YES;
\t\t\t\tCLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
\t\t\t\tCLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
\t\t\t\tCLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
\t\t\t\tCLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
\t\t\t\tCLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
\t\t\t\tCLANG_WARN_STRICT_PROTOTYPES = YES;
\t\t\t\tCLANG_WARN_SUSPICIOUS_MOVE = YES;
\t\t\t\tCLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
\t\t\t\tCLANG_WARN_UNREACHABLE_CODE = YES;
\t\t\t\tCLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
`;
  const warnings = `\t\t\t\tGCC_C_LANGUAGE_STANDARD = gnu17;
\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;
\t\t\t\tGCC_WARN_64_TO_32_BIT_CONVERSION = YES;
\t\t\t\tGCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
\t\t\t\tGCC_WARN_UNDECLARED_SELECTOR = YES;
\t\t\t\tGCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
\t\t\t\tGCC_WARN_UNUSED_FUNCTION = YES;
\t\t\t\tGCC_WARN_UNUSED_VARIABLE = YES;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${q(s.deploymentTarget || '18.0')};
\t\t\t\tLOCALIZATION_PREFERS_STRING_CATALOGS = YES;
`;
  const projectCfg = (debug) => `\t\t${ids[debug ? 'pDebug' : 'pRelease']} /* ${debug ? 'Debug' : 'Release'} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
${common}\t\t\t\tDEBUG_INFORMATION_FORMAT = ${debug ? 'dwarf' : '"dwarf-with-dsym"'};
${debug ? '' : '\t\t\t\tENABLE_NS_ASSERTIONS = NO;\n'}\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;
${debug ? '\t\t\t\tENABLE_TESTABILITY = YES;\n' : ''}\t\t\t\tENABLE_USER_SCRIPT_SANDBOXING = YES;
${debug ? '\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;\n' : ''}${debug ? '\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;\n\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\n\t\t\t\t\t"DEBUG=1",\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t);\n' : ''}${warnings}\t\t\t\tMTL_ENABLE_DEBUG_INFO = ${debug ? 'INCLUDE_SOURCE' : 'NO'};
\t\t\t\tMTL_FAST_MATH = YES;
${debug ? '\t\t\t\tONLY_ACTIVE_ARCH = YES;\n' : ''}\t\t\t\tSDKROOT = iphoneos;
${debug ? '\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";\n\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";\n' : '\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;\n\t\t\t\tVALIDATE_PRODUCT = YES;\n'}\t\t\t};
\t\t\tname = ${debug ? 'Debug' : 'Release'};
\t\t};
`;
  const targetSettings = [
    ['ASSETCATALOG_COMPILER_APPICON_NAME', 'AppIcon'], ['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME', 'AccentColor'],
    ['CODE_SIGN_STYLE', 'Automatic'], ['CURRENT_PROJECT_VERSION', s.build || '1'],
    ...(preview ? [['DEVELOPMENT_ASSET_PATHS', `"${group}/Preview Content"`]] : []),
    ['ENABLE_PREVIEWS', 'YES'], ['GENERATE_INFOPLIST_FILE', 'YES'],
    ...(hasInfoPlist ? [['INFOPLIST_FILE', `${group}/Info.plist`]] : []),
    ...(s.displayName && s.displayName !== name ? [['INFOPLIST_KEY_CFBundleDisplayName', s.displayName]] : []),
    ...info.map(([k, v]) => [`INFOPLIST_KEY_${k}`, v]),
    ['INFOPLIST_KEY_UIApplicationSceneManifest_Generation', 'YES'], ['INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents', 'YES'],
    ['INFOPLIST_KEY_UILaunchScreen_Generation', 'YES'],
    ['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad', 'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'],
    ['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone', 'UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'],
    ['LD_RUNPATH_SEARCH_PATHS', null], ['MARKETING_VERSION', s.version || '1.0'],
    ['PRODUCT_BUNDLE_IDENTIFIER', s.bundleId || `com.example.${dirName.replace(/[^A-Za-z0-9.-]/g, '-')}`],
    ['PRODUCT_NAME', '$(TARGET_NAME)'], ['SWIFT_EMIT_LOC_STRINGS', 'YES'], ['SWIFT_VERSION', '5.0'], ['TARGETED_DEVICE_FAMILY', '1,2'],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const targetCfg = debug => `\t\t${ids[debug ? 'tDebug' : 'tRelease']} /* ${debug ? 'Debug' : 'Release'} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
${targetSettings.map(([k, v]) => k === 'LD_RUNPATH_SEARCH_PATHS'
    ? '\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (\n\t\t\t\t\t"$(inherited)",\n\t\t\t\t\t"@executable_path/Frameworks",\n\t\t\t\t);\n'
    : `\t\t\t\t${k} = ${k === 'DEVELOPMENT_ASSET_PATHS' ? '"' + v.replace(/"/g, '\\"') + '"' : q(v)};\n`).join('')}\t\t\t};
\t\t\tname = ${debug ? 'Debug' : 'Release'};
\t\t};
`;
  const exceptions = hasInfoPlist ? `/* Begin PBXFileSystemSynchronizedBuildFileExceptionSet section */
\t\t${ids.exceptions} /* Exceptions for "${group}" folder in "${name}" target */ = {
\t\t\tisa = PBXFileSystemSynchronizedBuildFileExceptionSet;
\t\t\tmembershipExceptions = (
\t\t\t\tInfo.plist,
\t\t\t);
\t\t\ttarget = ${ids.target} /* ${name} */;
\t\t};
/* End PBXFileSystemSynchronizedBuildFileExceptionSet section */

` : '';
  const text = `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 77;
\tobjects = {

/* Begin PBXFileReference section */
\t\t${ids.app} /* ${name}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${q(name + '.app')}; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

${exceptions}/* Begin PBXFileSystemSynchronizedRootGroup section */
\t\t${ids.group} /* ${group} */ = {
\t\t\tisa = PBXFileSystemSynchronizedRootGroup;
${hasInfoPlist ? `\t\t\texceptions = (\n\t\t\t\t${ids.exceptions} /* Exceptions for "${group}" folder in "${name}" target */,\n\t\t\t);\n` : ''}\t\t\tpath = ${q(group)};
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${ids.frameworks} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${ids.main} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ids.group} /* ${group} */,
\t\t\t\t${ids.products} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${ids.products} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ids.app} /* ${name}.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${ids.target} /* ${name} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${ids.targetCfgList} /* Build configuration list for PBXNativeTarget "${name}" */;
\t\t\tbuildPhases = (
\t\t\t\t${ids.sources} /* Sources */,
\t\t\t\t${ids.frameworks} /* Frameworks */,
\t\t\t\t${ids.resources} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t${ids.group} /* ${group} */,
\t\t\t);
\t\t\tname = ${T};
\t\t\tpackageProductDependencies = (
\t\t\t);
\t\t\tproductName = ${T};
\t\t\tproductReference = ${ids.app} /* ${name}.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${ids.project} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1600;
\t\t\t\tLastUpgradeCheck = 1600;
\t\t\t\tTargetAttributes = {
\t\t\t\t\t${ids.target} = {
\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;
\t\t\t\t\t};
\t\t\t\t};
\t\t\t};
\t\t\tbuildConfigurationList = ${ids.projectCfgList} /* Build configuration list for PBXProject "${dirName}" */;
\t\t\tdevelopmentRegion = ${q(s.developmentRegion || 'en')};
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
${[...new Set(s.knownRegions || ['en', 'Base'])].map(r => `\t\t\t\t${q(r)},\n`).join('')}\t\t\t);
\t\t\tmainGroup = ${ids.main};
\t\t\tminimizedProjectReferenceProxies = 1;
\t\t\tpreferredProjectObjectVersion = 77;
\t\t\tproductRefGroup = ${ids.products} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${ids.target} /* ${name} */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${ids.resources} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${ids.sources} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
${projectCfg(true)}${projectCfg(false)}${targetCfg(true)}${targetCfg(false)}/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${ids.projectCfgList} /* Build configuration list for PBXProject "${dirName}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ids.pDebug} /* Debug */,
\t\t\t\t${ids.pRelease} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${ids.targetCfgList} /* Build configuration list for PBXNativeTarget "${name}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ids.tDebug} /* Debug */,
\t\t\t\t${ids.tRelease} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
\trootObject = ${ids.project} /* Project object */;
}
`;
  load(path.join(proj, 'project.pbxproj'), text);   // must parse
  fs.mkdirSync(path.join(proj, 'project.xcworkspace'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'project.pbxproj'), text);
  fs.writeFileSync(path.join(proj, 'project.xcworkspace', 'contents.xcworkspacedata'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace\n   version = "1.0">\n   <FileRef\n      location = "self:">\n   </FileRef>\n</Workspace>\n');
  writeGitignore(root);
  ensureBuildIgnore(root);
  return proj;
}

module.exports = { parse, load, projectFile, projectFileFor, appSources, readSettings, writeSettings, addPath, removePath, renamePath, createProject, ensureBuildIgnore, writeGitignore, q };
