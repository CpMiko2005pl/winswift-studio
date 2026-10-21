'use strict';
// Xcode's project-level editors: the project/target editor (Info, Build Settings, Localizations),
// the asset catalog editor, "Localize…", File ▸ New ▸ File from Template and Edit Scheme.

const LANGUAGES = [
  ['ar', 'Arabic'], ['zh-Hans', 'Chinese, Simplified'], ['zh-Hant', 'Chinese, Traditional'], ['hr', 'Croatian'], ['cs', 'Czech'], ['da', 'Danish'],
  ['nl', 'Dutch'], ['en', 'English'], ['fi', 'Finnish'], ['fr', 'French'], ['de', 'German'], ['el', 'Greek'], ['he', 'Hebrew'], ['hu', 'Hungarian'],
  ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['lt', 'Lithuanian'], ['nb', 'Norwegian Bokmål'], ['pl', 'Polish'], ['pt-BR', 'Portuguese (Brazil)'],
  ['pt-PT', 'Portuguese (Portugal)'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sk', 'Slovak'], ['es', 'Spanish'], ['sv', 'Swedish'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
];
const langName = id => id === 'Base' || id === 'base' ? 'Base' : (LANGUAGES.find(([k]) => k.toLowerCase() === String(id).toLowerCase()) || [id, id])[1];

// Info.plist keys under the names Xcode shows
const INFO_KEYS = [
  ['NSLocationWhenInUseUsageDescription', 'Privacy - Location When In Use Usage Description'],
  ['NSLocationAlwaysAndWhenInUseUsageDescription', 'Privacy - Location Always and When In Use Usage Description'],
  ['NSLocationAlwaysUsageDescription', 'Privacy - Location Always Usage Description'],
  ['NSLocationTemporaryUsageDescriptionDictionary', 'Privacy - Location Temporary Usage Description Dictionary'],
  ['NSCameraUsageDescription', 'Privacy - Camera Usage Description'],
  ['NSMicrophoneUsageDescription', 'Privacy - Microphone Usage Description'],
  ['NSPhotoLibraryUsageDescription', 'Privacy - Photo Library Usage Description'],
  ['NSPhotoLibraryAddUsageDescription', 'Privacy - Photo Library Additions Usage Description'],
  ['NSContactsUsageDescription', 'Privacy - Contacts Usage Description'],
  ['NSCalendarsUsageDescription', 'Privacy - Calendars Usage Description'],
  ['NSRemindersUsageDescription', 'Privacy - Reminders Usage Description'],
  ['NSMotionUsageDescription', 'Privacy - Motion Usage Description'],
  ['NSBluetoothAlwaysUsageDescription', 'Privacy - Bluetooth Always Usage Description'],
  ['NSFaceIDUsageDescription', 'Privacy - Face ID Usage Description'],
  ['NSSpeechRecognitionUsageDescription', 'Privacy - Speech Recognition Usage Description'],
  ['NSHealthShareUsageDescription', 'Privacy - Health Share Usage Description'],
  ['NSHealthUpdateUsageDescription', 'Privacy - Health Update Usage Description'],
  ['NSUserTrackingUsageDescription', 'Privacy - Tracking Usage Description'],
  ['NSLocalNetworkUsageDescription', 'Privacy - Local Network Usage Description'],
  ['NSAppleMusicUsageDescription', 'Privacy - Media Library Usage Description'],
  ['CFBundleDisplayName', 'Bundle display name'],
  ['CFBundleDevelopmentRegion', 'Localization native development region'],
  ['UIRequiresFullScreen', 'Requires full screen'],
  ['UIStatusBarStyle', 'Status bar style'],
  ['ITSAppUsesNonExemptEncryption', 'App Uses Non-Exempt Encryption'],
];
const infoLabel = k => (INFO_KEYS.find(([key]) => key === k) || [k, k])[1];

async function projectSettings() { return S.root ? api.settings(S.root) : {}; }
async function saveSettings(patch) { if (S.root) await api.setSettings(S.root, patch); }

// ======================================================================== custom editor documents

function openCustomDoc(key, title, icon, render, extra = {}) {
  let doc = S.docs.get(key);
  if (!doc) {
    doc = { key, kind: 'custom', title, icon, render, ...extra };
    S.docs.set(key, doc);
  }
  activate(key);
  return doc;
}

function rerenderCustom() {
  const doc = activeDoc();
  if (doc && doc.render) return Promise.resolve(doc.render($('#custom-editor'), doc));
  return Promise.resolve();
}

// ======================================================================== project & target editor

function openProjectEditor() {
  if (!S.root) return;
  openCustomDoc('swiftcode-project:' + S.root, S.name, 'project', renderProjectEditor, { pane: 'target', tab: 'General' });
}

async function renderProjectEditor(host, doc) {
  const s = await projectSettings();
  const loc = await api.localizations(S.root);
  const name = S.name;
  const tabs = doc.pane === 'project' ? ['Info', 'Build Settings', 'Package Dependencies'] : ['General', 'Signing & Capabilities', 'Resource Tags', 'Info', 'Build Settings', 'Build Phases', 'Build Rules'];
  if (!tabs.includes(doc.tab)) doc.tab = tabs[0];
  host.innerHTML = `<div class="pe">
    <div class="pe-side">
      <div class="pe-h">PROJECT</div>
      <div class="pe-item ${doc.pane === 'project' ? 'sel' : ''}" data-pane="project"><span class="badge">${FILE_BADGES.project}</span>${esc(name)}</div>
      <div class="pe-h">TARGETS</div>
      <div class="pe-item ${doc.pane === 'target' ? 'sel' : ''}" data-pane="target"><span class="badge">${FILE_BADGES.app}</span>${esc(name)}</div>
    </div>
    <div class="pe-main">
      <div class="pe-tabs">${tabs.map(t => `<span class="${t === doc.tab ? 'sel' : ''}" data-tab="${t}">${t}</span>`).join('')}</div>
      <div class="pe-content" id="pe-content"></div>
    </div></div>`;
  host.querySelectorAll('[data-pane]').forEach(el => el.onclick = () => { doc.pane = el.dataset.pane; rerenderCustom(); });
  host.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { doc.tab = el.dataset.tab; rerenderCustom(); });
  const c = host.querySelector('#pe-content');
  const key = `${doc.pane}:${doc.tab}`;
  if (key === 'project:Info') renderProjectInfo(c, s, loc);
  else if (key === 'target:General') renderTargetGeneral(c, s);
  else if (key === 'target:Info') renderTargetInfo(c, s);
  else if (doc.tab === 'Build Settings') renderBuildSettings(c, s, doc);
  else if (key === 'target:Build Phases') renderBuildPhases(c);
  else if (key === 'target:Signing & Capabilities') {
    c.innerHTML = `<div class="pe-sec"><h4>Signing</h4><div class="pe-grid">
      <label>Automatically manage signing</label><div><input type="checkbox" checked disabled></div>
      <label>Team</label><div><select disabled><option>None</option></select></div>
      <label>Bundle Identifier</label><div class="dim">${esc(s.bundleId || '')}</div>
      <label>Signing Certificate</label><div class="dim">Sign to Run Locally</div></div>
      <p class="pe-note">The WinSwift Studio simulator runs apps without signing. Running on a real iPhone needs a Mac with Xcode and an Apple ID.</p></div>`;
  } else {
    c.innerHTML = `<div class="pe-empty">${esc(doc.tab)}</div>`;
  }
}

