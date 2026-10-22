'use strict';
// Settings window (Ctrl+,) — Xcode ▸ Settings: General, Themes, Text Editing, Key Bindings, Locations.

const DEFAULT_CODE_FONT = '"SF Mono", "Cascadia Mono", Consolas, monospace';
const CODE_FONTS = [
  [DEFAULT_CODE_FONT, 'SF Mono / Cascadia Mono'],
  ['"Cascadia Code", Consolas, monospace', 'Cascadia Code'],
  ['Consolas, monospace', 'Consolas'],
  ['"JetBrains Mono", Consolas, monospace', 'JetBrains Mono'],
  ['"Fira Code", Consolas, monospace', 'Fira Code'],
  ['"Courier New", monospace', 'Courier New'],
  ['"Lucida Console", monospace', 'Lucida Console'],
];
const EDITOR_THEMES = [
  ['auto', 'Default', null],
  ['xcode-dark', 'Default (Dark)', { bg: '#1F1F24', fg: '#DFDFE0', kw: '#FF7AB2', str: '#FF8170', num: '#D9C97C', type: '#5DD8FF', fn: '#41A1C0', com: '#7F8C98', call: '#B281EB', attr: '#CC9768' }],
  ['xcode-light', 'Default (Light)', { bg: '#FFFFFF', fg: '#262626', kw: '#AD3DA4', str: '#D12F1B', num: '#272AD8', type: '#0B4F79', fn: '#0F68A0', com: '#5D6C79', call: '#6C36A9', attr: '#815F03' }],
  ['xcode-midnight', 'Midnight', { bg: '#000000', fg: '#FFFFFF', kw: '#D31895', str: '#FF2C38', num: '#786DFF', type: '#00A0FF', fn: '#83C057', com: '#41CC45', call: '#23FF83', attr: '#D28F5A' }],
];

// ------------------------------------------------------------------ appearance & editor options

function effectiveAppearance() {
  const a = setting('appearance') || 'dark';
  if (a === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return a;
}

function editorThemeName() {
  const t = setting('editorTheme') || 'auto';
  return t === 'auto' ? (effectiveAppearance() === 'light' ? 'xcode-light' : 'xcode-dark') : t;
}

function applyTheme() {
  document.documentElement.classList.toggle('light', effectiveAppearance() === 'light');
  if (monaco) monaco.editor.setTheme(editorThemeName());
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (setting('appearance') === 'system') applyTheme(); });

function applyEditorSettings() {
  if (!editor) return;
  const fs = setting('fontSize');
  const auto = setting('autoClose') === false ? 'never' : 'languageDefined';
  editor.updateOptions({
    fontSize: fs,
    lineHeight: Math.round(fs * (setting('lineSpacing') || 1.55)),
    fontFamily: setting('codeFont') || DEFAULT_CODE_FONT,
    minimap: { enabled: setting('minimap') },
    wordWrap: setting('wrap') ? 'on' : 'off',
    stickyScroll: { enabled: setting('sticky') !== false },
    renderWhitespace: setting('invisibles') ? 'all' : 'none',
    renderControlCharacters: !!setting('invisibles'),
    lineNumbers: setting('lineNumbers') === false ? 'off' : 'on',
    folding: setting('folding') !== false,
    rulers: setting('pageGuide') ? [setting('pageGuideCol') || 80] : [],
    autoClosingBrackets: auto,
    autoClosingQuotes: auto,
    quickSuggestions: setting('suggest') === false ? false : { other: true, comments: false, strings: false },
    cursorBlinking: setting('cursorBlink') === false ? 'solid' : 'smooth',
  });
  const tab = setting('tabWidth') || 4;
  for (const d of S.docs.values()) {
    if (d.kind === 'file' && !d.model.isDisposed()) d.model.updateOptions({ tabSize: tab, indentSize: tab, insertSpaces: setting('insertSpaces') !== false });
  }
}

// ------------------------------------------------------------------ key binding overrides