function renderProjectInfo(c, s, loc) {
  const dev = loc.developmentRegion;
  const langs = Object.keys(loc.langs).filter(l => l !== 'Base' || loc.useBase);
  const ordered = [...(langs.includes('Base') ? ['Base'] : []), ...langs.filter(l => l !== 'Base').sort((a, b) => (a === dev ? -1 : b === dev ? 1 : langName(a).localeCompare(langName(b))))];
  c.innerHTML = `
    <div class="pe-sec"><h4>Deployment Target</h4><div class="pe-grid"><label>iOS Deployment Target</label><div><select id="pe-dt">${['16.0', '17.0', '18.0'].map(v => `<option ${v === (s.deploymentTarget || '18.0') ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div></div>
    <div class="pe-sec"><h4>Configurations</h4>
      <table class="pe-table"><tr><th>Name</th><th>Based on Configuration File</th></tr>
        <tr><td>› Debug</td><td class="dim">No Configurations Set</td></tr><tr><td>› Release</td><td class="dim">No Configurations Set</td></tr></table>
      <div class="pe-grid" style="margin-top:8px"><label>Use</label><div><select disabled><option>Release</option></select> <span class="dim">for command-line builds</span></div></div></div>
    <div class="pe-sec"><h4>Localizations</h4>
      <table class="pe-table" id="pe-loc"><tr><th>Localization</th><th>Resources</th></tr>
      ${ordered.map(l => `<tr data-lang="${esc(l)}" class="${l === c._selLang ? 'sel' : ''}"><td>${esc(langName(l))}${l === dev ? ' <span class="dim">— Development Language</span>' : ''}</td><td class="dim">${loc.langs[l].length} File${loc.langs[l].length === 1 ? '' : 's'} Localized</td></tr>`).join('')}
      </table>
      <div class="pe-pm"><button id="pe-add" title="Add a localization">+</button><button id="pe-rem" title="Remove the selected localization">−</button></div>
      <label class="pe-check"><input type="checkbox" id="pe-base" ${loc.useBase ? 'checked' : ''}> Use Base Internationalization</label>
    </div>`;
  let sel = null;
  c.querySelectorAll('#pe-loc tr[data-lang]').forEach(tr => tr.onclick = () => {
    c.querySelectorAll('#pe-loc tr').forEach(x => x.classList.remove('sel'));
    tr.classList.add('sel'); sel = tr.dataset.lang;
  });
  c.querySelector('#pe-dt').onchange = e => saveSettings({ deploymentTarget: e.target.value });
  c.querySelector('#pe-base').onchange = e => saveSettings({ useBase: e.target.checked }).then(rerenderCustom);
  c.querySelector('#pe-add').onclick = async e => {
    const r = e.currentTarget.getBoundingClientRect();
    const items = LANGUAGES.filter(([id]) => !langs.some(l => l.toLowerCase() === id.toLowerCase())).map(([id, n]) => ({ id, label: `${n} (${id})` }));
    const id = await api.popupMenu(items, r.left, r.bottom);
    if (id) showAddLanguageSheet(id, loc);
  };
  c.querySelector('#pe-rem').onclick = async () => {
    if (!sel || sel === dev || sel === 'Base') { toast(sel ? 'The development language can’t be removed' : 'Select a localization'); return; }
    const r = await api.confirm(`Do you want to remove the ${langName(sel)} localization?`, `All ${langName(sel)} files (${sel}.lproj folders) will be moved to the Recycle Bin.`, ['Remove', 'Cancel']);
    if (r !== 0) return;
    await api.removeLanguage(S.root, sel);
    await loadTree(); renderTree(); rerenderCustom();
  };
}

/** Xcode's "Choose files and reference language to create <lang> localization" sheet. */
function showAddLanguageSheet(lang, loc) {
  const dev = loc.developmentRegion;
  // the files to translate: those of the development language (or Base)
  const source = [...(loc.langs.Base || []), ...(loc.langs[dev] || [])];
  const unique = new Map();
  for (const f of source) if (!unique.has(basename(f) + dirname(dirname(f)))) unique.set(basename(f) + dirname(dirname(f)), f);
  const files = [...unique.values()];
  const ov = document.createElement('div');
  ov.className = 'overlay show';
  ov.innerHTML = `<div class="sheet small"><div class="sheet-title">Choose files and reference language to create ${esc(langName(lang))} localization:</div>
    <table class="pe-table">${files.length ? files.map((f, i) => `<tr><td><label><input type="checkbox" data-i="${i}" checked> ${esc(basename(f))}</label></td><td class="dim">${esc(langName(basename(dirname(f)).replace(/\.lproj$/i, '')))}</td></tr>`).join('') : '<tr><td class="dim">No localized files yet — localize a file with the File Inspector’s “Localize…” button.</td></tr>'}</table>
    <div class="sheet-buttons"><button class="btn" data-x="cancel">Cancel</button><div class="spacer"></div><button class="btn primary" data-x="ok">Finish</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-x=cancel]').onclick = () => ov.remove();
  ov.querySelector('[data-x=ok]').onclick = async () => {
    const chosen = [...ov.querySelectorAll('input[data-i]:checked')].map(i => files[+i.dataset.i]);
    ov.remove();
    await api.addLanguage(S.root, lang, chosen);
    await loadTree(); renderTree(); rerenderCustom();
    toast(`${langName(lang)} localization added`);
  };
}