function applyKeyOverrides(items) {
  const kb = P.keybindings;
  if (!kb || !items) return items;
  const walk = list => list.map(it => {
    if (it.submenu) return { ...it, submenu: walk(it.submenu) };
    if (!it.id || kb[it.id] === undefined) return it;
    return { ...it, accel: kb[it.id] || undefined, passthrough: kb[it.id] ? false : it.passthrough };
  });
  return walk(items);
}

/** eventKey() form ("Ctrl+Shift+K") → Electron accelerator ("CmdOrCtrl+Shift+K"). */
function keyToAccel(k) { return k.replace(/^Ctrl\b/, 'CmdOrCtrl'); }

// ------------------------------------------------------------------ the window

let settingsTab = 'general';

function showSettings(tab) {
  if (tab) settingsTab = tab;
  $('#settings-ov')?.remove();
  const ov = document.createElement('div');
  ov.className = 'overlay show';
  ov.id = 'settings-ov';
  const tabs = [['general', 'General', 'gear'], ['themes', 'Themes', 'appearance'], ['text', 'Text Editing', 'editorOptions'], ['keys', 'Key Bindings', 'keyboard'], ['locations', 'Locations', 'folder'], ['license', L('Licencja', 'License'), 'key']];
  ov.innerHTML = `<div class="sheet settings-sheet">
    <div class="st-tabs">${tabs.map(([id, label, ic]) => `<button data-t="${id}" class="${id === settingsTab ? 'sel' : ''}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>
    <div class="st-body" id="st-body"></div>
    <div class="st-foot"><span class="st-note" id="st-note"></span><div class="spacer"></div><button class="btn primary" data-x="done">Done</button></div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
  ov.querySelector('[data-x=done]').onclick = () => ov.remove();
  ov.querySelector('.st-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    settingsTab = b.dataset.t;
    ov.querySelectorAll('.st-tabs button').forEach(x => x.classList.toggle('sel', x === b));
    renderSettingsTab();
  });
  renderSettingsTab();
}