function renderTargetGeneral(c, s) {
  c.innerHTML = `
    <div class="pe-sec"><h4>Supported Destinations</h4><table class="pe-table"><tr><th>Destination</th><th>SDK</th></tr><tr><td>📱 iPhone</td><td class="dim">iOS</td></tr></table></div>
    <div class="pe-sec"><h4>Minimum Deployments</h4><div class="pe-grid"><label>iOS</label><div class="dim">${esc(s.deploymentTarget || '18.0')}</div></div></div>
    <div class="pe-sec"><h4>Identity</h4><div class="pe-grid">
      <label>Display Name</label><input data-k="displayName" value="${esc(s.displayName || S.name)}">
      <label>Bundle Identifier</label><input data-k="bundleId" value="${esc(s.bundleId || '')}">
      <label>Version</label><input data-k="version" value="${esc(s.version || '1.0')}">
      <label>Build</label><input data-k="build" value="${esc(s.build || '1')}">
    </div></div>
    <div class="pe-sec"><h4>App Icons and Launch Screen</h4><div class="pe-grid"><label>App Icon</label><div class="dim">AppIcon</div><label>Launch Screen File</label><div class="dim">—</div></div></div>`;
  c.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => saveSettings({ [i.dataset.k]: i.value }));
}

function renderTargetInfo(c, s) {
  const info = s.info || {};
  const defaults = [
    ['Bundle display name', 'String', s.displayName || S.name], ['Bundle identifier', 'String', '$(PRODUCT_BUNDLE_IDENTIFIER)'], ['Bundle name', 'String', '$(PRODUCT_NAME)'],
    ['Bundle version', 'String', '$(CURRENT_PROJECT_VERSION)'], ['Bundle version string (short)', 'String', '$(MARKETING_VERSION)'],
    ['Executable file', 'String', '$(EXECUTABLE_NAME)'], ['InfoDictionary version', 'String', '6.0'], ['Localization native development region', 'String', s.developmentRegion || 'en'],
    ['Application Scene Manifest', 'Dictionary', '(1 item)'], ['Launch Screen', 'Dictionary', '(0 items)'], ['Supported interface orientations', 'Array', '(3 items)'],
  ];
  c.innerHTML = `<div class="pe-sec"><h4>Custom iOS Target Properties</h4>
    <table class="pe-table kv" id="pe-info"><tr><th>Key</th><th>Type</th><th>Value</th></tr>
    ${Object.entries(info).map(([k, v]) => `<tr data-key="${esc(k)}" class="user"><td>${esc(infoLabel(k))}</td><td class="dim">String</td><td><input data-key="${esc(k)}" value="${esc(v)}" spellcheck="false"></td></tr>`).join('')}
    ${defaults.map(([k, t, v]) => `<tr><td>${esc(k)}</td><td class="dim">${t}</td><td class="dim">${esc(v)}</td></tr>`).join('')}
    </table>
    <div class="pe-pm"><button id="pe-iadd" title="Add a row">+</button><button id="pe-idel" title="Delete the selected row">−</button></div>
    <p class="pe-note">Privacy keys (e.g. “Privacy - Location When In Use Usage Description”) must be set before the app can ask for that permission.</p></div>`;
  let sel = null;
  c.querySelectorAll('tr.user').forEach(tr => tr.onclick = () => { c.querySelectorAll('tr').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); sel = tr.dataset.key; });
  c.querySelectorAll('input[data-key]').forEach(i => i.onchange = () => saveSettings({ info: { ...info, [i.dataset.key]: i.value } }));
  c.querySelector('#pe-iadd').onclick = async e => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = await api.popupMenu(INFO_KEYS.filter(([k]) => !(k in info)).map(([k, l]) => ({ id: k, label: l })), r.left, r.bottom);
    if (!id) return;
    await saveSettings({ info: { ...info, [id]: '' } });
    await rerenderCustom();
    setTimeout(() => { const i = $(`#pe-info input[data-key="${id}"]`); if (i) i.focus(); }, 50);
  };
  c.querySelector('#pe-idel').onclick = async () => {
    if (!sel) { toast('Select a row you added'); return; }
    const next = { ...info }; delete next[sel];
    await saveSettings({ info: next }); rerenderCustom();
  };
}

function renderBuildSettings(c, s, doc) {
  const info = s.info || {};
  const q = (doc.filter || '').toLowerCase();
  const sections = [
    ['Architectures', [['Base SDK', 'iOS'], ['Supported Platforms', 'iOS']]],
    ['Deployment', [['iOS Deployment Target', s.deploymentTarget || '18.0'], ['Targeted Device Families', 'iPhone']]],
    ['Packaging', [['Product Name', S.name], ['Product Bundle Identifier', s.bundleId || ''], ['Marketing Version', s.version || '1.0'], ['Current Project Version', s.build || '1']]],
    ['Localization', [['Localization Prefers String Catalogs', 'Yes'], ['Use Compiler to Extract Swift Strings', 'Yes']]],
    ['Swift Compiler - Language', [['Swift Language Version', 'Swift 5'], ['Enable Bare Slash Regex Literals', 'Yes']]],
  ];
  const rows = (list) => list.filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q))
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="dim">${esc(v)}</td></tr>`).join('');
  const infoRows = INFO_KEYS.filter(([k, l]) => !q || l.toLowerCase().includes(q) || k.toLowerCase().includes(q))
    .map(([k, l]) => `<tr class="${info[k] ? 'set' : ''}"><td>${esc(l)}</td><td><input data-key="${esc(k)}" value="${esc(info[k] || '')}" spellcheck="false"></td></tr>`).join('');
  c.innerHTML = `<div class="pe-bs-bar"><span class="seg"><span class="sel">All</span><span>Combined</span></span><div class="filter-box"><input id="pe-filter" placeholder="Search" value="${esc(doc.filter || '')}" spellcheck="false"></div></div>
    ${sections.map(([h, list]) => { const r = rows(list); return r ? `<div class="pe-sec"><h4>${h}</h4><table class="pe-table bs"><tr><th>Setting</th><th>${esc(S.name)}</th></tr>${r}</table></div>` : ''; }).join('')}
    ${doc.pane === 'target' && infoRows ? `<div class="pe-sec"><h4>Info.plist Values</h4><table class="pe-table bs" id="pe-plist"><tr><th>Setting</th><th>${esc(S.name)}</th></tr>${infoRows}</table></div>` : ''}`;
  const f = c.querySelector('#pe-filter');
  f.oninput = debounce(() => { doc.filter = f.value; rerenderCustom().then(() => { const g = $('#pe-filter'); if (g) { g.focus(); g.setSelectionRange(g.value.length, g.value.length); } }); }, 250);
  c.querySelectorAll('#pe-plist input').forEach(i => i.onchange = async () => {
    const cur = (await projectSettings()).info || {};
    const next = { ...cur };
    if (i.value) next[i.dataset.key] = i.value; else delete next[i.dataset.key];
    await saveSettings({ info: next });
    i.closest('tr').classList.toggle('set', !!i.value);
  });
}

function renderBuildPhases(c) {
  const files = flattenFiles(S.tree);
  const sources = files.filter(f => /\.swift$/i.test(f.name));
  const resources = files.filter(f => /\.(strings|stringsdict|xcstrings|png|jpe?g|json|plist|ttf|otf)$/i.test(f.name) && !/\.xcassets[\\/]/i.test(f.path));
  const assets = (S.tree ? [S.tree] : []).flatMap(function find(n) { return n.type === 'dir' ? (/\.xcassets$/i.test(n.name) ? [n] : n.children.flatMap(find)) : []; });
  const list = arr => arr.map(f => `<tr><td>${fileBadge(f.name, f.type)} ${esc(f.path.slice(S.root.length + 1))}</td></tr>`).join('');
  c.innerHTML = `<div class="pe-sec"><h4>› Compile Sources (${sources.length} items)</h4><table class="pe-table">${list(sources)}</table></div>
    <div class="pe-sec"><h4>› Copy Bundle Resources (${resources.length + assets.length} items)</h4><table class="pe-table">${list([...assets, ...resources])}</table></div>`;
}

// ======================================================================== asset catalog editor

function openAssetsEditor(dir) {
  openCustomDoc('swiftcode-assets:' + dir, basename(dir).replace(/\.xcassets$/i, ''), 'assets', renderAssetsEditor, { dir, sel: null });
}

async function renderAssetsEditor(host, doc) {
  const list = await api.assets(doc.dir);
  const flat = [];
  (function walk(items, depth) { for (const a of items) { flat.push({ ...a, depth }); if (a.kind === 'folder') walk(a.children, depth + 1); } })(list, 0);
  if (!doc.sel || !flat.some(a => a.path === doc.sel)) doc.sel = (flat.find(a => a.kind === 'image') || flat[0] || {}).path || null;
  const cur = flat.find(a => a.path === doc.sel);
  const icon = a => a.kind === 'color' ? `<span class="ae-sw" style="background:${colorCss(a.colors[0])}"></span>` : a.kind === 'appicon' ? '<span class="ae-ico app"></span>' : a.kind === 'folder' ? FILE_BADGES.folder : '<span class="ae-ico img"></span>';
  host.innerHTML = `<div class="ae">
    <div class="ae-side"><div class="ae-list">${flat.map(a => `<div class="ae-row ${a.path === doc.sel ? 'sel' : ''}" data-p="${esc(a.path)}" style="padding-left:${8 + a.depth * 14}px">${icon(a)}<span>${esc(a.name)}</span></div>`).join('') || '<div class="pe-empty">No Assets</div>'}</div>
      <div class="ae-foot"><button id="ae-add" title="Add">+</button><button id="ae-del" title="Remove">−</button></div></div>
    <div class="ae-main" id="ae-main"></div></div>`;
  host.querySelectorAll('.ae-row').forEach(r => {
    r.onclick = () => { doc.sel = r.dataset.p; rerenderCustom(); };
    r.ondblclick = async () => {
      const a = flat.find(x => x.path === r.dataset.p);
      const name = await promptSheet('Rename asset', a.name, 'Rename');
      if (!name || name === a.name) return;
      try { doc.sel = await api.renameAsset(a.path, name); rerenderCustom(); } catch (e) { toast(cleanErr(e)); }
    };
  });
  host.querySelector('#ae-add').onclick = async e => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = await api.popupMenu([{ id: 'import', label: 'Import…' }, { type: 'separator' }, { id: 'image', label: 'Image Set' }, { id: 'color', label: 'Color Set' }], r.left, r.top - 90);
    if (id === 'import') { const files = await api.openImagesDialog(); if (files.length) { const sets = await api.importAssets(doc.dir, files); doc.sel = sets[0]; } }
    if (id === 'image') doc.sel = await api.newImageSet(doc.dir, 'Image');
    if (id === 'color') doc.sel = await api.newColorSet(doc.dir, 'Color');
    rerenderCustom();
  };
  host.querySelector('#ae-del').onclick = async () => {
    if (!cur) return;
    const r = await api.confirm(`Remove “${cur.name}” from the asset catalog?`, 'It will be moved to the Recycle Bin.', ['Remove', 'Cancel']);
    if (r === 0) { await api.trash(cur.path); doc.sel = null; rerenderCustom(); }
  };
  // drop images anywhere on the editor to add them
  host.ondragover = e => { e.preventDefault(); host.classList.add('drop'); };
  host.ondragleave = () => host.classList.remove('drop');
  host.ondrop = async e => {
    e.preventDefault(); host.classList.remove('drop');
    const files = [...e.dataTransfer.files].map(f => api.pathForFile(f)).filter(Boolean);
    const slot = e.target.closest && e.target.closest('[data-scale]');
    if (slot && cur && files[0]) await api.setAssetImage(cur.path, slot.dataset.scale, files[0]);
    else if (files.length) { const sets = await api.importAssets(doc.dir, files); doc.sel = sets[0]; }
    rerenderCustom();
  };
  const main = host.querySelector('#ae-main');
  if (!cur) { main.innerHTML = '<div class="pe-empty">Drag images here from Explorer, or press + to import</div>'; return; }
  if (cur.kind === 'image' || cur.kind === 'appicon') {
    const slots = cur.kind === 'appicon' ? (cur.images.length ? cur.images : [{ scale: '1x', size: '1024x1024' }]) : ['1x', '2x', '3x'].map(sc => cur.images.find(i => i.scale === sc) || { scale: sc });
    main.innerHTML = `<div class="ae-title">${esc(cur.name)}</div>
      <div class="ae-slots">${slots.map(i => `<div class="ae-slot" data-scale="${esc(i.scale || '1x')}">
        <div class="ae-well">${i.path ? `<img src="${esc(fileUrl(i.path))}">` : ''}</div><div class="ae-cap">${cur.kind === 'appicon' ? esc(i.size || '1024pt') : esc(i.scale)}</div></div>`).join('')}</div>
      <div class="ae-hint">${cur.kind === 'image' ? `Use it in code with <code>Image("${esc(cur.name)}")</code>. Drop an image on a slot to replace it; right-click a slot to clear it.` : 'The app icon shown on the simulator’s home screen.'}</div>`;
    main.querySelectorAll('.ae-slot').forEach(s => s.oncontextmenu = async e => {
      const id = await api.popupMenu([{ id: 'set', label: 'Choose Image…' }, { id: 'clear', label: 'Remove Image' }], e.clientX, e.clientY);
      if (id === 'clear') { await api.setAssetImage(cur.path, s.dataset.scale, null); rerenderCustom(); }
      if (id === 'set') { const f = await api.openImagesDialog(); if (f[0]) { await api.setAssetImage(cur.path, s.dataset.scale, f[0]); rerenderCustom(); } }
    });
  } else if (cur.kind === 'color') {
    const any = cur.colors.find(c => !(c.appearances || []).some(a => a.value === 'dark')) || cur.colors[0];
    const dark = cur.colors.find(c => (c.appearances || []).some(a => a.value === 'dark'));
    main.innerHTML = `<div class="ae-title">${esc(cur.name)}</div>
      <div class="ae-slots">${[['any', 'Any Appearance', any], ['dark', 'Dark', dark]].map(([k, label, c]) => `<div class="ae-slot">
        <label class="ae-well color" style="background:${colorCss(c)}"><input type="color" data-ap="${k}" value="${colorHex(c)}"></label><div class="ae-cap">${label}</div></div>`).join('')}</div>
      <div class="ae-hint">Use it in code with <code>Color("${esc(cur.name)}")</code>. Click a swatch to pick the color.</div>`;
    main.querySelectorAll('input[type=color]').forEach(i => i.onchange = async () => {
      const v = i.value;
      await api.setColor(cur.path, { r: parseInt(v.slice(1, 3), 16) / 255, g: parseInt(v.slice(3, 5), 16) / 255, b: parseInt(v.slice(5, 7), 16) / 255, a: 1 }, i.dataset.ap);
      rerenderCustom();
    });
  } else {
    main.innerHTML = `<div class="pe-empty">${esc(cur.name)}</div>`;
  }
}

function colorComp(c) {
  const comps = c && c.color && c.color.components;
  if (!comps) return null;
  const v = k => { const s = String(comps[k] ?? '0'); const n = s.startsWith('0x') ? parseInt(s, 16) / 255 : parseFloat(s); return n > 1 ? n / 255 : n; };
  return { r: v('red'), g: v('green'), b: v('blue'), a: comps.alpha != null ? v('alpha') : 1 };
}
function colorCss(c) { const x = colorComp(c); return x ? `rgba(${Math.round(x.r * 255)},${Math.round(x.g * 255)},${Math.round(x.b * 255)},${x.a})` : 'repeating-conic-gradient(#666 0 25%, #444 0 50%) 0 0/10px 10px'; }
function colorHex(c) { const x = colorComp(c) || { r: 1, g: 1, b: 1 }; return '#' + [x.r, x.g, x.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); }
function fileUrl(p) { return 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:') + '?t=' + Date.now(); }
const cleanErr = e => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ======================================================================== image viewer

function openImageDoc(p) {
  openCustomDoc('swiftcode-image:' + p, basename(p), 'image', host => {
    host.innerHTML = `<div class="iv"><img src="${esc(fileUrl(p))}"><div class="iv-info" id="iv-info"></div></div>`;
    const img = host.querySelector('img');
    img.onload = () => { host.querySelector('#iv-info').textContent = `${img.naturalWidth} × ${img.naturalHeight} pixels`; };
  }, { path: p });
}

// ======================================================================== File Inspector: Localization

const LOCALIZABLE = /\.(strings|stringsdict|png|jpe?g|gif|webp|svg|pdf|json|txt|rtf|html|plist)$/i;

async function renderLocalizationSection(host, doc) {
  if (!S.root || !host) return;
  const file = doc.path;
  const parent = basename(dirname(file));
  const inLproj = /\.lproj$/i.test(parent);
  if (!inLproj && !LOCALIZABLE.test(file)) { host.remove(); return; }
  const loc = await api.localizations(S.root);
  if (!host.isConnected) return;
  if (!inLproj) {
    host.innerHTML = `<h3>Localization</h3><button class="btn insp-btn" id="insp-localize">Localize…</button>`;
    host.querySelector('#insp-localize').onclick = () => showLocalizeSheet(file, loc);
    return;
  }
  const group = dirname(dirname(file));
  const name = basename(file);
  const dev = loc.developmentRegion;
  const langs = Object.keys(loc.langs).filter(l => l !== 'Base' || loc.useBase)
    .sort((a, b) => (a === 'Base' ? -1 : b === 'Base' ? 1 : a === dev ? -1 : b === dev ? 1 : langName(a).localeCompare(langName(b))));
  const has = l => loc.langs[l].some(f => basename(f) === name && norm(dirname(dirname(f))) === norm(group));
  host.innerHTML = `<h3>Localization</h3>${langs.map(l => `<label class="insp-check"><input type="checkbox" data-l="${esc(l)}" ${has(l) ? 'checked' : ''}> ${esc(langName(l))}</label>`).join('')}`;
  host.querySelectorAll('input[data-l]').forEach(i => i.onchange = async () => {
    const l = i.dataset.l;
    if (i.checked) {
      await api.copyLocalization(S.root, file, l);
      toast(`Created ${l}.lproj/${name}`);
    } else {
      const target = `${group}\\${l}.lproj\\${name}`;
      const r = await api.confirm(`Remove the ${langName(l)} localization of “${name}”?`, 'The file will be moved to the Recycle Bin.', ['Remove', 'Cancel']);
      if (r !== 0) { i.checked = true; return; }
      if (norm(target) === norm(file)) { toast('Select another localization of the file to remove this one'); i.checked = true; return; }
      await api.trash(target);
    }
    await loadTree(); renderTree();
  });
}

function showLocalizeSheet(file, loc) {
  const dev = loc.developmentRegion;
  const langs = [...new Set(['Base', dev, ...Object.keys(loc.langs)])].filter(l => l !== 'Base' || loc.useBase);
  const ov = document.createElement('div');
  ov.className = 'overlay show';
  ov.innerHTML = `<div class="sheet small"><div class="alert-icon"></div><div class="sheet-title">Do you want to localize the file?</div>
    <p class="sheet-text">The file will be moved into a folder for the language you select (an .lproj folder), so you can add more languages for it.</p>
    <div class="form" style="grid-template-columns:120px 1fr;padding:0"><label>Localize in:</label><select id="loc-lang">${langs.map(l => `<option value="${esc(l)}" ${l === dev ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></div>
    <div class="sheet-buttons"><button class="btn" data-x="cancel">Cancel</button><div class="spacer"></div><button class="btn primary" data-x="ok">Localize</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-x=cancel]').onclick = () => ov.remove();
  ov.querySelector('[data-x=ok]').onclick = async () => {
    const lang = ov.querySelector('#loc-lang').value;
    ov.remove();
    try {
      const doc = S.docs.get(docKey(file));
      if (doc && isDirty(doc)) await saveDoc(doc);
      const to = await api.localize(S.root, file, lang);
      // reopen the moved file under its new path
      const tabIdx = doc ? S.tabs.indexOf(doc.key) : -1;
      if (doc) disposeDoc(doc);
      const nd = await ensureDoc(to);
      if (nd && tabIdx >= 0) S.tabs[tabIdx] = nd.key;
      await loadTree();
      if (nd) { S.active = null; activate(nd.key); }
      renderTree();
    } catch (e) { toast(cleanErr(e), 3500); }
  };
}

// ======================================================================== File ▸ New ▸ File from Template

const FILE_TEMPLATES = {
  'Source': [
    { id: 'swift', name: 'Swift File', ext: 'swift', icon: 'swift', def: 'File' },
    { id: 'swiftui', name: 'SwiftUI View', ext: 'swift', icon: 'swiftui', def: 'ContentView2' },
  ],
  'Resource': [
    { id: 'xcstrings', name: 'String Catalog', ext: 'xcstrings', icon: 'catalog', def: 'Localizable' },
    { id: 'strings', name: 'Strings File (Legacy)', ext: 'strings', icon: 'strings', def: 'Localizable' },
    { id: 'stringsdict', name: 'Stringsdict File (Legacy)', ext: 'stringsdict', icon: 'strings', def: 'Localizable' },
    { id: 'plist', name: 'Property List', ext: 'plist', icon: 'plist', def: 'PropertyList' },
    { id: 'assets', name: 'Asset Catalog', ext: 'xcassets', icon: 'assets', def: 'Media' },
  ],
  'Other': [
    { id: 'empty', name: 'Empty', ext: '', icon: 'empty', def: 'Untitled' },
  ],
};

function showFileTemplates() {
  if (!S.root) { cmdNewProject(); return; }
  let sel = 'swift';
  const all = Object.values(FILE_TEMPLATES).flat();
  const ov = document.createElement('div');
  ov.className = 'overlay show';
  const render = () => {
    ov.innerHTML = `<div class="sheet"><div class="sheet-title">Choose a template for your new file:</div>
      <div class="platform-tabs"><span class="active">iOS</span></div>
      ${Object.entries(FILE_TEMPLATES).map(([sec, list]) => `<div class="tpl-section">${sec}</div><div class="tpl-grid ft">${list.map(t => `<button class="tpl ${t.id === sel ? 'selected' : ''}" data-t="${t.id}"><span class="ft-icon ${t.icon}"></span><span>${esc(t.name)}</span></button>`).join('')}</div>`).join('')}
      <div class="sheet-buttons"><button class="btn" data-x="cancel">Cancel</button><div class="spacer"></div><button class="btn primary" data-x="next">Next</button></div></div>`;
    ov.querySelectorAll('[data-t]').forEach(b => b.onclick = e => { sel = b.dataset.t; if (e.detail === 2) next(); else render(); });
    ov.querySelector('[data-x=cancel]').onclick = () => ov.remove();
    ov.querySelector('[data-x=next]').onclick = next;
  };
  const next = async () => {
    ov.remove();
    const t = all.find(x => x.id === sel);
    const dir = targetDir();
    let name = await promptSheet(`Save As: (in “${basename(dir)}”)`, t.def + (t.ext ? '.' + t.ext : ''));
    if (!name) return;
    if (t.ext && !name.toLowerCase().endsWith('.' + t.ext)) name += '.' + t.ext;
    try {
      const p = await api.newFile(dir, name, S.name, t.id);
      S.expanded.add(dir);
      await loadTree(); renderTree();
      if (t.id === 'assets') openAssetsEditor(p); else await openFile(p);
    } catch (e) { toast(cleanErr(e), 3500); }
  };
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') ov.remove(); if (e.key === 'Enter') next(); });
  document.body.appendChild(ov);
  render();
}

// ======================================================================== Product ▸ Scheme ▸ Edit Scheme…

async function showEditScheme() {
  if (!S.root) return;
  const s = await projectSettings();
  const loc = await api.localizations(S.root);
  const scheme = s.scheme || {};
  const langs = Object.keys(loc.langs).filter(l => l !== 'Base');
  const regions = [['system', 'System Region'], ['PL', 'Poland'], ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['UA', 'Ukraine']];
  const args = (scheme.arguments || []).map(a => ({ ...a }));
  const envs = (scheme.environment || []).map(e => ({ ...e }));
  const ov = document.createElement('div');
  ov.className = 'overlay show';
  const exe = S.isPackage ? S.name : S.ios ? `${S.name}.app` : `${S.name}.exe`;
  ov.innerHTML = `<div class="sheet scheme-sheet"><div class="sheet-title" style="margin-bottom:10px">${FILE_BADGES.app} ${esc(S.name)} <span class="dim">›</span> ${esc(S.device)}</div><div class="scheme-cols">
      <div class="scheme-side"><div class="sel">${icon('play')} Run<br><small>Debug</small></div><div class="dim">${icon('hammer')} Build</div><div class="dim">${icon('testDiamond')} Test</div><div class="dim">Profile</div><div class="dim">Analyze</div><div class="dim">Archive</div></div>
      <div class="scheme-main"><div class="pe-tabs" id="sc-tabs"><span data-t="info" class="sel">Info</span><span data-t="args">Arguments</span><span data-t="opts">Options</span><span data-t="diag">Diagnostics</span></div>
        <div class="sc-page" data-p="info"><div class="pe-grid" style="margin-top:14px">
          <label>Build Configuration</label><select id="sc-config"><option value="debug" ${scheme.configuration !== 'release' ? 'selected' : ''}>Debug</option><option value="release" ${scheme.configuration === 'release' ? 'selected' : ''}>Release</option></select>
          <label>Executable</label><div class="val">${esc(exe)}</div>
          <label></label><label class="sc-check"><input type="checkbox" id="sc-debug" ${scheme.debugExecutable !== false ? 'checked' : ''}> Debug executable</label>
          <label>Launch</label><div class="dim">Automatically</div>
        </div><p class="pe-note">With “Debug executable” on, Run starts the app under LLDB: breakpoints, stepping, variables and the (lldb) console work like in Xcode.</p></div>
        <div class="sc-page" data-p="args" hidden>
          <div class="sc-h">Arguments Passed On Launch</div><div class="sc-list" id="sc-args"></div>
          <div class="sc-h">Environment Variables</div><div class="sc-list" id="sc-env"></div>
          <p class="pe-note">Read them in Swift with <code>CommandLine.arguments</code> and <code>ProcessInfo.processInfo.environment</code>.</p></div>
        <div class="sc-page" data-p="opts" hidden><div class="pe-grid" style="margin-top:14px">
          <label>App Language</label><select id="sc-lang"><option value="system">System Language</option>${langs.map(l => `<option value="${esc(l)}" ${scheme.appLanguage === l ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select>
          <label>App Region</label><select id="sc-region">${regions.map(([k, n]) => `<option value="${k}" ${(scheme.appRegion || 'system') === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label>Destination</label><div class="dim">${esc(S.ios ? S.device + ' (Simulator)' : 'My PC')}</div>
        </div>
        <p class="pe-note">“System Language” uses the simulator’s language (Settings ▸ General ▸ Language &amp; Region, or the simulator’s ☰ menu).</p></div>
        <div class="sc-page" data-p="diag" hidden><div class="pe-grid" style="margin-top:14px">
          <label>Runtime Sanitization</label><div class="dim">Address Sanitizer — needs clang-rt (not installed)</div>
          <label>Runtime API Checking</label><label class="sc-check"><input type="checkbox" checked disabled> Main Thread Checker</label>
        </div></div>
      </div></div>
    <div class="sheet-buttons"><div class="spacer"></div><button class="btn primary" data-x="close">Close</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#sc-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-t]');
    if (!t) return;
    ov.querySelectorAll('#sc-tabs span').forEach(s => s.classList.toggle('sel', s === t));
    ov.querySelectorAll('.sc-page').forEach(p => (p.hidden = p.dataset.p !== t.dataset.t));
  });
  // editable "+ / −" tables like Xcode's
  const table = (host, rows, kind) => {
    const draw = () => {
      host.innerHTML = `<table class="pe-table"><tbody>${rows.map((r, i) => `<tr data-i="${i}"><td style="width:24px"><input type="checkbox" data-f="enabled" ${r.enabled !== false ? 'checked' : ''}></td>
        ${kind === 'env' ? `<td><input data-f="name" value="${esc(r.name || '')}" placeholder="Name" spellcheck="false"></td>` : ''}<td><input data-f="value" value="${esc(r.value || '')}" placeholder="${kind === 'env' ? 'Value' : 'Argument'}" spellcheck="false"></td></tr>`).join('') || `<tr><td class="dim" style="padding:8px">No ${kind === 'env' ? 'environment variables' : 'arguments'}</td></tr>`}</tbody></table>
        <div class="sc-pm"><button class="mini-btn" data-a="add">${icon('plus')}</button><button class="mini-btn" data-a="del">${icon('minus')}</button></div>`;
    };
    let sel = -1;
    host.addEventListener('input', e => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      const r = rows[+tr.dataset.i];
      if (e.target.type === 'checkbox') r.enabled = e.target.checked; else r[e.target.dataset.f] = e.target.value;
    });
    host.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-i]'); if (tr) sel = +tr.dataset.i; });
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'add') { rows.push(kind === 'env' ? { name: '', value: '', enabled: true } : { value: '', enabled: true }); draw(); host.querySelector(`tr[data-i="${rows.length - 1}"] input[data-f="${kind === 'env' ? 'name' : 'value'}"]`)?.focus(); }
      if (b.dataset.a === 'del') { rows.splice(sel >= 0 ? sel : rows.length - 1, 1); sel = -1; draw(); }
    });
    draw();
  };
  table(ov.querySelector('#sc-args'), args, 'args');
  table(ov.querySelector('#sc-env'), envs, 'env');
  ov.querySelector('[data-x=close]').onclick = async () => {
    await saveSettings({ scheme: { ...scheme,
      appLanguage: ov.querySelector('#sc-lang').value, appRegion: ov.querySelector('#sc-region').value,
      configuration: ov.querySelector('#sc-config').value, debugExecutable: ov.querySelector('#sc-debug').checked,
      arguments: args.filter(a => a.value), environment: envs.filter(e => e.name) } });
    ov.remove();
    toast('Scheme saved — takes effect on the next Run');
  };
}