const chk = (k, label, def = true) => `<label class="st-check"><input type="checkbox" data-s="${k}" ${(setting(k) ?? def) !== false && (setting(k) ?? def) ? 'checked' : ''}> ${label}</label>`;
const sel = (k, opts, def) => `<select data-s="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(setting(k) ?? def) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

async function renderSettingsTab() {
  const host = $('#st-body');
  if (!host) return;
  $('#st-note').textContent = '';
  if (settingsTab === 'general') {
    host.innerHTML = `<div class="st-grid">
      <label>Appearance</label>${sel('appearance', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], 'dark')}
      <div class="st-h">Navigation</div>
      <label></label>${chk('previewTabs', 'Single-click in the navigator opens a preview tab (italic) that is reused')}
      <div class="st-h">Issues</div>
      <label></label>${chk('liveIssues', 'Show live issues (SourceKit checks your code while you type)')}
      <div class="st-h">Running</div>
      <label></label>${chk('showDebugOnRun', 'Show the Debug Area when the app runs')}
      <label></label>${chk('saveBeforeRun', 'Save all files before building')}
      <div class="st-h">Launch</div>
      <label></label>${chk('reopen', 'Reopen the last project when WinSwift Studio starts')}
    </div>`;
  } else if (settingsTab === 'themes') {
    const cur = setting('editorTheme') || 'auto';
    const sample = c => c ? `<pre style="background:${c.bg};color:${c.fg}"><span style="color:${c.kw};font-weight:700">struct</span> <span style="color:${c.type}">ContentView</span>: <span style="color:${c.call}">View</span> {
    <span style="color:${c.attr}">@State</span> <span style="color:${c.kw};font-weight:700">var</span> <span style="color:${c.fn}">count</span> = <span style="color:${c.num}">0</span>
    <span style="color:${c.com}">// Tap to count</span>
    <span style="color:${c.call}">Text</span>(<span style="color:${c.str}">"Hello"</span>)
}</pre>` : `<pre style="background:linear-gradient(135deg,#1F1F24 50%,#FFFFFF 50%);color:#888;display:grid;place-items:center">Light / Dark</pre>`;
    host.innerHTML = `<div class="st-themes">${EDITOR_THEMES.map(([id, name, c]) => `<div class="st-theme ${id === cur ? 'sel' : ''}" data-theme="${id}">${sample(c)}<div>${esc(name)}${id === 'auto' ? ' (matches appearance)' : ''}</div></div>`).join('')}</div>
      <div class="st-grid">
        <label>Font</label>${sel('codeFont', CODE_FONTS, DEFAULT_CODE_FONT)}
        <label>Size</label><div><input type="number" data-s="fontSize" min="8" max="32" value="${setting('fontSize')}"> pt</div>
        <label>Line Spacing</label>${sel('lineSpacing', [[1.35, 'Tight'], [1.55, 'Normal'], [1.75, 'Relaxed'], [2, 'Double']], 1.55)}
        <label></label>${chk('cursorBlink', 'Blinking cursor')}
      </div>`;
    host.querySelectorAll('[data-theme]').forEach(t => t.onclick = () => { setSetting('editorTheme', t.dataset.theme); applyTheme(); renderSettingsTab(); });
  } else if (settingsTab === 'text') {
    host.innerHTML = `<div class="st-grid">
      <div class="st-h">Display</div>
      <label></label>${chk('lineNumbers', 'Line numbers')}
      <label></label>${chk('folding', 'Code folding ribbon')}
      <label></label>${chk('minimap', 'Minimap')}
      <label></label>${chk('sticky', 'Sticky headers (scope at the top while scrolling)')}
      <label></label>${chk('invisibles', 'Invisibles', false)}
      <label></label>${chk('wrap', 'Wrap lines to editor width', false)}
      <label></label><div class="st-check">${chk('pageGuide', 'Page guide at column', false)} <input type="number" data-s="pageGuideCol" min="40" max="240" value="${setting('pageGuideCol') || 80}"></div>
      <div class="st-h">Indentation</div>
      <label>Prefer Indent Using</label>${sel('insertSpaces', [['true', 'Spaces'], ['false', 'Tabs']], 'true')}
      <label>Tab Width</label><div><input type="number" data-s="tabWidth" min="1" max="16" value="${setting('tabWidth') || 4}"> spaces</div>
      <div class="st-h">Editing</div>
      <label></label>${chk('autoClose', 'Automatically insert closing braces and quotes')}
      <label></label>${chk('suggest', 'Suggest completions while typing')}
      <label></label>${chk('trimWs', 'Automatically trim trailing whitespace')}
      <label></label>${chk('formatOnSave', 'Format the file with swift-format when saving', false)}
    </div>`;
  } else if (settingsTab === 'keys') {
    renderKeyBindings(host);
    return;
  } else if (settingsTab === 'locations') {
    const tc = await api.toolchain();
    host.innerHTML = `<div class="st-grid">
      <div class="st-h">Swift</div>
      <label>Toolchain</label><div>${tc.found ? `Swift ${esc(tc.version || '')}` : '<span style="color:var(--orange)">Not installed</span>'}</div>
      <label>Location</label><div class="st-note" style="user-select:text">${esc(tc.path || '—')}</div>
      <label></label><div><button class="btn small" data-a="tc-refresh">Refresh</button> <button class="btn small" data-a="tc-web">swift.org</button></div>
      <label>Windows SDK</label><div><button class="btn small" data-a="sdk">Install / Repair (no admin)…</button></div>
      <div class="st-h">Project</div>
      <label>Derived Data</label><div class="st-note" style="user-select:text">${S.root ? esc(S.root + '\\.build') : 'No project open'}</div>
      <label></label><div><button class="btn small" data-a="dd" ${S.root ? '' : 'disabled'}>Show in Explorer</button> <button class="btn small" data-a="clean" ${S.root ? '' : 'disabled'}>Delete Derived Data</button></div>
    </div>`;
    host.querySelector('[data-a=tc-refresh]').onclick = async () => { await updateToolchainLabel(true); renderSettingsTab(); };
    host.querySelector('[data-a=tc-web]').onclick = () => api.openExternal('https://www.swift.org/install/windows/');
    host.querySelector('[data-a=sdk]').onclick = () => { $('#settings-ov').remove(); runCommand('install-sdk'); };
    host.querySelector('[data-a=dd]').onclick = () => api.openPath(S.root + '\\.build');
    host.querySelector('[data-a=clean]').onclick = () => { cleanAction(); $('#st-note').textContent = 'Derived data deleted.'; };
    return;
  } else if (settingsTab === 'license') {
    renderLicenseTab(host, await api.licenseState());
    return;
  }
  host.querySelectorAll('[data-s]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.s;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    if (k === 'insertSpaces') v = v === 'true';
    if (k === 'lineSpacing') v = +v;
    if (k === 'fontSize') v = Math.max(8, Math.min(32, v || 13));
    setSetting(k, v);
    if (k === 'appearance') applyTheme();
    applyEditorSettings();
    if (k === 'liveIssues') applyDiagnostics();
    $('#st-note').textContent = 'Changes are applied immediately.';
  }));
}

// Settings ▸ License: the key on this PC and Deactivate (frees the key for any PC), or a field to paste a key
function renderLicenseTab(host, st) {
  const when = iso => (iso ? new Date(iso).toLocaleString(PL ? 'pl-PL' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const card = (badge, cls, lines) => `<div class="st-lic-card"><div class="welcome-icon"></div><div><b>WinSwift Studio</b> <span class="st-lic-badge ${cls}">${esc(badge)}</span>${lines}</div></div>`;
  if (st.status === 'disabled') {
    host.innerHTML = `<div class="st-license">${card(L('Wersja deweloperska', 'Developer build'), 'ok', `<div class="st-note">${esc(L('Uruchomiono ze źródeł — licencja nie jest wymagana.', 'Running from source — no license needed.'))}</div>`)}</div>`;
    return;
  }
  if (st.status === 'licensed') {
    host.innerHTML = `<div class="st-license">
      ${card(L('Aktywna', 'Active'), 'ok', `<div class="st-note">${esc(L('Działa na zawsze, także bez internetu.', 'Works forever, offline too.'))}</div>`)}
      <div class="st-grid">
        <label>${esc(L('Klucz', 'Key'))}</label><div class="st-note" style="font-family:var(--font-code)">${esc(st.key || '')}</div>
        <label>${esc(L('Komputer', 'This PC'))}</label><div>${esc(st.licensedTo || st.deviceName)}</div>
        <label>${esc(L('Aktywowano', 'Activated'))}</label><div>${esc(when(st.activatedAt))}</div>
        <div class="st-h">${esc(L('Przeniesienie na inny komputer', 'Move to another PC'))}</div>
        <label></label><div class="st-note">${esc(L('Klucz działa na jednym komputerze naraz. Dezaktywuj go tutaj, a potem wklej na innym komputerze (albo ponownie na tym).', 'A key works on one PC at a time. Deactivate it here, then paste it on another PC (or on this one again).'))}</div>
        <label></label><div><button class="btn" data-a="deactivate">${esc(L('Dezaktywuj na tym komputerze…', 'Deactivate on This PC…'))}</button> <button class="btn" data-a="profile">${esc(L('Mój profil w sklepie', 'My Shop Profile'))}</button></div>
        <label></label><div class="form-error" id="st-lic-err"></div>
      </div></div>`;
    host.querySelector('[data-a=deactivate]').onclick = e => deactivateLicense(e.currentTarget, $('#st-lic-err'));
  } else {
    const [badge, cls, note] = st.status === 'trial'
      ? [L(`Wersja próbna · ${minutesLeft(st)} min`, `Trial · ${minutesLeft(st)} min left`), 'trial', L('Wklej klucz licencyjny, żeby korzystać bez ograniczeń.', 'Paste a license key to unlock the app for good.')]
      : [L('Nieaktywna', 'Not activated'), 'off', st.dropped ? droppedText(st.dropped) : L('Wklej klucz licencyjny ze swojego profilu w sklepie.', 'Paste the license key from your profile in the shop.')];
    host.innerHTML = `<div class="st-license">
      ${card(badge, cls, `<div class="st-note">${esc(note)}</div>`)}
      <div class="lic-form"><input id="st-lic-code" spellcheck="false" autocomplete="off" maxlength="2000" placeholder="WS1-…"><button class="btn primary" data-a="activate">${esc(L('Aktywuj', 'Activate'))}</button></div>
      <div class="form-error" id="st-lic-err"></div>
      <div><button class="btn" data-a="buy">${esc(L('Kup licencję', 'Buy a License'))}</button> <button class="btn" data-a="profile">${esc(L('Mój profil w sklepie', 'My Shop Profile'))}</button></div>
    </div>`;
    const input = host.querySelector('#st-lic-code'), btn = host.querySelector('[data-a=activate]');
    btn.onclick = () => activateCode(input, $('#st-lic-err'), btn);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
    host.querySelector('[data-a=buy]').onclick = () => api.openExternal(`${SHOP}/buy.php`);
  }
  host.querySelector('[data-a=profile]').onclick = () => api.openExternal(`${SHOP}/profile.php`);
}

function renderKeyBindings(host) {
  const rows = [];
  for (const m of MENU_NAMES) {
    const walk = (list, path) => list.forEach(it => {
      if (it.submenu) walk(it.submenu, path.concat(it.label));
      else if (it.id && it.label && !/^(recent:|syntax:|dest:|x-|none$)/.test(it.id)) rows.push({ menu: m[0].toUpperCase() + m.slice(1), label: path.concat(it.label).join(' ▸ '), id: it.id, accel: it.accel });
    });
    walk(menuTemplate(m), []);
  }
  const custom = P.keybindings || {};
  host.innerHTML = `<div class="filter-box" style="max-width:260px;margin-bottom:10px"><span class="filter-ico">${icon('filter')}</span><input id="kb-filter" placeholder="Filter" spellcheck="false"></div>
    <table class="st-keys"><tbody>${rows.map(r => `<tr data-label="${esc((r.menu + ' ' + r.label + ' ' + (r.accel || '')).toLowerCase())}"><td>${esc(r.menu)}</td><td>${esc(r.label)}</td>
      <td class="k ${custom[r.id] !== undefined ? 'custom' : ''}" data-id="${esc(r.id)}" title="Click, then press the new shortcut (Backspace removes it)">${r.accel ? esc(accelKey(r.accel)) : '—'}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:12px"><button class="btn small" id="kb-reset">Restore Defaults</button></div>`;
  $('#st-note').textContent = 'Click a shortcut to change it.';
  host.querySelector('#kb-filter').addEventListener('input', e => {
    const f = e.target.value.toLowerCase();
    host.querySelectorAll('tr[data-label]').forEach(tr => (tr.hidden = !!f && !tr.dataset.label.includes(f)));
  });
  host.querySelector('#kb-reset').onclick = () => { P.keybindings = {}; api.setState({ keybindings: {} }); SHORTCUTS = null; renderKeyBindings(host); };
  host.querySelectorAll('td.k').forEach(td => td.onclick = () => recordShortcut(td, host));
}

function recordShortcut(td, host) {
  host.querySelectorAll('td.k.rec').forEach(x => x.classList.remove('rec'));
  td.classList.add('rec');
  td.textContent = 'Press keys…';
  S.recordingKey = true;
  const onKey = e => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    window.removeEventListener('keydown', onKey, true);
    S.recordingKey = false;
    if (e.key === 'Escape') { renderKeyBindings(host); return; }
    const kb = { ...(P.keybindings || {}) };
    const id = td.dataset.id;
    if (e.key === 'Backspace' || e.key === 'Delete') kb[id] = '';
    else {
      const key = eventKey(e);
      if (!SHORTCUTS) buildShortcutTable();
      const other = SHORTCUTS.get(key);
      if (other && other !== id) { kb[other] = ''; toast(`Removed ${key} from “${other}”`); }
      kb[id] = keyToAccel(key);
    }
    P.keybindings = kb;
    api.setState({ keybindings: kb });
    SHORTCUTS = null;
    renderKeyBindings(host);
  };
  window.addEventListener('keydown', onKey, true);
}
