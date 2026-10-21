'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const appEl = $('#app');
// `api` is the global exposed by preload.js

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = p => (p || '').replace(/\//g, '\\').toLowerCase();
const basename = p => p.split(/[\\/]/).pop();
const dirname = p => p.replace(/[\\/][^\\/]*$/, '');
const sep = '\\';
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const timeLabel = d => `Today at ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

applyIcons();

// ======================================================================== state

const S = {
  root: null,
  name: '',
  isPackage: false,
  tree: null,
  expanded: new Set(),
  selected: null,           // tree path
  tabs: [],                 // doc keys
  active: null,             // doc key
  docs: new Map(),          // key -> doc
  diags: [],
  building: false,
  running: false,
  reports: [],
  nav: 'project',
  insp: 'file',
  history: [],
  histIdx: -1,
  toolchain: null,
  lastStatus: null,
  reportSeq: 0,
  currentReport: null,
  ios: false,
  device: 'My PC',
};

let P = {};                 // persisted state (state.json)
let monaco = null;
let editor = null;

const DEFAULTS = { fontSize: 13, minimap: true, wrap: false, navW: 260, inspW: 260, debugH: 230, varsW: 38, hideNav: false, hideInsp: false, hideDebug: false, showWelcome: true };
const setting = k => (P.settings && P.settings[k] !== undefined ? P.settings[k] : DEFAULTS[k]);
function setSetting(k, v) {
  P.settings = { ...(P.settings || {}), [k]: v };
  api.setState({ settings: P.settings });
}

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

// ======================================================================== monaco bootstrap

require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
window.MonacoEnvironment = {
  getWorkerUrl: () => new URL('../node_modules/monaco-editor/min/vs/base/worker/workerMain.js', location.href).href,
};

require(['vs/editor/editor.main'], async () => {
  monaco = window.monaco;
  registerSwift(monaco);
  // Localizable.strings: "key" = "value"; with comments
  monaco.languages.register({ id: 'strings' });
  monaco.languages.setLanguageConfiguration('strings', { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, autoClosingPairs: [{ open: '"', close: '"' }] });
  monaco.languages.setMonarchTokensProvider('strings', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'], [/\/\*/, 'comment', '@comment'],
        [/"(?=[^"]*"\s*=)/, 'type.identifier', '@key'],
        [/"/, 'string', '@str'], [/[=;]/, 'delimiter'],
      ],
      key: [[/\\./, 'type.identifier'], [/"/, 'type.identifier', '@pop'], [/[^"\\]+/, 'type.identifier']],
      str: [[/%(\d+\$)?[-+ #0]*\d*(\.\d+)?(ll|l|h)?[\x40dDiuUxXoOfeEgGcCsSaA]|%#\x40\w+\x40/, 'number'], [/\\./, 'string.escape'], [/"/, 'string', '@pop'], [/[^"\\%]+/, 'string'], [/%/, 'string']],
      comment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']],
    },
  });
  createEditor();
  lspInit(monaco);
  initBreakpointGutter();
  initDebugHover();
  registerEditorActions();
  await init();
});

function languageFor(p) {
  const ext = (p.match(/\.([^.\\/]+)$/) || [])[1]?.toLowerCase();
  return { swift: SWIFT_LANG, json: 'json', strings: 'strings', stringsdict: 'xml', xcstrings: 'json', md: 'markdown', js: 'javascript', ts: 'typescript', html: 'html', css: 'css', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', m: 'objective-c', py: 'python', yml: 'yaml', yaml: 'yaml', xml: 'xml', plist: 'xml', sh: 'shell', ps1: 'powershell', bat: 'bat', ini: 'ini', toml: 'ini' }[ext] || 'plaintext';
}

function createEditor() {
  const fs = setting('fontSize');
  editor = monaco.editor.create($('#editor'), {
    model: null,
    theme: 'xcode-dark',
    automaticLayout: true,
    fontFamily: '"SF Mono", "Cascadia Mono", Consolas, monospace',
    fontSize: fs,
    lineHeight: Math.round(fs * 1.55),
    fontLigatures: false,
    minimap: { enabled: setting('minimap'), renderCharacters: false, showSlider: 'mouseover', maxColumn: 100 },
    glyphMargin: true,
    lineNumbersMinChars: 4,
    lineDecorationsWidth: 6,
    renderLineHighlight: 'line',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    tabSize: 4,
    insertSpaces: true,
    wordWrap: setting('wrap') ? 'on' : 'off',
    bracketPairColorization: { enabled: false },
    guides: { indentation: true, bracketPairs: false },
    padding: { top: 6, bottom: 6 },
    fixedOverflowWidgets: true,
    stickyScroll: { enabled: setting('sticky') !== false },
    renderWhitespace: setting('invisibles') ? 'all' : 'none',
    renderControlCharacters: !!setting('invisibles'),
    quickSuggestions: { other: true, comments: false, strings: false },
    suggest: { showWords: true, preview: true },
    occurrencesHighlight: 'singleFile',
    showFoldingControls: 'mouseover',
    contextmenu: true,
    mouseWheelZoom: true,
    scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, useShadows: false },
  });

  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      if (resource.scheme !== 'file') return false;
      let line, col;
      if (selectionOrPosition) {
        line = selectionOrPosition.startLineNumber || selectionOrPosition.lineNumber;
        col = selectionOrPosition.startColumn || selectionOrPosition.column;
      }
      openFile(resource.fsPath, { line, col });
      return true;
    },
  });

  editor.onDidChangeCursorPosition(debounce(() => { renderJumpbar(); renderQuickHelp(); }, 80));
  editor.onDidChangeModelContent(debounce(() => { renderJumpbar(); if (S.nav === 'symbols') renderSymbols(); }, 300));
  editor.onDidChangeConfiguration(e => {
    if (e.hasChanged(monaco.editor.EditorOption.fontSize)) {
      const size = editor.getOption(monaco.editor.EditorOption.fontSize);
      if (size !== setting('fontSize')) { setSetting('fontSize', size); editor.updateOptions({ lineHeight: Math.round(size * 1.55) }); }
    }
  });
}

/** Xcode-style items in the editor's right-click menu (next to Monaco's Go to Definition / Rename / Format). */
function registerEditorActions() {
  const items = [
    ['xc.quickHelp', 'Show Quick Help', 'quick-help', 'navigation', 0],
    ['xc.findSymbol', 'Find Selected Symbol in Project', 'find-symbol', 'navigation', 3],
    ['xc.breakpoint', 'Add/Remove Breakpoint at Current Line', 'bp-toggle', 'z_xcode', 1],
    ['xc.bookmark', 'Add Bookmark', 'add-bookmark', 'z_xcode', 2],
    ['xc.snippet', 'Create Code Snippet…', 'create-snippet', 'z_xcode', 3],
    ['xc.library', 'Show Library', 'library', 'z_xcode', 4],
  ];
  for (const [id, label, cmd, group, order] of items) {
    editor.addAction({ id, label, contextMenuGroupId: group, contextMenuOrder: order, run: () => runCommand(cmd) });
  }
}

// ======================================================================== documents

function docKey(p) { return monaco.Uri.file(p).toString(); }

async function ensureDoc(p) {
  const key = docKey(p);
  let doc = S.docs.get(key);
  if (doc && !doc.model.isDisposed()) return doc;
  let r;
  try { r = await api.read(p); } catch (e) { toast(`Couldn’t open ${basename(p)}`); return null; }
  if (r.binary) { api.openPath(p); return null; }
  const uri = monaco.Uri.file(p);
  const model = monaco.editor.getModel(uri) || monaco.editor.createModel(r.content, languageFor(p), uri);
  model.updateOptions({ tabSize: setting('tabWidth') || 4, indentSize: setting('tabWidth') || 4, insertSpaces: setting('insertSpaces') !== false });
  doc = { key, kind: 'file', path: p, model, saved: model.getAlternativeVersionId(), viewState: null, issueDecos: [], insertSpaces: true };
  model.onDidChangeContent(() => onDocChanged(doc));
  S.docs.set(key, doc);
  applyDiagsToDoc(doc);
  renderBreakpointDecorations(doc);
  renderBookmarkDecorations(doc);
  return doc;
}

const isDirty = doc => doc.kind === 'file' && doc.model.getAlternativeVersionId() !== doc.saved;

function onDocChanged(doc) {
  const wasDirty = doc._dirty;
  doc._dirty = isDirty(doc);
  if (S.previewTab === doc.key && doc._dirty) { S.previewTab = null; renderTabs(); }
  if (wasDirty !== doc._dirty) { renderTabs(); markTreeDirty(); }
  lspChanged(doc);
  canvasNoteEdit(doc);
}

async function saveDoc(doc) {
  if (!doc || doc.kind !== 'file') return;
  if (setting('formatOnSave') && /\.swift$/i.test(doc.path) && editor.getModel() === doc.model && window.swiftLspActive?.(doc.model)) {
    try { await editor.getAction('editor.action.formatDocument').run(); } catch {}
  }
  if (setting('trimWs') !== false) trimTrailingWhitespace(doc);
  try {
    await api.write(doc.path, doc.model.getValue());
    doc.saved = doc.model.getAlternativeVersionId();
    doc._dirty = false;
    renderTabs();
    markTreeDirty();
    lspSaved(doc);
  } catch (e) {
    toast(`Couldn’t save ${basename(doc.path)}: ${e.message}`, 4000);
  }
}

/** Settings ▸ Text Editing ▸ "Automatically trim trailing whitespace" (Xcode leaves the line you're typing on alone). */
function trimTrailingWhitespace(doc) {
  const m = doc.model;
  const cursorLine = editor && editor.getModel() === m ? editor.getPosition()?.lineNumber : -1;
  const edits = [];
  m.getLinesContent().forEach((l, i) => {
    if (i + 1 === cursorLine) return;
    const t = l.match(/[ \t]+$/);
    if (t) edits.push({ range: new monaco.Range(i + 1, l.length - t[0].length + 1, i + 1, l.length + 1), text: '' });
  });
  // Markdown keeps its hard line breaks
  if (!edits.length || /\.md$/i.test(doc.path)) return;
  m.pushEditOperations(editor && editor.getModel() === m ? editor.getSelections() : [], edits, () => null);
}

async function saveAll() {
  for (const doc of S.docs.values()) if (isDirty(doc)) await saveDoc(doc);
}

function disposeDoc(doc) {
  lspClose(doc);
  try { doc.model.dispose(); } catch {}
  S.docs.delete(doc.key);
}

// ======================================================================== tabs

const activeDoc = () => (S.active ? S.docs.get(S.active) : null);

async function openFile(p, { line, col, select, focus = true, preview = false } = {}) {
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(p)) { openImageDoc(p); return; }
  const doc = await ensureDoc(p);
  if (!doc) return;
  // Xcode's preview tab: a single click in the navigator reuses one italic tab until you edit or double-click
  if (preview && !S.tabs.includes(doc.key)) {
    const old = S.previewTab && S.docs.get(S.previewTab);
    const i = old ? S.tabs.indexOf(old.key) : -1;
    if (old && i >= 0 && !isDirty(old)) {
      if (S.active === old.key) old.viewState = editor.saveViewState();
      S.tabs.splice(i, 1, doc.key);
      lspClose(old);
    }
    S.previewTab = doc.key;
  } else if (!preview && S.previewTab === doc.key) S.previewTab = null;
  activate(doc.key);
  if (line) {
    const pos = { lineNumber: line, column: col || 1 };
    if (select) editor.setSelection(select); else editor.setPosition(pos);
    editor.revealPositionInCenterIfOutsideViewport(pos);
  }
  if (focus) editor.focus();
  pushHistory();
}

function activate(key) {
  const doc = S.docs.get(key);
  if (!doc) return;
  const prev = activeDoc();
  if (prev && prev !== doc && !prev.render) prev.viewState = editor.saveViewState();
  if (!S.tabs.includes(key)) {
    const i = S.tabs.indexOf(S.active);
    S.tabs.splice(i >= 0 ? i + 1 : S.tabs.length, 0, key);
  }
  S.active = key;
  // project, asset catalog and image tabs draw their own editor instead of Monaco
  $('#editor-host').classList.toggle('custom', !!doc.render);
  if (doc.render) {
    doc.render($('#custom-editor'), doc);
  } else {
    if (editor.getModel() !== doc.model) {
      editor.setModel(doc.model);
      if (doc.viewState) editor.restoreViewState(doc.viewState);
    }
    editor.updateOptions({ readOnly: doc.kind !== 'file' });
    lspOpen(doc);
  }
  appEl.classList.remove('no-tabs');
  if (doc.kind === 'file') { S.selected = doc.path; revealInTree(doc.path); }
  renderTabs();
  renderJumpbar();
  renderInspector();
  renderQuickHelp();
  saveProjectState();
  if (doc.kind === 'file' && canvasShown()) refreshCanvasSoon();
}
const refreshCanvasSoon = debounce(() => refreshCanvas(), 300);

async function closeTab(key, { force = false } = {}) {
  const doc = S.docs.get(key);
  if (!doc) return true;
  if (!force && isDirty(doc)) {
    const r = await api.confirm(`Do you want to save the changes you made to “${basename(doc.path)}”?`, 'Your changes will be lost if you don’t save them.', ['Save', 'Don’t Save', 'Cancel']);
    if (r === 2) return false;
    if (r === 0) await saveDoc(doc);
    else {
      // revert the in-memory model to disk contents
      try {
        const disk = await api.read(doc.path);
        doc.model.setValue(disk.content);
        doc.saved = doc.model.getAlternativeVersionId();
        doc._dirty = false;
      } catch {}
    }
  }
  const i = S.tabs.indexOf(key);
  if (i < 0) return true;
  S.tabs.splice(i, 1);
  if (S.previewTab === key) S.previewTab = null;
  if (doc.kind === 'log') disposeDoc(doc);
  else lspClose(doc);
  if (S.active === key) {
    const next = S.tabs[Math.min(i, S.tabs.length - 1)];
    S.active = null;
    if (next) activate(next);
    else {
      editor.setModel(null);
      $('#editor-host').classList.remove('custom');
      appEl.classList.add('no-tabs');
      renderJumpbar();
      renderInspector();
    }
  }
  renderTabs();
  saveProjectState();
  return true;
}

function renderTabs() {
  const bar = $('#tabbar');
  bar.innerHTML = S.tabs.map(key => {
    const doc = S.docs.get(key);
    if (!doc) return '';
    const name = doc.kind === 'file' ? displayName(basename(doc.path), doc.path) : doc.title;
    const badge = doc.kind === 'file' ? fileBadge(basename(doc.path), 'file') : doc.icon ? (FILE_BADGES[doc.icon] || icon('hammer')) : icon('hammer');
    return `<div class="tab ${key === S.active ? 'active' : ''} ${isDirty(doc) ? 'dirty' : ''} ${key === S.previewTab ? 'preview' : ''}" data-key="${esc(key)}" title="${esc(doc.path || name)}">
      <span class="badge">${badge}</span><span class="name">${esc(name)}</span>
      <button class="close" data-close="1">${icon('close')}</button></div>`;
  }).join('');
  if (!S.tabs.length) appEl.classList.add('no-tabs');
}

$('#tabbar').addEventListener('mousedown', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  if (e.button === 1) { e.preventDefault(); closeTab(tab.dataset.key); return; }
  if (e.button === 0 && !e.target.closest('[data-close]')) activate(tab.dataset.key);
});
$('#tabbar').addEventListener('click', e => {
  const btn = e.target.closest('[data-close]');
  if (btn) closeTab(btn.closest('.tab').dataset.key);
});
// double-clicking a preview tab keeps it open
$('#tabbar').addEventListener('dblclick', e => {
  const tab = e.target.closest('.tab');
  if (tab && tab.dataset.key === S.previewTab) { S.previewTab = null; renderTabs(); }
});
$('#tabbar').addEventListener('contextmenu', async e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const key = tab.dataset.key;
  const doc = S.docs.get(key);
  const id = await api.popupMenu([
    { id: 'close', label: 'Close Tab', accel: 'CmdOrCtrl+W' },
    { id: 'others', label: 'Close Other Tabs' },
    { id: 'all', label: 'Close All Tabs' },
    { type: 'separator' },
    { id: 'reveal', label: 'Show in Project Navigator', enabled: doc?.kind === 'file' },
    { id: 'explorer', label: 'Show in Explorer', enabled: doc?.kind === 'file' },
  ], e.clientX, e.clientY);
  if (id === 'close') closeTab(key);
  if (id === 'others') for (const k of [...S.tabs]) if (k !== key) { if (!(await closeTab(k))) break; }
  if (id === 'all') for (const k of [...S.tabs]) { if (!(await closeTab(k))) break; }
  if (id === 'reveal') { showNav('project'); revealInTree(doc.path, true); }
  if (id === 'explorer') api.reveal(doc.path);
});

// navigation history
function pushHistory() {
  const doc = activeDoc();
  if (!doc || doc.kind !== 'file') return;
  const pos = editor.getPosition();
  const entry = { path: doc.path, line: pos?.lineNumber || 1, col: pos?.column || 1 };
  const cur = S.history[S.histIdx];
  if (cur && cur.path === entry.path && Math.abs(cur.line - entry.line) < 3) { S.history[S.histIdx] = entry; return; }
  S.history = S.history.slice(0, S.histIdx + 1);
  S.history.push(entry);
  if (S.history.length > 100) S.history.shift();
  S.histIdx = S.history.length - 1;
}
async function goHistory(delta) {
  const i = S.histIdx + delta;
  const h = S.history[i];
  if (!h) return;
  S.histIdx = i;
  const doc = await ensureDoc(h.path);
  if (!doc) return;
  activate(doc.key);
  editor.setPosition({ lineNumber: h.line, column: h.col });
  editor.revealPositionInCenterIfOutsideViewport({ lineNumber: h.line, column: h.col });
  editor.focus();
}
$('#jb-back').onclick = () => goHistory(-1);
$('#jb-fwd').onclick = () => goHistory(1);
// Xcode's "Adjust Editor Options" (≡ at the right of the jump bar)
$('#jb-opts').onclick = async e => {
  const r = e.currentTarget.getBoundingClientRect();
  const id = await api.popupMenu([
    { id: 'toggle-canvas', label: 'Canvas', checked: canvasShown(), accel: 'CmdOrCtrl+Alt+Enter', enabled: !!S.root },
    { type: 'separator' },
    { id: 'minimap', label: 'Minimap', checked: setting('minimap') },
    { id: 'invisibles', label: 'Invisibles', checked: !!setting('invisibles') },
    { id: 'wrap', label: 'Wrap Lines', checked: setting('wrap') },
    { id: 'sticky', label: 'Sticky Headers', checked: setting('sticky') !== false },
    { type: 'separator' },
    { id: 'show-debug', label: appEl.classList.contains('hide-debug') ? 'Show Debug Area' : 'Hide Debug Area' },
    { id: 'settings-text', label: 'Text Editing Settings…' },
  ], r.right - 220, r.bottom + 2);
  if (id === 'show-debug') runCommand('toggle-debug');
  else if (id === 'settings-text') showSettings('text');
  else runCommand(id);
};

// ======================================================================== jump bar

function currentSymbols(doc) {
  if (!doc || doc.kind !== 'file' || doc.model.getLanguageId() !== SWIFT_LANG) return [];
  const v = doc.model.getVersionId();
  if (doc.symCache?.v !== v) doc.symCache = { v, list: parseSwiftSymbols(doc.model.getValue()) };
  return doc.symCache.list;
}

function renderJumpbar() {
  const host = $('#jb-path');
  const doc = activeDoc();
  if (!doc || !S.root) { host.innerHTML = ''; return; }
  const segs = [];
  segs.push(`<span class="jb-seg" data-jb="project"><span>${FILE_BADGES.project}</span>${esc(S.name)}</span>`);
  if (doc.kind === 'file') {
    const rel = doc.path.slice(S.root.length).split(/[\\/]/).filter(Boolean);
    let acc = S.root;
    rel.forEach((part, i) => {
      acc += sep + part;
      const last = i === rel.length - 1;
      segs.push(`<span class="jb-sep">›</span><span class="jb-seg" data-jb="${last ? 'file' : 'dir'}" data-path="${esc(acc)}"><span>${fileBadge(part, last ? 'file' : 'dir')}</span>${esc(part)}</span>`);
    });
    const syms = currentSymbols(doc);
    const line = editor.getPosition()?.lineNumber || 1;
    const containers = syms.filter(s => !['let', 'var', 'case'].includes(s.kind) || s.depth === 0);
    let cur = null;
    for (const s of containers) if (s.line <= line) cur = s;
    if (syms.length) {
      segs.push(`<span class="jb-sep">›</span><span class="jb-seg" data-jb="symbol">${cur ? symbolBadge(cur.kind) + esc(symbolTitle(cur)) : '<span style="color:var(--text-3)">No Selection</span>'}</span>`);
    }
  } else {
    segs.push(`<span class="jb-sep">›</span><span class="jb-seg">${icon('hammer')}${esc(doc.title)}</span>`);
  }
  host.innerHTML = segs.join('');
}

function symbolTitle(s) {
  if (s.kind === 'func' || s.kind === 'init') {
    const m = s.signature.match(/\(([^)]*)\)/);
    const labels = m ? m[1].split(',').map(a => a.trim()).filter(Boolean).map(a => {
      const [outer] = a.split(':')[0].trim().split(/\s+/);
      return (outer || '_') + ':';
    }).join('') : '';
    return `${s.name}(${labels})`;
  }
  return s.name;
}

$('#jb-path').addEventListener('click', async e => {
  const seg = e.target.closest('.jb-seg');
  if (!seg) return;
  const r = seg.getBoundingClientRect();
  const doc = activeDoc();
  if (seg.dataset.jb === 'symbol') {
    const syms = currentSymbols(doc);
    const id = await api.popupMenu(syms.map((s, i) => ({ id: String(i), label: `${'    '.repeat(Math.min(s.depth, 3))}${symbolTitle(s)}` })), r.left, r.bottom);
    if (id != null) {
      const s = syms[+id];
      editor.setPosition({ lineNumber: s.line, column: s.col });
      editor.revealLineInCenter(s.line);
      editor.focus();
    }
  } else if (seg.dataset.jb === 'file' || seg.dataset.jb === 'dir') {
    const dir = seg.dataset.jb === 'file' ? dirname(seg.dataset.path) : seg.dataset.path;
    const node = findNode(S.tree, dir);
    if (!node) return;
    const files = flattenFiles(node).slice(0, 80);
    const id = await api.popupMenu(files.map((f, i) => ({ id: String(i), label: f.path.slice(dir.length + 1) })), r.left, r.bottom);
    if (id != null) openFile(files[+id].path);
  }
});

// ======================================================================== project

async function openProject(root, { file } = {}) {
  if (S.root && norm(S.root) !== norm(root)) {
    if (!(await confirmDiscardAll())) return;
    closeProject(true);
  }
  if (!(await api.exists(root))) { toast('Project folder no longer exists'); removeRecent(root); return; }
  S.root = root;
  S.name = basename(root);
  S.isPackage = await api.exists(root + sep + 'Package.swift');
  S.diags = [];
  S.reports = [];
  S.history = []; S.histIdx = -1;
  appEl.classList.remove('no-project');
  hideOverlay('welcome');
  $('#tb-project-name').textContent = S.name;
  $('#scheme-name').textContent = S.name;
  document.title = `${S.name} — WinSwift Studio`;
  updateToolchainLabel();
  await api.watch(root);
  await loadTree();
  const saved = (P.projects || {})[norm(root)] || {};
  if (saved.expanded) saved.expanded.forEach(p => S.expanded.add(p));
  else expandDefault(S.tree, 0);
  renderTree();
  addRecent(root);
  loadBreakpoints();

  // preload Swift sources so completions / jump-to-definition see the whole project
  const swiftFiles = flattenFiles(S.tree).filter(f => f.name.endsWith('.swift')).slice(0, 300);
  await Promise.all(swiftFiles.map(f => ensureDoc(f.path)));
  setDestination(!S.isPackage && [...S.docs.values()].some(d => d.kind === 'file' && /^\s*import\s+SwiftUI\b/m.test(d.model.getValue())));

  const toOpen = [];
  if (saved.tabs?.length) for (const p of saved.tabs) if (await api.exists(p)) toOpen.push(p);
  if (!toOpen.length) {
    const main = swiftFiles.find(f => /^main\.swift$/i.test(f.name)) || swiftFiles[0];
    if (main) toOpen.push(main.path);
  }
  for (const p of toOpen) { const d = await ensureDoc(p); if (d && !S.tabs.includes(d.key)) S.tabs.push(d.key); }
  const activePath = file || (saved.active && toOpen.includes(saved.active) ? saved.active : toOpen[0]);
  if (activePath) await openFile(activePath, { focus: true });
  else { renderTabs(); appEl.classList.add('no-tabs'); }
  setStatus('ready');
  renderReports();
  renderIssues();
  // SourceKit warms up in the background (first start of a session takes a while)
  lspStartProject(root);
  if (setting('canvas') && S.ios) toggleCanvas(true);
}

function closeProject(silent) {
  lspStopProject();
  api.previewStop();
  CV.target = null; CV.shownFor = null; CV.pinned = null; CV.building = false;
  for (const doc of [...S.docs.values()]) disposeDoc(doc);
  S.tabs = []; S.active = null; S.root = null; S.tree = null; S.expanded.clear(); S.selected = null; S.diags = [];
  if (editor) editor.setModel(null);
  api.watch(null);
  if (!silent) {
    appEl.classList.add('no-project', 'no-tabs');
    document.title = 'WinSwift Studio';
    $('#tb-project-name').textContent = 'WinSwift Studio';
    $('#tb-project-sub').textContent = 'No Project';
    $('#scheme-name').textContent = 'No Scheme';
    setDestination(false);
    setStatus('none');
    renderTabs(); renderTree(); renderJumpbar(); renderInspector(); renderIssues();
    showWelcome();
  }
}

async function confirmDiscardAll() {
  const dirty = [...S.docs.values()].filter(isDirty);
  if (!dirty.length) return true;
  const r = await api.confirm(`Do you want to save changes to ${dirty.length} file${dirty.length > 1 ? 's' : ''}?`, dirty.map(d => basename(d.path)).join(', '), ['Save All', 'Don’t Save', 'Cancel']);
  if (r === 2) return false;
  if (r === 0) await saveAll();
  return true;
}

function saveProjectState() {
  if (!S.root) return;
  P.projects = P.projects || {};
  P.projects[norm(S.root)] = {
    ...(P.projects[norm(S.root)] || {}),   // keeps breakpoints & bookmarks
    tabs: S.tabs.map(k => S.docs.get(k)).filter(d => d?.kind === 'file').map(d => d.path),
    active: activeDoc()?.kind === 'file' ? activeDoc().path : null,
    expanded: [...S.expanded],
  };
  saveProjectStateDebounced();
}
const saveProjectStateDebounced = debounce(() => api.setState({ projects: P.projects }), 400);

function addRecent(root) {
  const list = (P.recent || []).filter(r => norm(r.path) !== norm(root));
  list.unshift({ path: root, name: basename(root), isPackage: S.isPackage, opened: Date.now() });
  P.recent = list.slice(0, 15);
  api.setState({ recent: P.recent });
}
function removeRecent(root) {
  P.recent = (P.recent || []).filter(r => norm(r.path) !== norm(root));
  api.setState({ recent: P.recent });
  renderRecent();
}

async function loadTree() {
  if (!S.root) return;
  S.tree = await api.tree(S.root);
}

function expandDefault(node, depth) {
  if (node.type !== 'dir') return;
  if (depth < 3) S.expanded.add(node.path);
  node.children.forEach(c => expandDefault(c, depth + 1));
}

function flattenFiles(node, out = []) {
  if (!node) return out;
  if (node.type === 'file') out.push(node);
  else node.children.forEach(c => flattenFiles(c, out));
  return out;
}

function findNode(node, p) {
  if (!node) return null;
  if (norm(node.path) === norm(p)) return node;
  if (node.type === 'dir') for (const c of node.children) { const r = findNode(c, p); if (r) return r; }
  return null;
}

api.on('project:changed', debounce(async root => {
  if (!S.root || norm(root) !== norm(S.root)) return;
  await loadTree();
  renderTree();
  // sync clean buffers with disk, close tabs of deleted files
  for (const doc of [...S.docs.values()]) {
    if (doc.kind !== 'file') continue;
    const exists = await api.exists(doc.path);
    if (!exists) {
      if (!isDirty(doc)) { if (S.tabs.includes(doc.key)) await closeTab(doc.key, { force: true }); disposeDoc(doc); }
      continue;
    }
    if (isDirty(doc)) continue;
    try {
      const r = await api.read(doc.path);
      if (!r.binary && r.content !== doc.model.getValue()) {
        doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: r.content }], () => null);
        doc.saved = doc.model.getAlternativeVersionId();
      }
    } catch {}
  }
  // pick up new Swift files
  for (const f of flattenFiles(S.tree)) if (f.name.endsWith('.swift')) await ensureDoc(f.path);
  if (S.nav === 'symbols') renderSymbols();
  // the asset catalog / project editor follow the files on disk
  if (activeDoc()?.render && activeDoc().icon !== 'image') rerenderCustom();
  if (activeDoc()?.kind === 'file') renderInspector();
}, 200));

// ======================================================================== project navigator (tree)

/** Build issues plus SourceKit's live issues; a file's live issues replace its build issues (they're newer). */
function allIssues() {
  if (typeof LSP === 'undefined' || !LSP.diags.size || setting('liveIssues') === false) return S.diags;
  const out = S.diags.filter(d => !(d.file && LSP.diags.has(norm(d.file))));
  for (const list of LSP.diags.values()) out.push(...list);
  return out;
}
const refreshIssueViews = debounce(() => { renderIssues(); renderTree(); updateActivityIssues(); }, 150);

function issueCountsByFile() {
  const m = new Map();
  for (const d of allIssues()) {
    if (!d.file || d.severity === 'note') continue;
    const k = norm(d.file);
    const c = m.get(k) || { error: 0, warning: 0 };
    c[d.severity === 'error' ? 'error' : 'warning']++;
    m.set(k, c);
  }
  return m;
}

// Xcode's navigator hides known extensions; localized files show their language
const KNOWN_EXT = /\.(swift|strings|stringsdict|xcstrings|xcassets|png|jpe?g|gif|webp|plist|storyboard|xib)$/i;
function displayName(name, p, longLang) {
  let base = name.replace(KNOWN_EXT, '');
  const m = p ? basename(dirname(p)).match(/^(.+)\.lproj$/i) : null;
  if (m) base += ` (${longLang ? langName(m[1]) : m[1]})`;
  return base;
}

/** The navigator's view of the folder tree: .lproj folders fold into one group per localized file, catalogs are leaves. */
function displayTree(node) {
  if (node.type !== 'dir') return { ...node, label: displayName(node.name, node.path, true) };
  if (/\.xcassets$/i.test(node.name)) return { ...node, type: 'assets', label: displayName(node.name), children: [] };
  const children = [];
  const groups = new Map();
  for (const c of node.children) {
    if (c.type === 'dir' && /\.lproj$/i.test(c.name)) {
      for (const f of c.children) {
        if (f.type !== 'file') continue;
        const gp = node.path + sep + f.name + '#loc';
        if (!groups.has(gp)) { const g = { type: 'vgroup', name: f.name, label: displayName(f.name), path: gp, children: [] }; groups.set(gp, g); children.push(g); }
        groups.get(gp).children.push({ ...f, label: displayName(f.name, f.path, true) });
      }
    } else children.push(displayTree(c));
  }
  for (const g of groups.values()) g.children.sort((a, b) => a.label.localeCompare(b.label));
  children.sort((a, b) => {
    const da = a.type === 'dir' ? 0 : 1, db = b.type === 'dir' ? 0 : 1;
    return da !== db ? da - db : a.label.localeCompare(b.label, undefined, { numeric: true });
  });
  return { ...node, label: node.name, children };
}

function renderTree() {
  const host = $('#tree');
  if (!S.tree) { host.innerHTML = ''; return; }
  const filter = $('#nav-filter').value.trim().toLowerCase();
  const counts = issueCountsByFile();
  const dirty = new Set([...S.docs.values()].filter(isDirty).map(d => norm(d.path)));
  const rows = [];
  const isLeaf = n => n.type === 'file' || n.type === 'assets';
  const matches = node => !filter || (isLeaf(node) ? node.label.toLowerCase().includes(filter) : node.children.some(matches));
  const walk = (node, depth) => {
    if (depth > 0 && !matches(node)) return;
    const isRoot = depth === 0;
    const isDir = node.type === 'dir' || node.type === 'vgroup';
    const expanded = isRoot || !!filter || S.expanded.has(node.path);
    const c = counts.get(norm(node.path));
    let status = '';
    if (dirty.has(norm(node.path))) status = '<span class="status dirty" title="Unsaved changes"></span>';
    else if (c && c.error) status = `<span class="status err">${c.error}</span>`;
    else if (c && c.warning) status = `<span class="status" style="color:var(--yellow)">${c.warning}</span>`;
    const badge = isRoot ? FILE_BADGES.project : fileBadge(node.name, node.type);
    const label = isRoot ? S.name : node.label;
    rows.push(`<div class="row ${isRoot ? 'project' : ''} ${isDir && !expanded ? 'collapsed' : ''} ${S.selected && norm(S.selected) === norm(node.path) ? 'selected' : ''}"
      data-path="${esc(node.path)}" data-type="${isRoot ? 'root' : node.type}" style="padding-left:${6 + depth * 14}px">
      <span class="twisty">${isDir && !isRoot && node.children.length ? icon('chevronDown') : ''}</span>
      <span class="badge">${badge}</span><span class="label">${esc(label)}</span>${status}</div>`);
    if (isDir && expanded) node.children.forEach(ch => walk(ch, depth + 1));
  };
  walk(displayTree(S.tree), 0);
  host.innerHTML = rows.join('') + (rows.length <= 1 && filter ? '<div class="tree-empty">No Filter Results</div>' : '');
}

const markTreeDirty = debounce(renderTree, 60);

function revealInTree(p, focus) {
  if (!S.root || !p) return;
  let d = dirname(p);
  // a localized file sits in its virtual "Localizable" group
  if (/\.lproj$/i.test(basename(d))) { S.expanded.add(dirname(d) + sep + basename(p) + '#loc'); d = dirname(d); }
  while (d.length > S.root.length) { S.expanded.add(d); d = dirname(d); }
  S.selected = p;
  renderTree();
  const row = [...$$('#tree .row')].find(r => norm(r.dataset.path) === norm(p));
  if (row) row.scrollIntoView({ block: 'nearest' });
  if (focus) $('#tree').focus();
}

function selectRow(row) {
  $$('#tree .row.selected').forEach(r => r.classList.remove('selected'));
  row.classList.add('selected');
  S.selected = row.dataset.path;
  row.scrollIntoView({ block: 'nearest' });
}

function toggleDir(p, open) {
  const isOpen = S.expanded.has(p);
  if (open === undefined) open = !isOpen;
  if (open) S.expanded.add(p); else S.expanded.delete(p);
  renderTree();
  saveProjectState();
}

$('#tree').addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (!row) return;
  selectRow(row);
  const { type, path } = row.dataset;
  if ((type === 'dir' || type === 'vgroup') && (e.target.closest('.twisty') || e.detail === 2 || type === 'vgroup')) toggleDir(path);
  if (type === 'file') openFile(path, { focus: e.detail === 2, preview: e.detail !== 2 && setting('previewTabs') !== false });
  if (type === 'assets') openAssetsEditor(path);
  if (type === 'root') openProjectEditor();
});

// drag files in from Explorer: into a group, or into an asset catalog as image sets
$('#tree').addEventListener('dragover', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  $$('#tree .row.drop').forEach(r => r.classList.remove('drop'));
  const row = e.target.closest('.row');
  if (row) row.classList.add('drop');
});
$('#tree').addEventListener('dragleave', e => { if (!e.relatedTarget || !$('#tree').contains(e.relatedTarget)) $$('#tree .row.drop').forEach(r => r.classList.remove('drop')); });
$('#tree').addEventListener('drop', async e => {
  e.preventDefault();
  $$('#tree .row.drop').forEach(r => r.classList.remove('drop'));
  if (!S.root) return;
  const files = [...e.dataTransfer.files].map(f => api.pathForFile(f)).filter(Boolean);
  if (!files.length) return;
  const row = e.target.closest('.row');
  const type = row?.dataset.type;
  try {
    if (type === 'assets') {
      await api.importAssets(row.dataset.path, files);
      toast(`Added ${files.length} image${files.length > 1 ? 's' : ''} to ${displayName(basename(row.dataset.path))}`);
      if (activeDoc()?.dir === row.dataset.path) rerenderCustom();
    } else {
      const dir = type === 'dir' ? row.dataset.path : type === 'file' ? dirname(row.dataset.path) : targetDir();
      await api.importFiles(dir, files);
      S.expanded.add(dir);
      toast(`Copied ${files.length} file${files.length > 1 ? 's' : ''} to “${basename(dir)}”`);
    }
    await loadTree(); renderTree();
  } catch (err) { toast(cleanErr(err), 3500); }
});

$('#tree').addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const rows = $$('#tree .row');
  const i = rows.findIndex(r => r.classList.contains('selected'));
  const row = rows[i];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) { selectRow(n); if (n.dataset.type === 'file') openFile(n.dataset.path, { focus: false }); }
  } else if (e.key === 'ArrowRight' && row?.dataset.type === 'dir') { e.preventDefault(); toggleDir(row.dataset.path, true); }
  else if (e.key === 'ArrowLeft' && row) {
    e.preventDefault();
    if (row.dataset.type === 'dir' && S.expanded.has(row.dataset.path)) toggleDir(row.dataset.path, false);
    else { const parent = rows.find(r => norm(r.dataset.path) === norm(dirname(row.dataset.path))); if (parent) selectRow(parent); }
  } else if (e.key === 'Enter' && row && !['root', 'vgroup'].includes(row.dataset.type)) { e.preventDefault(); startRename(row); }
  else if (e.key === 'Delete' && row && !['root', 'vgroup'].includes(row.dataset.type)) { e.preventDefault(); trashPath(row.dataset.path); }
});

$('#tree').addEventListener('contextmenu', async e => {
  const row = e.target.closest('.row');
  if (row) selectRow(row);
  const type = row?.dataset.type;
  const p = row?.dataset.path || S.root;
  const id = await api.popupMenu([
    { id: 'open', label: 'Open', enabled: type === 'file' || type === 'assets' },
    { id: 'explorer', label: 'Show in Explorer' },
    { type: 'separator' },
    { id: 'newfile', label: 'New File…', accel: 'CmdOrCtrl+N' },
    { id: 'newgroup', label: 'New Group' },
    { type: 'separator' },
    { id: 'addfiles', label: `Add Files to “${S.name}”…` },
    { type: 'separator' },
    { id: 'rename', label: 'Rename', enabled: !!row && type !== 'root' && type !== 'vgroup' },
    { id: 'delete', label: 'Move to Trash', accel: 'Delete', enabled: !!row && type !== 'root' && type !== 'vgroup' },
  ], e.clientX, e.clientY);
  if (id === 'addfiles') {
    const files = await api.openFilesDialog();
    if (files.length) {
      const dir = type === 'dir' ? p : type === 'file' ? dirname(p) : targetDir();
      if (type === 'assets') await api.importAssets(p, files); else await api.importFiles(dir, files);
      await loadTree(); renderTree();
    }
  }
  if (id === 'open') { if (type === 'assets') openAssetsEditor(p); else openFile(p); }
  if (id === 'explorer') api.reveal(p);
  if (id === 'newfile') cmdNewFile();
  if (id === 'newgroup') cmdNewGroup();
  if (id === 'rename') startRename(row);
  if (id === 'delete') trashPath(p);
});

function startRename(row) {
  const p = row.dataset.path;
  const old = basename(p);
  row.classList.add('renaming');
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = old;
  row.querySelector('.label').after(input);
  input.focus();
  const dot = old.lastIndexOf('.');
  input.setSelectionRange(0, dot > 0 ? dot : old.length);
  let done = false;
  const finish = async commit => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    row.classList.remove('renaming');
    input.remove();
    if (!commit || !name || name === old) { $('#tree').focus(); return; }
    try {
      // keep open buffers: save, rename, reopen under the new path
      const affected = [...S.docs.values()].filter(d => d.kind === 'file' && (norm(d.path) === norm(p) || norm(d.path).startsWith(norm(p) + '\\')));
      for (const d of affected) if (isDirty(d)) await saveDoc(d);
      const to = await api.rename(p, name);
      const wasActive = activeDoc();
      for (const d of affected) {
        const newPath = to + d.path.slice(p.length);
        const tabIdx = S.tabs.indexOf(d.key);
        disposeDoc(d);
        const nd = await ensureDoc(newPath);
        if (nd && tabIdx >= 0) S.tabs[tabIdx] = nd.key;
        if (nd && wasActive === d) { S.active = null; activate(nd.key); }
      }
      if (S.expanded.has(p)) { S.expanded.delete(p); S.expanded.add(to); }
      S.selected = to;
      await loadTree();
      renderTree();
      renderTabs();
      $('#tree').focus();
    } catch (err) {
      toast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 3500);
    }
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function trashPath(p) {
  const r = await api.confirm(`Do you want to move “${basename(p)}” to the Recycle Bin?`, 'You can restore it from the Recycle Bin.', ['Move to Recycle Bin', 'Cancel']);
  if (r !== 0) return;
  for (const d of [...S.docs.values()]) {
    if (d.kind === 'file' && (norm(d.path) === norm(p) || norm(d.path).startsWith(norm(p) + '\\'))) {
      await closeTab(d.key, { force: true });
      disposeDoc(d);
    }
  }
  try { await api.trash(p); } catch (e) { toast(e.message); }
  await loadTree();
  renderTree();
}

function targetDir() {
  if (!S.root) return null;
  const sel = S.selected ? findNode(S.tree, S.selected) : null;
  if (sel) return sel.type === 'dir' ? sel.path : dirname(sel.path);
  const group = S.tree?.children.find(c => c.type === 'dir' && c.name === S.name);
  return group ? group.path : S.root;
}

$('#nav-filter').addEventListener('input', () => {
  if (S.nav === 'project') renderTree();
  if (S.nav === 'symbols') renderSymbols();
  if (S.nav === 'issues') renderIssues();
});
$('#nav-add').onclick = e => {
  const r = e.currentTarget.getBoundingClientRect();
  api.popupMenu([{ id: 'file', label: 'New File…' }, { id: 'group', label: 'New Group' }, { type: 'separator' }, { id: 'open', label: 'Open Folder in Explorer' }], r.left, r.top - 80)
    .then(id => { if (id === 'file') cmdNewFile(); if (id === 'group') cmdNewGroup(); if (id === 'open' && S.root) api.openPath(S.root); });
};

// ======================================================================== other navigators

function showNav(name) {
  S.nav = name;
  $$('#nav-tabs button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  $$('.nav-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  if (appEl.classList.contains('hide-nav')) toggleNavigator(true);
  $('#nav-filter').parentElement.parentElement.style.display = name === 'find' || name === 'reports' ? 'none' : '';
  if (name === 'symbols') renderSymbols();
  if (name === 'issues') renderIssues();
  if (name === 'reports') renderReports();
  if (name === 'debug') renderDebugNav();
  if (name === 'breakpoints') renderBreakpointNav();
  if (name === 'bookmarks') renderBookmarks();
  if (name === 'find') setTimeout(() => $('#find-input').focus(), 0);
  if (name === 'project') renderTree();
}
$('#nav-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showNav(b.dataset.nav); });

function renderSymbols() {
  const host = $('#symbol-list');
  const filter = $('#nav-filter').value.trim().toLowerCase();
  const docs = [...S.docs.values()].filter(d => d.kind === 'file' && d.model.getLanguageId() === SWIFT_LANG).sort((a, b) => a.path.localeCompare(b.path));
  const out = [];
  for (const doc of docs) {
    const syms = currentSymbols(doc).filter(s => s.kind !== 'case' && (!filter || s.name.toLowerCase().includes(filter)));
    if (!syms.length) continue;
    out.push(`<div class="group-row"><span class="badge">${fileBadge(basename(doc.path), 'file')}</span>${esc(basename(doc.path))}<span class="count">${syms.length}</span></div>`);
    for (const s of syms) {
      out.push(`<div class="item-row" style="padding-left:${24 + Math.min(s.depth, 4) * 12}px" data-open="${esc(doc.path)}" data-line="${s.line}" data-col="${s.col}">
        ${symbolBadge(s.kind)}<div class="txt"><div class="ln" style="font-family:var(--font-ui);font-size:12.5px">${esc(symbolTitle(s))}</div></div></div>`);
    }
  }
  host.innerHTML = out.join('') || '<div class="nav-empty">No Symbols</div>';
}

for (const id of ['#symbol-list', '#issue-list', '#find-results']) {
  $(id).addEventListener('click', e => {
    const r = e.target.closest('[data-open]');
    if (!r) return;
    $$(`${id} .selected`).forEach(x => x.classList.remove('selected'));
    r.classList.add('selected');
    const line = +r.dataset.line || 1, col = +r.dataset.col || 1, len = +r.dataset.len || 0;
    openFile(r.dataset.open, { line, col, select: len ? new monaco.Selection(line, col, line, col + len) : null });
  });
}

// find navigator
async function runFind() {
  const q = $('#find-input').value;
  const opts = { caseSensitive: $('#find-case').checked, word: $('#find-word').checked, regex: $('#find-regex').checked };
  if (!S.root || !q) { $('#find-results').innerHTML = ''; $('#find-summary').textContent = ''; return; }
  let results = await api.search(S.root, q, opts);
  // unsaved buffers win over disk contents
  const dirty = [...S.docs.values()].filter(isDirty);
  if (dirty.length) {
    results = results.filter(r => !dirty.some(d => norm(d.path) === norm(r.file)));
    let re;
    try {
      const src = opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(opts.word ? `\\b${src}\\b` : src, opts.caseSensitive ? 'g' : 'gi');
    } catch { re = null; }
    if (re) for (const d of dirty) {
      const matches = [];
      d.model.getLinesContent().forEach((l, i) => { re.lastIndex = 0; let m; while ((m = re.exec(l))) { matches.push({ line: i + 1, col: m.index + 1, len: m[0].length || 1, text: l }); if (!m[0].length) re.lastIndex++; } });
      if (matches.length) results.push({ file: d.path, matches });
    }
  }
  const total = results.reduce((a, r) => a + r.matches.length, 0);
  $('#find-summary').textContent = total ? `${total} result${total > 1 ? 's' : ''} in ${results.length} file${results.length > 1 ? 's' : ''}` : 'No results';
  $('#replace-all').disabled = !total;
  $('#replace-all').disabled = !total;
  const out = [];
  for (const r of results) {
    out.push(`<div class="group-row"><span class="badge">${fileBadge(basename(r.file), 'file')}</span>${esc(basename(r.file))}<span class="count">${r.matches.length}</span></div>`);
    for (const m of r.matches.slice(0, 200)) {
      const start = Math.max(0, m.col - 1 - 30);
      const pre = m.text.slice(start, m.col - 1).replace(/^\s+/, '');
      const hit = m.text.substr(m.col - 1, m.len);
      const post = m.text.slice(m.col - 1 + m.len, m.col - 1 + m.len + 80);
      out.push(`<div class="item-row" data-open="${esc(r.file)}" data-line="${m.line}" data-col="${m.col}" data-len="${m.len}"><div class="txt"><div class="ln">${esc(pre)}<mark>${esc(hit)}</mark>${esc(post)}</div></div></div>`);
    }
  }
  $('#find-results').innerHTML = out.join('');
}
$('#find-input').addEventListener('keydown', e => { if (e.key === 'Enter') runFind(); });
['#find-case', '#find-word', '#find-regex'].forEach(id => $(id).addEventListener('change', runFind));

// Find ▸ Replace mode (Xcode: click "Find" in the navigator's header)
function setFindMode(mode) {
  const rep = mode === 'replace';
  $('#find-mode-op').textContent = rep ? 'Replace' : 'Find';
  $('#replace-wrap').hidden = !rep;
  $('#replace-row').hidden = !rep;
}
$('#find-mode-op').onclick = async e => {
  const r = e.target.getBoundingClientRect();
  const id = await api.popupMenu([{ id: 'find', label: 'Find', checked: $('#replace-wrap').hidden }, { id: 'replace', label: 'Replace', checked: !$('#replace-wrap').hidden }], r.left, r.bottom + 2);
  if (id) setFindMode(id);
};
$('#find-mode-match').onclick = async e => {
  const r = e.target.getBoundingClientRect();
  const modes = [['contains', 'Containing'], ['word', 'Matching Word'], ['regex', 'Regular Expression']];
  const id = await api.popupMenu(modes.map(([k, l]) => ({ id: k, label: l, checked: $('#find-mode-match').textContent === l })), r.left, r.bottom + 2);
  if (!id) return;
  $('#find-word').checked = id === 'word';
  $('#find-regex').checked = id === 'regex';
  syncFindModeLabel();
  runFind();
};
function syncFindModeLabel() {
  $('#find-mode-match').textContent = $('#find-regex').checked ? 'Regular Expression' : $('#find-word').checked ? 'Matching Word' : 'Containing';
}
['#find-word', '#find-regex'].forEach(id => $(id).addEventListener('change', syncFindModeLabel));
$('#replace-input').addEventListener('keydown', e => { if (e.key === 'Enter') replaceAllInProject(); });
$('#replace-all').onclick = () => replaceAllInProject();

async function replaceAllInProject() {
  const q = $('#find-input').value;
  if (!S.root || !q) return;
  const withText = $('#replace-input').value;
  const opts = { caseSensitive: $('#find-case').checked, word: $('#find-word').checked, regex: $('#find-regex').checked };
  let re;
  try {
    const src = opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(opts.word ? `\\b${src}\\b` : src, opts.caseSensitive ? 'g' : 'gi');
  } catch (e) { toast('Invalid regular expression'); return; }
  const results = await api.search(S.root, q, opts);
  const files = new Set(results.map(r => r.file));
  for (const d of S.docs.values()) if (isDirty(d)) files.add(d.path);
  let count = 0, nfiles = 0;
  for (const f of files) {
    const doc = await ensureDoc(f);
    if (!doc || doc.kind !== 'file') continue;
    const model = doc.model;
    const edits = [];
    model.getLinesContent().forEach((line, i) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        const text = opts.regex ? m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), withText) : withText;
        edits.push({ range: new monaco.Range(i + 1, m.index + 1, i + 1, m.index + 1 + m[0].length), text });
      }
    });
    if (!edits.length) continue;
    model.pushStackElement();
    model.pushEditOperations([], edits, () => null);
    model.pushStackElement();
    await saveDoc(doc);
    count += edits.length; nfiles++;
  }
  toast(count ? `Replaced ${count} occurrence${count > 1 ? 's' : ''} in ${nfiles} file${nfiles > 1 ? 's' : ''}` : 'Nothing to replace');
  runFind();
}

// issue navigator
function renderIssues() {
  const host = $('#issue-list');
  const filter = $('#nav-filter').value.trim().toLowerCase();
  const list = allIssues().filter(d => d.severity !== 'note' && (!filter || d.message.toLowerCase().includes(filter)));
  if (!list.length) {
    host.innerHTML = `<div class="nav-empty">${S.lastStatus === 'failed' ? 'Build failed without diagnostics.<br>See the Report navigator for the full log.' : 'No Issues'}</div>`;
    return;
  }
  const groups = new Map();
  for (const d of list) {
    const k = d.file && d.inProject ? d.file : '(General)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const out = [];
  for (const [file, ds] of groups) {
    const name = file === '(General)' ? S.name : basename(file);
    out.push(`<div class="group-row"><span class="badge">${file === '(General)' ? FILE_BADGES.project : fileBadge(name, 'file')}</span>${esc(name)}<span class="count">${ds.length}</span></div>`);
    for (const d of ds) {
      const open = file !== '(General)' ? `data-open="${esc(d.file)}" data-line="${d.line}" data-col="${d.col}"` : '';
      out.push(`<div class="item-row" ${open}><span class="sev-${d.severity}">${icon(d.severity === 'error' ? 'xmarkCircle' : 'warning')}</span>
        <div class="txt"><div>${esc(d.message)}</div>${d.line ? `<div class="sub">Line ${d.line}</div>` : ''}</div></div>`);
    }
  }
  host.innerHTML = out.join('');
}

// report navigator
function renderReports() {
  const host = $('#report-list');
  if (!S.reports.length) { host.innerHTML = '<div class="nav-empty">No Reports</div>'; return; }
  host.innerHTML = S.reports.map(r => {
    const st = r.ok === null ? `<span style="color:var(--accent)">${icon('hammer')}</span>` : r.ok ? `<span style="color:var(--green)">${icon('checkCircle')}</span>` : `<span style="color:var(--red)">${icon('xmarkCircle')}</span>`;
    const what = r.action === 'run' ? 'Run' : 'Build';
    const res = r.ok === null ? 'In progress' : r.ok ? 'Succeeded' : 'Failed';
    return `<div class="report-row" data-report="${r.id}">${st}<div><div>${what} ${esc(r.name)}</div><div class="sub">${res} · ${timeLabel(r.start)}</div></div></div>`;
  }).join('');
}
$('#report-list').addEventListener('click', e => {
  const row = e.target.closest('[data-report]');
  if (!row) return;
  $$('#report-list .selected').forEach(x => x.classList.remove('selected'));
  row.classList.add('selected');
  openReport(S.reports.find(r => r.id === +row.dataset.report));
});

function openReport(r) {
  if (!r) return;
  const key = `swiftcode-log:/report-${r.id}`;
  let doc = S.docs.get(key);
  if (!doc) {
    const model = monaco.editor.createModel(r.log.join('\n'), 'plaintext', monaco.Uri.parse(key));
    doc = { key, kind: 'log', title: `${r.action === 'run' ? 'Run' : 'Build'} ${r.name} · ${timeLabel(r.start).replace('Today at ', '')}`, model, report: r };
    S.docs.set(key, doc);
    r.doc = doc;
  }
  activate(key);
}

// ======================================================================== diagnostics

function applyDiagnostics() {
  for (const doc of S.docs.values()) applyDiagsToDoc(doc);
  renderIssues();
  renderTree();
  updateActivityIssues();
}
const applyDiagnosticsSoon = debounce(applyDiagnostics, 120);

function applyDiagsToDoc(doc) {
  if (!monaco || doc.kind !== 'file') return;
  const n = norm(doc.path);
  const model = doc.model;
  const live = typeof LSP !== 'undefined' && setting('liveIssues') !== false ? LSP.diags.get(n) : null;
  const list = (live || S.diags.filter(d => d.file && norm(d.file) === n)).filter(d => d.severity !== 'note' && d.line > 0);
  const lines = model.getLineCount();
  monaco.editor.setModelMarkers(model, 'swiftc', list.map(d => {
    const line = Math.min(d.line, lines);
    const word = model.getWordAtPosition({ lineNumber: line, column: Math.max(1, d.col) });
    let endLine = line, endCol = word ? word.endColumn : (d.col || 1) + 1;
    if (d.endLine && (d.endLine > d.line || d.endCol > d.col)) { endLine = Math.min(d.endLine, lines); endCol = d.endCol; }
    return {
      severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message, source: d.live ? 'SourceKit' : 'swiftc',
      startLineNumber: line, startColumn: d.col || 1, endLineNumber: endLine, endColumn: endCol,
    };
  }));
  const byLine = new Map();
  for (const d of list) {
    const prev = byLine.get(d.line);
    if (!prev || (d.severity === 'error' && prev.severity !== 'error')) byLine.set(d.line, d);
  }
  const decos = [...byLine.values()].map(d => {
    const line = Math.min(d.line, lines);
    const sev = d.severity === 'error' ? 'error' : 'warning';
    const more = list.filter(x => x.line === d.line).length - 1;
    return {
      range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: `xc-line-${sev}`,
        glyphMarginClassName: `xc-glyph-${sev}`,
        glyphMarginHoverMessage: { value: list.filter(x => x.line === d.line).map(x => x.message).join('\n\n') },
        after: { content: d.message + (more > 0 ? `  (+${more})` : ''), inlineClassName: `xc-inline-${sev}` },
        overviewRuler: { color: sev === 'error' ? '#ff453a' : '#ffd60a', position: monaco.editor.OverviewRulerLane.Right },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    };
  });
  doc.issueDecos = model.deltaDecorations(doc.issueDecos || [], decos);
}

function clearDiagnostics() {
  S.diags = [];
  // live issues from SourceKit stay; only the build's issues go away
  for (const doc of S.docs.values()) if (doc.kind === 'file') applyDiagsToDoc(doc);
  renderIssues();
  renderTree();
  updateActivityIssues();
}

async function jumpToIssue(delta) {
  const list = allIssues().filter(d => d.inProject && d.severity !== 'note' && d.line > 0);
  if (!list.length) { toast('No Issues'); return; }
  S.issueIdx = ((S.issueIdx ?? -1) + delta + list.length) % list.length;
  const d = list[S.issueIdx];
  await openFile(d.file, { line: d.line, col: d.col });
}

// ======================================================================== activity view / status

function setStatus(kind, extra = {}) {
  const act = $('#activity');
  const text = $('#act-text');
  const time = $('#act-time');
  act.classList.toggle('busy', kind === 'building');
  const now = new Date();
  const n = esc(S.name);
  switch (kind) {
    case 'none': text.innerHTML = 'WinSwift Studio'; time.textContent = ''; break;
    case 'ready': text.innerHTML = `<b>${n}</b>: Ready`; time.textContent = '| ' + timeLabel(now); break;
    case 'building': text.innerHTML = `Building <b>${n}</b>…`; time.textContent = ''; break;
    case 'succeeded': text.innerHTML = '<b>Build Succeeded</b>'; time.textContent = '| ' + timeLabel(now); break;
    case 'failed': text.innerHTML = '<b>Build Failed</b>'; time.textContent = '| ' + timeLabel(now); break;
    case 'running': text.innerHTML = `Running <b>${n}</b> on ${esc(S.device)}`; time.textContent = ''; break;
    case 'paused': text.innerHTML = `Running <b>${n}</b> on ${esc(S.device)}`; time.textContent = '| Paused'; break;
    case 'finished': text.innerHTML = `Finished running <b>${n}</b> on ${esc(S.device)}`; time.textContent = ''; break;
    case 'phase': text.innerHTML = `${esc(extra.text)}…`; time.textContent = ''; act.classList.add('busy'); break;
    case 'stopped': text.innerHTML = `<b>${n}</b>: Stopped`; time.textContent = '| ' + timeLabel(now); break;
    case 'cleaned': text.innerHTML = '<b>Clean Finished</b>'; time.textContent = '| ' + timeLabel(now); break;
    case 'notoolchain': text.innerHTML = '<b>Swift toolchain not found</b>'; time.textContent = ''; break;
  }
  if (kind === 'succeeded' || kind === 'failed') S.lastStatus = kind;
  updateActivityIssues();
}

function updateActivityIssues() {
  const issues = allIssues();
  const errs = issues.filter(d => d.severity === 'error').length;
  const warns = issues.filter(d => d.severity === 'warning').length;
  $('#act-issues').innerHTML =
    (warns ? `<span class="warn" title="${warns} warning${warns > 1 ? 's' : ''}">${icon('warning')}${warns}</span>` : '') +
    (errs ? `<span class="err" title="${errs} error${errs > 1 ? 's' : ''}">${icon('xmarkCircle')}${errs}</span>` : '');
}
$('#act-issues').addEventListener('click', () => showNav('issues'));

function updateRunButtons() {
  $('#btn-stop').disabled = !(S.building || S.running);
  appEl.classList.toggle('running', S.running);
}

// ======================================================================== build & run

function setDestination(ios, device) {
  S.ios = !!ios;
  if (ios && device) S.simModel = device;
  S.device = ios ? (device || S.simModel || 'iPhone 16 Pro') : 'My PC';
  $('#scheme-device').textContent = S.device;
  const ic = $('#scheme-device-icon');
  ic.innerHTML = icon(ios ? 'iphone' : 'pc');
  $('#scheme').querySelector('.scheme-icon').innerHTML = icon(ios ? 'appIcon' : 'terminalApp');
}

/** Product ▸ Destination: switch the simulated iPhone model (the simulator, the Canvas and a running app follow). */
async function setSimDevice(name) {
  if (!SIM_DEVICES.some(d => d.name === name)) return;
  const model = await api.setSimModel(name);
  onSimModel(model);
}
function onSimModel(model) {
  S.simModel = model;
  if (S.ios) setDestination(true, model);
  const label = $('#cv-device span:last-child');
  if (label) label.textContent = model;
  cvPost('model', model);
  if (canvasShown()) refreshCanvas({ force: true });
}
api.on('sim:modelChanged', onSimModel);

async function runAction(action, extra = {}) {
  if (!S.root) { toast('Open a project first'); return; }
  if (S.building || S.running) await api.stop();
  if (setting('saveBeforeRun') !== false) await saveAll();
  clearDiagnostics();
  const report = { id: ++S.reportSeq, action, name: S.name, start: new Date(), log: [], ok: null };
  S.reports.unshift(report);
  S.currentReport = report;
  S.building = true;
  updateRunButtons();
  setStatus('building');
  renderReports();
  if (action === 'run') {
    consoleClear();
    if (appEl.classList.contains('hide-debug') && setting('showDebugOnRun') !== false) toggleDebug(true);
  }
  // like Xcode's Debug scheme: Run launches under LLDB unless Edit Scheme ▸ Info ▸ Debug executable is off
  const debug = action === 'run' && !S.isPackage && !extra.noDebug;
  api.build({ root: S.root, action, preview: extra.preview, debug, breakpoints: debug ? breakpointsForRun() : [] });
}

async function previewAction() {
  const doc = activeDoc();
  if (!doc || doc.kind !== 'file' || !/#Preview\b/.test(doc.model.getValue())) {
    toast('This file has no #Preview');
    return;
  }
  runAction('run', { preview: { file: doc.path, index: 0 } });
}

api.on('app:command', id => runCommand(id));

function finishBuildLog(r) {
  if (r?.doc && !r.doc.model.isDisposed()) {
    const m = r.doc.model;
    m.setValue(r.log.join('\n'));
  }
}

api.on('build:event', ev => {
  const r = S.currentReport;
  switch (ev.type) {
    case 'toolchain-missing':
      S.building = false;
      updateRunButtons();
      setStatus('notoolchain');
      showOverlay('toolchain-sheet');
      if (r) { r.ok = false; r.log.push('error: Swift toolchain not found'); renderReports(); }
      break;
    case 'build-start':
      if (r && ev.toolchain) r.log.push(`Swift ${ev.toolchain} · ${S.isPackage ? 'Swift Package' : 'Project'} ${S.name}`);
      break;
    case 'platform':
      setDestination(ev.ios, ev.device);
      break;
    case 'phase':
      if (ev.text) setStatus('phase', { text: ev.text });
      else if (S.building) setStatus('building');
      else if (!S.running && S.root) setStatus('ready');
      break;
    case 'log':
      if (r) { r.log.push(ev.text); if (r.doc) appendLog(r.doc, ev.text); }
      break;
    case 'diag': {
      const inProject = !!(ev.file && S.root && norm(ev.file).startsWith(norm(S.root)) && !norm(ev.file).includes('\\.build\\'));
      if (ev.severity === 'note' && !inProject) break;
      S.diags.push({ ...ev, inProject, file: inProject ? ev.file : null });
      applyDiagnosticsSoon();
      break;
    }
    case 'build-end':
      S.building = false;
      if (r) { r.ok = ev.ok; r.log.push(ev.ok ? `\nBuild succeeded in ${(ev.ms / 1000).toFixed(1)} s` : '\nBuild failed'); finishBuildLog(r); }
      if (!ev.ok && !S.diags.length) S.diags.push({ severity: 'error', message: 'Build failed — see the build log in the Report navigator', inProject: false, line: 0 });
      applyDiagnostics();
      setStatus(ev.ok ? 'succeeded' : 'failed');
      renderReports();
      if (!ev.ok) {
        showNav('issues');
        const first = S.diags.find(d => d.inProject && d.severity === 'error');
        if (first) { S.issueIdx = S.diags.filter(d => d.inProject && d.severity !== 'note' && d.line > 0).indexOf(first); openFile(first.file, { line: first.line, col: first.col }); }
      }
      updateRunButtons();
      break;
    case 'running':
      S.running = true;
      appEl.classList.toggle('ios-run', !!ev.ios);
      setStatus('running');
      $('#dbg-process').textContent = `${S.name}  ·  PID ${ev.pid}`;
      $('#dbg-process').dataset.pid = ev.pid;
      renderDebugNav();
      updateRunButtons();
      break;
    case 'stdout': consoleWrite(ev.text, ''); break;
    case 'stderr': {
      consoleWrite(ev.text, 'c-err');
      const fatal = /Fatal error: ?([^\n]*)/.exec(ev.text);
      if (fatal) S.lastFatal = `Fatal error: ${fatal[1].replace(/^.*?\.swift:\d+: ?/, '') || 'crash'}`;
      break;
    }
    case 'exit':
      consoleWrite(`\nProgram ended with exit code: ${ev.code}\n`, 'c-sys');
      S.running = false;
      setStatus(S.stopRequested ? 'stopped' : 'finished');
      S.stopRequested = false;
      $('#dbg-process').textContent = '';
      updateRunButtons();
      break;
    case 'done':
      S.building = false;
      S.running = false;
      updateRunButtons();
      renderReports();
      break;
  }
});

function appendLog(doc, text) {
  const m = doc.model;
  if (m.isDisposed()) return;
  const end = m.getFullModelRange().getEndPosition();
  m.applyEdits([{ range: new monaco.Range(end.lineNumber, end.column, end.lineNumber, end.column), text: (m.getValueLength() ? '\n' : '') + text }]);
}

async function stopAction() {
  if (!(S.building || S.running)) return;
  S.stopRequested = true;
  await api.stop();
  if (S.building) { S.building = false; setStatus('stopped'); }
  updateRunButtons();
}

async function cleanAction() {
  if (!S.root) return;
  if (S.building || S.running) await api.stop();
  await api.cleanBuild(S.root);
  clearDiagnostics();
  setStatus('cleaned');
  toast('Clean Finished');
}

$('#btn-run').onclick = () => runAction('run');
$('#btn-stop').onclick = () => stopAction();

// ======================================================================== console

const CON_MAX = 400000;
let conLen = 0;
function consoleWrite(text, cls) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '');
  if (!text) return;
  const out = $('#console-out');
  const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 8;
  const last = out.lastElementChild;
  if (last && last.dataset.cls === cls) last.appendChild(document.createTextNode(text));
  else {
    const span = document.createElement('span');
    span.dataset.cls = cls;
    if (cls) span.className = cls;
    span.textContent = text;
    out.appendChild(span);
  }
  conLen += text.length;
  while (conLen > CON_MAX && out.firstElementChild) { conLen -= out.firstElementChild.textContent.length; out.firstElementChild.remove(); }
  if ($('#console-filter').value) applyConsoleFilter();
  if (atBottom) out.scrollTop = out.scrollHeight;
}
function consoleClear() { $('#console-out').innerHTML = ''; conLen = 0; }
function applyConsoleFilter() {
  const f = $('#console-filter').value.toLowerCase();
  const out = $('#console-out');
  if (!f) { out.querySelectorAll('.filtered-view').forEach(x => x.remove()); [...out.children].forEach(c => c.classList.remove('hidden')); return; }
  const text = [...out.children].filter(c => !c.classList.contains('filtered-view')).map(c => c.textContent).join('');
  [...out.children].forEach(c => c.classList.add('hidden'));
  let view = out.querySelector('.filtered-view');
  if (!view) { view = document.createElement('div'); view.className = 'filtered-view'; out.appendChild(view); }
  view.classList.remove('hidden');
  view.textContent = text.split('\n').filter(l => l.toLowerCase().includes(f)).join('\n');
}
$('#console-filter').addEventListener('input', applyConsoleFilter);
$('#console-clear').onclick = consoleClear;
$('#console-in').addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    const v = e.target.value;
    e.target.value = '';
    if (DBG.paused) { if (v.trim()) lldbEvaluate(v.trim()); return; }
    consoleWrite(v + '\n', 'c-in');
    const ok = await api.stdin(v + '\n');
    if (!ok) toast('No program is running');
  } else if (e.key === 'd' && e.ctrlKey) {
    e.preventDefault();
    api.eof();
    consoleWrite('^D\n', 'c-in');
  }
});
$('#console-out').addEventListener('click', () => { if (S.running && !window.getSelection().toString()) $('#console-in').focus(); });

// ======================================================================== inspector & quick help

function renderInspector() {
  const host = $('#insp-file');
  const doc = activeDoc();
  if (!doc || doc.kind !== 'file') { host.innerHTML = '<div class="insp-empty">No Selection</div>'; return; }
  const name = basename(doc.path);
  const TYPES = [[/\.swift$/i, 'Swift Source'], [/\.strings$/i, 'Localizable Strings'], [/\.stringsdict$/i, 'Strings Dictionary'], [/\.xcstrings$/i, 'String Catalog'], [/\.plist$/i, 'Property List XML'], [/\.json$/i, 'JSON'], [/\.md$/i, 'Markdown Text']];
  const type = 'Default - ' + ((TYPES.find(([re]) => re.test(name)) || [])[1] || languageFor(name));
  const eol = doc.model.getEOL() === '\r\n' ? 'CRLF' : 'LF';
  const opts = doc.model.getOptions();
  const wrap = editor.getOption(monaco.editor.EditorOption.wordWrap) !== 'off';
  host.innerHTML = `
    <div class="insp-section"><h3>Identity and Type</h3>
      <div class="insp-grid">
        <label>Name</label><div class="val">${esc(name)}</div>
        <label>Type</label><div class="val dim">${esc(type)}</div>
        <label>Location</label><div class="val dim">Relative to Group</div>
        <label>Full Path</label><div class="val dim" style="font-size:11px">${esc(doc.path)}</div>
        <label></label><div><span class="insp-link" id="insp-reveal">Show in Explorer</span></div>
      </div></div>
    <div class="insp-section"><h3>Text Settings</h3>
      <div class="insp-grid">
        <label>Text Encoding</label><div class="val dim">Unicode (UTF-8)</div>
        <label>Line Endings</label><select id="insp-eol"><option value="LF" ${eol === 'LF' ? 'selected' : ''}>macOS / Unix (LF)</option><option value="CRLF" ${eol === 'CRLF' ? 'selected' : ''}>Windows (CRLF)</option></select>
        <label>Indent Using</label><select id="insp-indent"><option value="spaces" ${opts.insertSpaces ? 'selected' : ''}>Spaces</option><option value="tabs" ${!opts.insertSpaces ? 'selected' : ''}>Tabs</option></select>
        <label>Widths</label><div style="display:flex;gap:8px;align-items:center"><input type="number" id="insp-tab" min="1" max="16" value="${opts.tabSize}"><span class="val dim">Tab</span></div>
        <label></label><label style="text-align:left;color:var(--text)"><input type="checkbox" id="insp-wrap" ${wrap ? 'checked' : ''}> Wrap lines</label>
      </div></div>
    <div class="insp-section" id="insp-loc"></div>
    <div class="insp-section"><h3>Target Membership</h3>
      <label class="insp-check"><input type="checkbox" checked disabled> <span class="badge">${FILE_BADGES.app}</span> ${esc(S.name)}</label></div>
    <div class="insp-section"><h3>Statistics</h3>
      <div class="insp-grid">
        <label>Lines</label><div class="val dim">${doc.model.getLineCount()}</div>
        <label>Characters</label><div class="val dim">${doc.model.getValueLength()}</div>
      </div></div>`;
  renderLocalizationSection($('#insp-loc'), doc);
  $('#insp-reveal').onclick = () => api.reveal(doc.path);
  $('#insp-eol').onchange = e => { doc.model.pushEOL(e.target.value === 'CRLF' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF); };
  $('#insp-indent').onchange = e => doc.model.updateOptions({ insertSpaces: e.target.value === 'spaces' });
  $('#insp-tab').onchange = e => doc.model.updateOptions({ tabSize: Math.max(1, Math.min(16, +e.target.value || 4)), indentSize: Math.max(1, Math.min(16, +e.target.value || 4)) });
  $('#insp-wrap').onchange = e => { editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' }); setSetting('wrap', e.target.checked); };
}

let quickHelpSeq = 0;
async function renderQuickHelp() {
  if (S.insp !== 'help') return;
  const host = $('#insp-help');
  const doc = activeDoc();
  const pos = editor?.getPosition();
  const w = doc && doc.model && pos ? doc.model.getWordAtPosition(pos) : null;
  if (!w) { host.innerHTML = '<div class="insp-empty">No Quick Help</div>'; return; }
  // SourceKit knows the declaration and its documentation comment, like Xcode's Quick Help
  const seq = ++quickHelpSeq;
  const md = doc.kind === 'file' ? await lspQuickHelp(doc, pos) : null;
  if (seq !== quickHelpSeq) return;
  if (md) {
    const docsUrl = `https://developer.apple.com/search/?q=${encodeURIComponent(w.word)}`;
    host.innerHTML = `<div class="insp-section qh"><div class="qh-title">${esc(w.word)}</div>${markdownToHtml(md)}
      <div class="qh-links"><span class="insp-link" id="qh-docs">Open in Developer Documentation</span></div></div>`;
    $('#qh-docs').onclick = () => api.openExternal(docsUrl);
    return;
  }
  let help = swiftQuickHelp(w.word);
  if (!help) {
    for (const d of S.docs.values()) {
      const s = currentSymbols(d).find(x => x.name === w.word);
      if (s) { help = { name: s.name, signature: s.signature, summary: `Declared in ${basename(d.path)}, line ${s.line}.`, kind: 'Project Symbol' }; break; }
    }
  }
  if (!help) { host.innerHTML = '<div class="insp-empty">No Quick Help</div>'; return; }
  host.innerHTML = `<div class="insp-section"><div class="qh-title">${esc(help.name)}</div><div class="qh-code">${esc(help.signature)}</div>
    <div class="qh-body">${esc(help.summary)}</div><div class="qh-kind">${esc(help.kind)}</div></div>`;
}

$('#insp-tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  S.insp = b.dataset.insp;
  $$('#insp-tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.insp-panel').forEach(p => p.classList.toggle('active', p.dataset.inspPanel === S.insp));
  renderInspector();
  renderQuickHelp();
});

// ======================================================================== layout: panels & splitters

function applyLayout() {
  const r = document.documentElement.style;
  r.setProperty('--nav-w', setting('navW') + 'px');
  r.setProperty('--insp-w', setting('inspW') + 'px');
  r.setProperty('--debug-h', setting('debugH') + 'px');
  r.setProperty('--vars-w', setting('varsW') + '%');
  r.setProperty('--canvas-w', (setting('canvasW') || 380) + 'px');
  appEl.classList.toggle('hide-nav', setting('hideNav'));
  appEl.classList.toggle('hide-insp', setting('hideInsp'));
  appEl.classList.toggle('hide-debug', setting('hideDebug'));
  $('#btn-nav').classList.toggle('active', !setting('hideNav'));
  $('#btn-insp').classList.toggle('active', !setting('hideInsp'));
}

function toggleNavigator(force) {
  const show = force !== undefined ? force : appEl.classList.contains('hide-nav');
  setSetting('hideNav', !show);
  applyLayout();
}
function toggleInspector(force) {
  const show = force !== undefined ? force : appEl.classList.contains('hide-insp');
  setSetting('hideInsp', !show);
  applyLayout();
}
function toggleDebug(force) {
  const show = force !== undefined ? force : appEl.classList.contains('hide-debug');
  setSetting('hideDebug', !show);
  applyLayout();
}
$('#btn-nav').onclick = () => toggleNavigator();
$('#btn-insp').onclick = () => toggleInspector();
$('#dbg-toggle').onclick = () => toggleDebug(false);

function makeSplitter(el, { axis, get, set, min, max, invert, percentOf }) {
  el.addEventListener('mousedown', e => {
    e.preventDefault();
    const start = axis === 'x' ? e.clientX : e.clientY;
    const startVal = get();
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    const move = ev => {
      let d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
      if (invert) d = -d;
      if (percentOf) d = (d / percentOf().getBoundingClientRect().width) * 100;
      set(Math.max(min, Math.min(max, startVal + d)), false);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      set(get(), true);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
function cssNum(v) { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)); }
makeSplitter($('#split-nav'), { axis: 'x', min: 180, max: 520, get: () => cssNum('--nav-w'), set: (v, save) => { document.documentElement.style.setProperty('--nav-w', v + 'px'); if (save) setSetting('navW', v); } });
makeSplitter($('#split-insp'), { axis: 'x', invert: true, min: 200, max: 520, get: () => cssNum('--insp-w'), set: (v, save) => { document.documentElement.style.setProperty('--insp-w', v + 'px'); if (save) setSetting('inspW', v); } });
makeSplitter($('#split-debug'), { axis: 'y', invert: true, min: 90, max: 700, get: () => cssNum('--debug-h'), set: (v, save) => { document.documentElement.style.setProperty('--debug-h', v + 'px'); if (save) setSetting('debugH', v); } });
makeSplitter($('#split-vars'), { axis: 'x', min: 10, max: 80, percentOf: () => $('.debug-body'), get: () => cssNum('--vars-w'), set: (v, save) => { document.documentElement.style.setProperty('--vars-w', v + '%'); if (save) setSetting('varsW', v); } });

// ======================================================================== overlays

function showOverlay(id) { $('#' + id).classList.add('show'); }
function hideOverlay(id) { $('#' + id).classList.remove('show'); }
const overlayOpen = () => $$('.overlay.show').length > 0;

$$('.overlay').forEach(o => o.addEventListener('mousedown', e => {
  if (e.target === o && o.id !== 'welcome' && o.id !== 'template-sheet') hideOverlay(o.id);
}));

// --- welcome
async function showWelcome() {
  renderRecent();
  const v = await api.version();
  $('#welcome-version').textContent = `Version ${v}`;
  showOverlay('welcome');
  updateToolchainLabel();
}

function renderRecent() {
  const host = $('#recent-list');
  const list = P.recent || [];
  if (!list.length) { host.innerHTML = '<div class="recent-empty">No Recent Projects</div>'; return; }
  host.innerHTML = list.map((r, i) => `<div class="recent-row" data-i="${i}" title="${esc(r.path)}">
    <span class="rbadge">${r.isPackage ? FILE_BADGES.package : FILE_BADGES.project}</span>
    <div><div class="rname">${esc(r.name)}</div><div class="rpath">${esc(r.path)}</div></div></div>`).join('');
}
$('#recent-list').addEventListener('click', e => {
  const row = e.target.closest('.recent-row');
  if (!row) return;
  $$('#recent-list .selected').forEach(x => x.classList.remove('selected'));
  row.classList.add('selected');
  if (e.detail >= 1) openProject(P.recent[+row.dataset.i].path);
});
$('#recent-list').addEventListener('contextmenu', async e => {
  const row = e.target.closest('.recent-row');
  if (!row) return;
  const r = P.recent[+row.dataset.i];
  const id = await api.popupMenu([{ id: 'open', label: 'Open' }, { id: 'explorer', label: 'Show in Explorer' }, { type: 'separator' }, { id: 'remove', label: 'Remove from Recent Projects' }], e.clientX, e.clientY);
  if (id === 'open') openProject(r.path);
  if (id === 'explorer') api.reveal(r.path);
  if (id === 'remove') removeRecent(r.path);
});
$('#welcome-close').onclick = () => { if (S.root) hideOverlay('welcome'); else api.quit(); };
$('.welcome-actions').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.action === 'new-project') cmdNewProject();
  if (b.dataset.action === 'example') cmdNewProject('ios-sample');
  if (b.dataset.action === 'open') cmdOpen();
});

async function updateToolchainLabel(refresh) {
  const tc = S.toolchain = await api.toolchain(refresh);
  const el = $('#welcome-toolchain');
  if (tc.found) {
    el.innerHTML = `<span class="ok">●</span> Swift ${esc(tc.version || '')} toolchain ready`;
    $('#tb-project-sub').textContent = S.root ? `Swift ${tc.version || ''} · My PC` : 'No Project';
  } else {
    el.innerHTML = `<span class="bad">●</span> Swift toolchain not installed — <a id="tc-link">How to install</a>`;
    $('#tc-link').onclick = () => showOverlay('toolchain-sheet');
    $('#tb-project-sub').textContent = S.root ? 'No Swift toolchain' : 'No Project';
  }
}

$('#tc-close').onclick = () => hideOverlay('toolchain-sheet');
$('#tc-download').onclick = () => api.openExternal('https://www.swift.org/install/windows/');
$('#tc-retry').onclick = async () => {
  await updateToolchainLabel(true);
  if (S.toolchain.found) { hideOverlay('toolchain-sheet'); toast(`Found Swift ${S.toolchain.version}`); setStatus(S.root ? 'ready' : 'none'); }
  else toast('Still no Swift toolchain on PATH');
};
$('#tc-install').onclick = async () => {
  const ok = await api.installToolchain();
  toast(ok ? 'The installer window is open — press Retry when it finishes' : 'Opened swift.org', 5000);
  // keep checking while the installer runs, like Xcode's "Downloading components"
  clearInterval(S.tcPoll);
  let n = 0;
  S.tcPoll = setInterval(async () => {
    if (++n > 180) { clearInterval(S.tcPoll); return; }
    const tc = await api.toolchain(true);
    if (tc.found) {
      clearInterval(S.tcPoll);
      await updateToolchainLabel(true);
      hideOverlay('toolchain-sheet');
      toast(`Swift ${tc.version} is ready — press Ctrl+R to run`, 5000);
      setStatus(S.root ? 'ready' : 'none');
    }
  }, 10000);
};

// ======================================================================== updates (GitHub releases)

const newerVersion = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};
async function checkForUpdates(manual) {
  const u = await api.checkUpdate();
  if (!u || !u.latest) { if (manual) toast('Could not reach GitHub — check your internet connection'); return; }
  if (!newerVersion(u.latest, u.current)) { if (manual) toast(`WinSwift Studio ${u.current} is up to date`); S.update = null; renderUpdateBanner(); return; }
  S.update = u;
  renderUpdateBanner();
  if (manual) {
    const r = await api.confirm(`WinSwift Studio ${u.latest} is available`, `You have ${u.current}. Download the installer and run it — your projects and settings stay.`, ['Download', 'Later']);
    if (r === 0) api.openExternal(u.setup || u.url);
  } else toast(`New version ${u.latest} available — Help ▸ Check for Updates…`, 6000);
}
function renderUpdateBanner() {
  const el = $('#welcome-update');
  if (!el) return;
  el.hidden = !S.update;
  if (S.update) el.innerHTML = `${icon('sparkles')} WinSwift Studio ${esc(S.update.latest)} is available — <a>Download</a>`;
}
$('#welcome-update').addEventListener('click', () => { if (S.update) api.openExternal(S.update.setup || S.update.url); });

// --- new project sheet
const TEMPLATES = {
  ios: [
    { id: 'ios-app', name: 'App', icon: 'app', desc: 'This template provides a starting point for a SwiftUI app — the same files Xcode creates. It runs in the iPhone Simulator.' },
    { id: 'ios-sample', name: 'Tabbed App', icon: 'tabs', desc: 'A complete SwiftUI sample: TabView, NavigationStack, List with swipe-to-delete, Form, @Observable model, alerts and @AppStorage.' },
    { id: 'x-doc', name: 'Document App', icon: 'empty', disabled: true },
    { id: 'x-game', name: 'Game', icon: 'empty', disabled: true },
    { id: 'x-ar', name: 'Augmented Reality App', icon: 'empty', disabled: true },
    { id: 'x-playground', name: 'App Playground', icon: 'empty', disabled: true },
  ],
  windows: [
    { id: 'cli', name: 'Command Line Tool', icon: 'cli', desc: 'This template builds a command-line tool that runs in the console. Uses Swift and Foundation.' },
    { id: 'package', name: 'Swift Package', icon: 'pkg', desc: 'A Swift Package with an executable target, built with Swift Package Manager (swift build).' },
    { id: 'example', name: 'Example App', icon: 'example', desc: 'A small command-line project with a few files — protocols, structs, string interpolation and console input.' },
    { id: 'empty', name: 'Empty', icon: 'empty', desc: 'An empty project with a single main.swift file.' },
  ],
};
let npTemplate = 'ios-app';
let npPlatform = 'ios';
const templateById = id => [...TEMPLATES.ios, ...TEMPLATES.windows].find(t => t.id === id);

function renderTemplates() {
  $$('#platform-tabs span').forEach(s => s.classList.toggle('active', s.dataset.platform === npPlatform));
  $('#tpl-grid').innerHTML = TEMPLATES[npPlatform].map(t =>
    `<button class="tpl ${t.id === npTemplate ? 'selected' : ''} ${t.disabled ? 'disabled' : ''}" data-tpl="${t.id}" ${t.disabled ? 'disabled title="Needs Xcode on a Mac — not available in WinSwift Studio"' : ''}><span class="tpl-icon ${t.icon}"></span><span>${esc(t.name)}</span></button>`).join('');
  $('#tpl-desc').textContent = templateById(npTemplate)?.desc || '';
}
$('#platform-tabs').addEventListener('click', e => {
  const s = e.target.closest('[data-platform]');
  if (!s) return;
  npPlatform = s.dataset.platform;
  npTemplate = TEMPLATES[npPlatform][0].id;
  renderTemplates();
});

function cmdNewProject(tpl) {
  npTemplate = tpl || 'ios-app';
  npPlatform = TEMPLATES.ios.some(t => t.id === npTemplate) ? 'ios' : 'windows';
  renderTemplates();
  setNpPage(tpl ? 2 : 1);
  $('#np-name').value = tpl === 'example' ? 'HelloSwift' : tpl === 'ios-sample' ? 'MyTasks' : 'MyApp';
  updateBundle();
  $('#np-error').textContent = '';
  showOverlay('template-sheet');
  if (tpl) setTimeout(() => $('#np-name').select(), 0);
}
function setNpPage(n) {
  $$('#template-sheet .sheet-page').forEach(p => (p.hidden = +p.dataset.page !== n));
  $$('#template-sheet .ios-only').forEach(el => (el.style.display = npPlatform === 'ios' ? '' : 'none'));
  $('#np-prev').hidden = n === 1;
  $('#np-next').textContent = n === 1 ? 'Next' : 'Create…';
  $('#template-sheet').dataset.page = n;
  if (n === 2) setTimeout(() => $('#np-name').focus(), 0);
}
function updateBundle() { $('#np-bundle').textContent = `${$('#np-org').value || 'com.example'}.${$('#np-name').value.replace(/[^A-Za-z0-9_-]/g, '-')}`; }
$('#np-name').addEventListener('input', updateBundle);
$('#np-org').addEventListener('input', updateBundle);
$('#tpl-grid').addEventListener('click', e => {
  const t = e.target.closest('.tpl');
  if (!t) return;
  npTemplate = t.dataset.tpl;
  $$('#tpl-grid .tpl').forEach(x => x.classList.toggle('selected', x === t));
  $('#tpl-desc').textContent = templateById(npTemplate)?.desc || '';
  if (e.detail === 2) setNpPage(2);
});
$('#np-cancel').onclick = () => hideOverlay('template-sheet');
$('#np-prev').onclick = () => setNpPage(1);
$('#np-next').onclick = async () => {
  if ($('#template-sheet').dataset.page === '1') { setNpPage(2); return; }
  const name = $('#np-name').value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9 _-]*$/.test(name)) { $('#np-error').textContent = 'Product name must start with a letter and contain only letters, digits, spaces, - or _.'; return; }
  const location = await api.chooseLocation(name);
  if (!location) return;
  try {
    const res = await api.createProject({ template: npTemplate, name, org: $('#np-org').value.trim(), location });
    hideOverlay('template-sheet');
    await openProject(res.root, { file: res.open });
  } catch (e) {
    $('#np-error').textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
};
$('#template-sheet').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('#np-next').click(); }
  if (e.key === 'Escape') hideOverlay('template-sheet');
});

// --- simple prompt sheet
function promptSheet(title, value, okLabel = 'Create') {
  return new Promise(resolve => {
    $('#prompt-title').textContent = title;
    $('#prompt-ok').textContent = okLabel;
    $('#prompt-error').textContent = '';
    const input = $('#prompt-input');
    input.value = value;
    showOverlay('prompt-sheet');
    setTimeout(() => { input.focus(); const dot = value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : value.length); }, 0);
    const done = v => { hideOverlay('prompt-sheet'); cleanup(); resolve(v); };
    const onKey = e => { if (e.key === 'Enter') done(input.value.trim()); if (e.key === 'Escape') done(null); };
    const ok = () => done(input.value.trim());
    const cancel = () => done(null);
    input.addEventListener('keydown', onKey);
    $('#prompt-ok').addEventListener('click', ok);
    $('#prompt-cancel').addEventListener('click', cancel);
    function cleanup() {
      input.removeEventListener('keydown', onKey);
      $('#prompt-ok').removeEventListener('click', ok);
      $('#prompt-cancel').removeEventListener('click', cancel);
    }
  });
}

async function cmdNewFile() {
  showFileTemplates();
}

async function cmdNewSwiftFile() {
  if (!S.root) { cmdNewProject(); return; }
  const dir = targetDir();
  let name = await promptSheet(`New Swift file in “${basename(dir)}”`, 'File.swift');
  if (!name) return;
  if (!/\.[A-Za-z0-9]+$/.test(name)) name += '.swift';
  try {
    const p = await api.newFile(dir, name, S.name);
    S.expanded.add(dir);
    await loadTree();
    renderTree();
    await openFile(p);
    const m = activeDoc()?.model;
    if (m) editor.setPosition({ lineNumber: m.getLineCount(), column: m.getLineMaxColumn(m.getLineCount()) });
  } catch (e) { toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 3500); }
}

async function cmdNewGroup() {
  if (!S.root) return;
  const dir = targetDir();
  const name = await promptSheet(`New group in “${basename(dir)}”`, 'New Group');
  if (!name) return;
  const p = await api.newFolder(dir, name);
  S.expanded.add(dir);
  S.expanded.add(p);
  S.selected = p;
  await loadTree();
  renderTree();
}

async function cmdOpen() {
  const p = await api.openFolderDialog();
  if (p) openProject(p);
}

async function cmdOpenFile() {
  const p = await api.openFileDialog();
  if (!p) return;
  if (S.root && norm(p).startsWith(norm(S.root) + '\\')) { openFile(p); return; }
  await openProject(dirname(p), { file: p });
}

// --- quick open
let qoItems = [], qoSel = 0, qoAll = [];
async function cmdQuickOpen() {
  if (!S.root) return;
  qoAll = (await api.projectFiles(S.root)).map(p => ({ path: p, name: basename(p), rel: p.slice(S.root.length + 1) }));
  // like Xcode, Open Quickly also finds types, functions and properties declared in the project
  for (const d of S.docs.values()) {
    if (d.kind !== 'file' || d.model.getLanguageId() !== SWIFT_LANG) continue;
    for (const s of currentSymbols(d)) {
      if (s.kind === 'case' || (['let', 'var'].includes(s.kind) && s.depth > 1)) continue;
      qoAll.push({ path: d.path, name: s.name, title: symbolTitle(s), rel: `${basename(d.path)}:${s.line}`, line: s.line, col: s.col, sym: s.kind });
    }
  }
  $('#qo-input').value = '';
  showOverlay('quickopen');
  renderQuickOpen();
  setTimeout(() => $('#qo-input').focus(), 0);
}
function fuzzy(q, s) {
  q = q.toLowerCase(); const t = s.toLowerCase();
  let i = 0, score = 0, last = -1;
  const hits = [];
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) { score += j === last + 1 ? 3 : 1; if (j === 0) score += 2; hits.push(j); last = j; i++; }
  }
  return i === q.length ? { score: score - t.length * 0.01, hits } : null;
}
function renderQuickOpen() {
  const q = $('#qo-input').value.trim();
  qoItems = q ? qoAll.map(f => ({ f, m: fuzzy(q, f.name) })).filter(x => x.m)
                  .map(x => ({ ...x, s: x.m.score + (x.f.name.toLowerCase().startsWith(q.toLowerCase()) ? 5 : 0) + (x.f.sym ? 0 : 0.5) }))
                  .sort((a, b) => b.s - a.s).slice(0, 60)
              : qoAll.filter(f => !f.sym).slice(0, 50).map(f => ({ f, m: { hits: [] } }));
  qoSel = 0;
  $('#qo-list').innerHTML = qoItems.map(({ f, m }, i) => {
    const name = [...f.name].map((c, j) => (m.hits.includes(j) ? `<b>${esc(c)}</b>` : esc(c))).join('') + (f.title && f.title !== f.name ? esc(f.title.slice(f.name.length)) : '');
    const badge = f.sym ? symbolBadge(f.sym) : fileBadge(f.name, 'file');
    return `<div class="qo-row ${i === 0 ? 'selected' : ''}" data-i="${i}"><span class="badge">${badge}</span><div><div class="qn">${name}</div><div class="qp">${esc(f.rel)}</div></div></div>`;
  }).join('') || '<div class="nav-empty">No Matches</div>';
}
$('#qo-input').addEventListener('input', renderQuickOpen);
$('#qo-input').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    qoSel = Math.max(0, Math.min(qoItems.length - 1, qoSel + (e.key === 'ArrowDown' ? 1 : -1)));
    $$('#qo-list .qo-row').forEach((r, i) => r.classList.toggle('selected', i === qoSel));
    $$('#qo-list .qo-row')[qoSel]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter' && qoItems[qoSel]) { hideOverlay('quickopen'); openQuickItem(qoItems[qoSel].f); }
  if (e.key === 'Escape') hideOverlay('quickopen');
});
$('#qo-list').addEventListener('click', e => {
  const r = e.target.closest('.qo-row');
  if (r) { hideOverlay('quickopen'); openQuickItem(qoItems[+r.dataset.i].f); }
});
function openQuickItem(f) {
  openFile(f.path, f.line ? { line: f.line, col: f.col } : {});
}

// --- Library (Xcode's "+" window: Views, Modifiers, Snippets, Symbols, Colors, Images)
let libItems = [], libSel = 0, libTab = 'views';
const LIB_TABS = [
  ['views', 'Views', 'copy'], ['modifiers', 'Modifiers', SF_MAP['slider.horizontal.3']], ['snippets', 'Snippets', 'braces'],
  ['symbols', 'Symbols', 'star'], ['colors', 'Colors', SF_MAP['paintpalette']], ['images', 'Images', 'image'],
];
const LIB_SYSTEM_COLORS = [['red', '#ff3b30'], ['orange', '#ff9500'], ['yellow', '#ffcc00'], ['green', '#34c759'], ['mint', '#00c7be'], ['teal', '#30b0c7'],
  ['cyan', '#32ade6'], ['blue', '#007aff'], ['indigo', '#5856d6'], ['purple', '#af52de'], ['pink', '#ff2d55'], ['brown', '#a2845e'],
  ['gray', '#8e8e93'], ['black', '#000000'], ['white', '#ffffff'], ['primary', '#e5e5ea'], ['secondary', '#8e8e93'], ['accentColor', '#0a84ff'], ['clear', 'transparent']];
const lucideSrc = name => `../node_modules/lucide-static/icons/${name}.svg`;

function snippetPreview(body) {
  // resolve nested placeholders from the inside out
  let prev;
  do { prev = body; body = body.replace(/\$\{\d+:([^{}]*)\}/g, '$1'); } while (body !== prev);
  return body.replace(/\$\{\d+\}|\$0/g, '').replace(/\t/g, '    ');
}
function userSnippets() { return P.snippets || []; }
function cmdLibrary(tab) {
  if (typeof tab === 'string') libTab = tab;
  else if (!S.ios && ['views', 'modifiers', 'symbols', 'colors', 'images'].includes(libTab)) libTab = 'snippets';
  $('#lib-filter').value = '';
  libSel = 0;
  showOverlay('library');
  renderLibrary();
  setTimeout(() => $('#lib-filter').focus(), 0);
}
function projectAssetCatalogs() {
  const out = [];
  (function walk(n) { if (!n) return; if (/\.xcassets$/i.test(n.name || '')) out.push(n.path); else if (n.type === 'dir') n.children.forEach(walk); })(S.tree);
  return out.filter(p => !/Preview Assets/i.test(p));
}
async function libraryItems() {
  switch (libTab) {
    case 'views': return SWIFTUI_VIEWS.map(([label, detail, body]) => ({ title: label, sub: detail, body, glyph: 'V' }));
    case 'modifiers': return SWIFTUI_MODIFIERS.map(([label, detail, body]) => ({ title: label, sub: detail, body, modifier: true, glyph: 'M' }));
    case 'snippets': return [...userSnippets().map((s, i) => ({ title: s.detail || s.label, sub: s.label, body: s.body, user: i, glyph: '{ }' })),
      ...SWIFT_SNIPPETS.filter(s => !s.user).map(s => ({ title: s.detail, sub: s.label, body: s.body, glyph: '{ }' }))];
    case 'symbols': return Object.keys(SF_MAP).map(n => ({ title: n, sub: 'SF Symbol', symbol: n, lucide: SF_MAP[n] }));
    case 'colors': {
      const items = LIB_SYSTEM_COLORS.map(([n, css]) => ({ title: n === 'accentColor' ? 'Accent Color' : n[0].toUpperCase() + n.slice(1), sub: `Color.${n}`, color: css, code: n === 'accentColor' ? 'Color.accentColor' : `Color.${n}` }));
      for (const dir of projectAssetCatalogs()) {
        const walk = list => list.forEach(a => { if (a.kind === 'folder') walk(a.children); else if (a.kind === 'color') items.unshift({ title: a.name, sub: basename(dir), color: colorCss(a.colors[0]), code: `Color("${a.name}")` }); });
        walk(await api.assets(dir));
      }
      return items;
    }
    case 'images': {
      const items = [];
      for (const dir of projectAssetCatalogs()) {
        const walk = list => list.forEach(a => { if (a.kind === 'folder') walk(a.children); else if (a.kind === 'image') items.push({ title: a.name, sub: basename(dir), image: (a.images.find(i => i.path) || {}).path, code: `Image("${a.name}")` }); });
        walk(await api.assets(dir));
      }
      return items;
    }
  }
  return [];
}
let libSeq = 0;
async function renderLibrary() {
  const seq = ++libSeq;
  $('#lib-tabs').innerHTML = LIB_TABS.map(([id, label, lucide]) => `<button class="${id === libTab ? 'sel' : ''}" data-tab="${id}" title="${label}"><img src="${lucideSrc(lucide)}" alt=""></button>`).join('');
  $('#lib-title').textContent = LIB_TABS.find(t => t[0] === libTab)[1];
  const all = await libraryItems();
  if (seq !== libSeq) return;
  const f = $('#lib-filter').value.toLowerCase();
  libItems = all.filter(s => !f || s.title.toLowerCase().includes(f) || (s.sub || '').toLowerCase().includes(f));
  libSel = Math.min(libSel, Math.max(0, libItems.length - 1));
  const grid = libTab === 'symbols' || libTab === 'colors' || libTab === 'images';
  $('#lib-list').className = 'lib-list' + (grid ? ' grid' : '');
  $('#lib-list').innerHTML = libItems.slice(0, grid ? 600 : 400).map((s, i) => {
    const sel = i === libSel ? 'selected' : '';
    if (s.symbol) return `<div class="lib-cell ${sel}" data-i="${i}" draggable="true" title="${esc(s.title)}"><img src="${lucideSrc(s.lucide)}" alt=""><span>${esc(s.title)}</span></div>`;
    if (s.color) return `<div class="lib-cell ${sel}" data-i="${i}" draggable="true" title="${esc(s.sub)}"><i class="lib-sw" style="background:${s.color}"></i><span>${esc(s.title)}</span></div>`;
    if (libTab === 'images') return `<div class="lib-cell ${sel}" data-i="${i}" draggable="true">${s.image ? `<img class="photo" src="${esc(fileUrl(s.image))}" alt="">` : '<i class="lib-sw"></i>'}<span>${esc(s.title)}</span></div>`;
    return `<div class="lib-row ${sel}" data-i="${i}" draggable="true"><span class="lib-ico ${libTab}">${esc(s.glyph)}</span><div><div>${esc(s.title)}${s.user !== undefined ? ' <span class="lib-user">User</span>' : ''}</div><div class="ln2">${esc(s.sub || '')}</div></div></div>`;
  }).join('') || `<div class="nav-empty">${libTab === 'images' || libTab === 'colors' ? 'No assets in this project.<br><small>Add them in Assets.xcassets.</small>' : 'No Matches'}</div>`;
  renderLibraryDetail();
}
function libraryCode(s) {
  if (!s) return '';
  if (s.symbol) return `Image(systemName: "${s.symbol}")`;
  if (s.code) return s.code;
  return snippetPreview(s.body);
}
function renderLibraryDetail() {
  const s = libItems[libSel];
  if (!s) { $('#lib-detail').innerHTML = ''; return; }
  const visual = s.symbol ? `<div class="lib-big"><img src="${lucideSrc(s.lucide)}" alt=""></div>`
    : s.color ? `<div class="lib-big"><i class="lib-sw big" style="background:${s.color}"></i></div>`
    : s.image ? `<div class="lib-big"><img class="photo" src="${esc(fileUrl(s.image))}" alt=""></div>` : '';
  const what = s.symbol ? 'An SF Symbol — use it with Image(systemName:), Label(_:systemImage:) or a Button.' : s.modifier ? 'A SwiftUI view modifier. Inserted after the view at the cursor.' : s.sub;
  $('#lib-detail').innerHTML = `${visual}<h4>${esc(s.title)}</h4><p>${esc(what || '')}</p><pre>${esc((s.modifier ? '.' : '') + libraryCode(s))}</pre>
    <div class="hint">Double-click or press Enter to insert at the cursor, or drag it into the editor.${s.user !== undefined ? ' Right-click to delete this snippet.' : ''}</div>`;
}
function insertSnippet(s) {
  hideOverlay('library');
  const doc = activeDoc();
  if (!doc || doc.kind !== 'file') { toast('Open a file first'); return; }
  editor.focus();
  const pos = editor.getPosition();
  const line = doc.model.getLineContent(pos.lineNumber);
  const before = line.slice(0, pos.column - 1);
  let body;
  if (s.symbol) body = /"$/.test(before) ? s.symbol : `Image(systemName: "${s.symbol}")`;
  else if (s.code) body = s.code;
  else if (s.modifier) body = (/\.\s*$/.test(before) ? '' : /\S/.test(before) ? '\n' + ' '.repeat(before.search(/\S|$/) + 4) + '.' : '.') + s.body;
  else body = s.body;
  editor.getContribution('snippetController2').insert(s.symbol || s.code ? body.replace(/\$/g, '\\$') : body);
}
$('#lib-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { libTab = b.dataset.tab; libSel = 0; renderLibrary(); $('#lib-filter').focus(); } });
$('#lib-filter').addEventListener('input', () => { libSel = 0; renderLibrary(); });
$('#lib-filter').addEventListener('keydown', e => {
  const grid = $('#lib-list').classList.contains('grid');
  const cols = grid ? Math.max(1, Math.floor($('#lib-list').clientWidth / 84)) : 1;
  const step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: grid ? 1 : 0, ArrowLeft: grid ? -1 : 0 }[e.key];
  if (step) {
    e.preventDefault();
    libSel = Math.max(0, Math.min(libItems.length - 1, libSel + step));
    $$('#lib-list [data-i]').forEach(r => r.classList.toggle('selected', +r.dataset.i === libSel));
    $(`#lib-list [data-i="${libSel}"]`)?.scrollIntoView({ block: 'nearest' });
    renderLibraryDetail();
  }
  if (e.key === 'Tab') { e.preventDefault(); const i = LIB_TABS.findIndex(t => t[0] === libTab); libTab = LIB_TABS[(i + (e.shiftKey ? -1 : 1) + LIB_TABS.length) % LIB_TABS.length][0]; libSel = 0; renderLibrary(); }
  if (e.key === 'Enter' && libItems[libSel]) insertSnippet(libItems[libSel]);
  if (e.key === 'Escape') hideOverlay('library');
});
$('#lib-list').addEventListener('click', e => {
  const r = e.target.closest('[data-i]');
  if (!r) return;
  libSel = +r.dataset.i;
  if (e.detail === 2) { insertSnippet(libItems[libSel]); return; }
  $$('#lib-list [data-i]').forEach(x => x.classList.toggle('selected', x === r));
  renderLibraryDetail();
});
$('#lib-list').addEventListener('contextmenu', async e => {
  const r = e.target.closest('[data-i]');
  const s = r && libItems[+r.dataset.i];
  if (!s || s.user === undefined) return;
  const id = await api.popupMenu([{ id: 'del', label: 'Delete Snippet' }], e.clientX, e.clientY);
  if (id !== 'del') return;
  P.snippets = userSnippets().filter((_, i) => i !== s.user);
  api.setState({ snippets: P.snippets });
  syncUserSnippets();
  renderLibrary();
});
// drag from the Library into the editor, like Xcode (the panel gets out of the way)
$('#lib-list').addEventListener('dragstart', e => {
  const r = e.target.closest('[data-i]');
  const s = r && libItems[+r.dataset.i];
  if (!s) return;
  e.dataTransfer.setData('text/plain', (s.modifier ? '.' : '') + libraryCode(s));
  e.dataTransfer.effectAllowed = 'copy';
  setTimeout(() => hideOverlay('library'), 0);
});
$('#btn-library').onclick = () => cmdLibrary();

/** Editor ▸ Create Code Snippet: the selection becomes a user snippet (Library ▸ Snippets and code completion). */
async function createUserSnippet() {
  const doc = activeDoc();
  if (!doc || doc.kind !== 'file') return;
  const sel = editor.getSelection();
  const text = doc.model.getValueInRange(sel.isEmpty() ? new monaco.Range(sel.startLineNumber, 1, sel.startLineNumber, doc.model.getLineMaxColumn(sel.startLineNumber)) : sel);
  if (!text.trim()) { toast('Select the code for the snippet first'); return; }
  const name = await promptSheet('Code snippet title (its completion shortcut is the title in lowercase, no spaces):', 'My Code Snippet', 'Create');
  if (!name) return;
  const indent = Math.min(...text.split('\n').filter(l => l.trim()).map(l => l.search(/\S/)));
  const body = text.split('\n').map(l => l.slice(indent)).join('\n').replace(/\$/g, '\\$').replace(/<#([^#]+)#>/g, (_, ph) => '${1:' + ph + '}');
  P.snippets = [...userSnippets(), { label: name.toLowerCase().replace(/\s+/g, ''), detail: name, body }];
  api.setState({ snippets: P.snippets });
  syncUserSnippets();
  cmdLibrary('snippets');
}
function syncUserSnippets() {
  for (let i = SWIFT_SNIPPETS.length - 1; i >= 0; i--) if (SWIFT_SNIPPETS[i].user) SWIFT_SNIPPETS.splice(i, 1);
  for (const s of userSnippets()) SWIFT_SNIPPETS.push({ ...s, user: true });
}

// --- about
async function cmdAbout() {
  const v = await api.version();
  const tc = await api.toolchain();
  $('#about-text').innerHTML = `Version ${esc(v)}<br>${tc.found ? `Swift ${esc(tc.version)}<br><span style="font-size:11px">${esc(tc.path)}</span>` : 'Swift toolchain not installed'}<br><br>Build iPhone apps in Swift and SwiftUI on Windows 10 and 11:<br>an Xcode-style IDE with an iPhone simulator, live previews and LLDB.<br><br><span style="font-size:11px">Not affiliated with Apple Inc. Xcode, Swift, SwiftUI, iPhone and iOS<br>are trademarks of Apple Inc.</span>`;
  showOverlay('about');
}
$('#about-ok').onclick = () => hideOverlay('about');
// sponsor cards (welcome window, About)
document.addEventListener('click', e => {
  const s = e.target.closest('.sponsor[data-link]');
  if (s) api.openExternal(s.dataset.link);
});

// scheme popup
$('#scheme').onclick = async e => {
  if (!S.root) return;
  const r = e.currentTarget.getBoundingClientRect();
  const tc = S.toolchain;
  const id = await api.popupMenu([
    { id: 'x', label: S.name, checked: true },
    { type: 'separator' },
    ...(S.ios ? [{ id: 'x-h', label: 'iOS Simulators', enabled: false }, ...SIM_DEVICES.map(d => ({ id: 'dest:' + d.name, label: `${d.name} — iOS 18.0`, checked: S.device === d.name }))]
      : [{ id: 'pc', label: 'My PC (Windows, x86_64)', checked: true }]),
    { type: 'separator' },
    { id: 'edit-scheme', label: 'Edit Scheme…', accel: 'CmdOrCtrl+Shift+,' },
    { type: 'separator' },
    { id: 'tc', label: tc?.found ? `Toolchain: Swift ${tc.version}` : 'Toolchain: not installed' },
    { id: 'refresh', label: 'Refresh Toolchain' },
    { id: 'build-folder', label: 'Show Build Folder in Explorer' },
  ], r.left, r.bottom + 2);
  if (id && id.startsWith('dest:')) setSimDevice(id.slice(5));
  if (id === 'edit-scheme') showEditScheme();
  if (id === 'tc') cmdAbout();
  if (id === 'refresh') { await updateToolchainLabel(true); toast(S.toolchain.found ? `Swift ${S.toolchain.version}` : 'No Swift toolchain found'); }
  if (id === 'build-folder') api.openPath(S.root + '\\.build');
};

// ======================================================================== menus & shortcuts

const MENU_NAMES = ['file', 'edit', 'view', 'find', 'navigate', 'editor', 'product', 'debug', 'window', 'help'];
// Product ▸ Destination: the simulator's device models (screen in points, like Xcode's)
const SIM_DEVICES = [
  { name: 'iPhone 16 Pro', w: 402, h: 874, island: true },
  { name: 'iPhone 16 Pro Max', w: 440, h: 956, island: true },
  { name: 'iPhone 16', w: 393, h: 852, island: true },
  { name: 'iPhone 16 Plus', w: 430, h: 932, island: true },
  { name: 'iPhone 16e', w: 390, h: 844, notch: true },
  { name: 'iPhone SE (3rd generation)', w: 375, h: 667, home: true },
];

function menuTemplate(name) {
  const hasProj = !!S.root;
  const doc = activeDoc();
  const isFile = doc?.kind === 'file';
  const recent = (P.recent || []).slice(0, 10).map((r, i) => ({ id: 'recent:' + i, label: r.path }));
  const M = {
    file: [
      { label: 'New', submenu: [
        { id: 'new-file', label: 'File…', accel: 'CmdOrCtrl+N' },
        { id: 'new-project', label: 'Project…', accel: 'CmdOrCtrl+Shift+N' },
        { id: 'new-group', label: 'Group', enabled: hasProj },
      ] },
      { id: 'add-files', label: S.root ? `Add Files to “${S.name}”…` : 'Add Files…', accel: 'CmdOrCtrl+Alt+A', enabled: hasProj },
      { type: 'separator' },
      { id: 'open', label: 'Open Folder…', accel: 'CmdOrCtrl+O' },
      { id: 'open-file', label: 'Open File…', accel: 'CmdOrCtrl+Shift+Alt+O' },
      { label: 'Open Recent', submenu: recent.length ? recent : [{ id: 'none', label: 'No Recent Projects', enabled: false }] },
      { type: 'separator' },
      { id: 'close-tab', label: 'Close Tab', accel: 'CmdOrCtrl+W', enabled: !!doc },
      { id: 'close-project', label: 'Close Project', accel: 'CmdOrCtrl+Shift+W', enabled: hasProj },
      { type: 'separator' },
      { id: 'save', label: 'Save', accel: 'CmdOrCtrl+S', enabled: isFile },
      { id: 'save-all', label: 'Save All', accel: 'CmdOrCtrl+Alt+S', enabled: hasProj },
      { id: 'revert', label: 'Revert to Saved', enabled: isFile && isDirty(doc) },
      { type: 'separator' },
      { id: 'reveal', label: 'Show in Explorer', enabled: isFile || hasProj },
      { type: 'separator' },
      { id: 'quit', label: 'Exit', accel: 'Alt+F4' },
    ],
    edit: [
      { id: 'undo', label: 'Undo', accel: 'CmdOrCtrl+Z', passthrough: true },
      { id: 'redo', label: 'Redo', accel: 'CmdOrCtrl+Y', passthrough: true },
      { type: 'separator' },
      { id: 'cut', label: 'Cut', accel: 'CmdOrCtrl+X', passthrough: true },
      { id: 'copy', label: 'Copy', accel: 'CmdOrCtrl+C', passthrough: true },
      { id: 'paste', label: 'Paste', accel: 'CmdOrCtrl+V', passthrough: true },
      { id: 'select-all', label: 'Select All', accel: 'CmdOrCtrl+A', passthrough: true },
      { type: 'separator' },
      { id: 'duplicate', label: 'Duplicate', accel: 'CmdOrCtrl+D', enabled: isFile },
      { id: 'delete-line', label: 'Delete Line', accel: 'CmdOrCtrl+Shift+Backspace', enabled: isFile },
      { type: 'separator' },
      { label: 'Selection', submenu: [
        { id: 'select-next', label: 'Select Next Occurrence', accel: 'CmdOrCtrl+Alt+E' },
        { id: 'select-all-occ', label: 'Select All Occurrences' },
        { id: 'expand-sel', label: 'Expand Selection', accel: 'Shift+Alt+Right', passthrough: true },
        { id: 'shrink-sel', label: 'Shrink Selection', accel: 'Shift+Alt+Left', passthrough: true },
        { id: 'cursor-below', label: 'Add Cursor Below', accel: 'CmdOrCtrl+Alt+Down', passthrough: true },
        { id: 'cursor-above', label: 'Add Cursor Above', accel: 'CmdOrCtrl+Alt+Up', passthrough: true },
      ] },
      { label: 'Transformations', submenu: [
        { id: 'upper', label: 'Make Upper Case' },
        { id: 'lower', label: 'Make Lower Case' },
        { id: 'title', label: 'Capitalize' },
        { type: 'separator' },
        { id: 'sort-lines', label: 'Sort Lines' },
        { id: 'trim-ws', label: 'Trim Trailing Whitespace' },
      ] },
      { type: 'separator' },
      { id: 'library', label: 'Show Library', accel: 'CmdOrCtrl+Shift+L' },
    ],
    view: [
      { label: 'Navigators', submenu: [
        { id: 'nav-project', label: 'Project', accel: 'CmdOrCtrl+1' },
        { id: 'nav-bookmarks', label: 'Bookmarks', accel: 'CmdOrCtrl+2' },
        { id: 'nav-symbols', label: 'Symbols', accel: 'CmdOrCtrl+3' },
        { id: 'nav-find', label: 'Find', accel: 'CmdOrCtrl+4' },
        { id: 'nav-issues', label: 'Issues', accel: 'CmdOrCtrl+5' },
        { id: 'nav-debug', label: 'Debug', accel: 'CmdOrCtrl+7' },
        { id: 'nav-breakpoints', label: 'Breakpoints', accel: 'CmdOrCtrl+8' },
        { id: 'nav-reports', label: 'Reports', accel: 'CmdOrCtrl+9' },
        { type: 'separator' },
        { id: 'toggle-nav', label: appEl.classList.contains('hide-nav') ? 'Show Navigator' : 'Hide Navigator', accel: 'CmdOrCtrl+0' },
      ] },
      { label: 'Debug Area', submenu: [
        { id: 'toggle-debug', label: appEl.classList.contains('hide-debug') ? 'Show Debug Area' : 'Hide Debug Area', accel: 'CmdOrCtrl+Shift+Y' },
        { id: 'activate-console', label: 'Activate Console', accel: 'CmdOrCtrl+Shift+C' },
      ] },
      { label: 'Inspectors', submenu: [
        { id: 'insp-file', label: 'File', accel: 'CmdOrCtrl+Alt+1' },
        { id: 'insp-help', label: 'Quick Help', accel: 'CmdOrCtrl+Alt+3' },
        { type: 'separator' },
        { id: 'toggle-insp', label: appEl.classList.contains('hide-insp') ? 'Show Inspectors' : 'Hide Inspectors', accel: 'CmdOrCtrl+Alt+0' },
      ] },
      { type: 'separator' },
      { id: 'fullscreen', label: 'Toggle Full Screen', accel: 'F11' },
    ],
    find: [
      { id: 'find-project', label: 'Find in Project…', accel: 'CmdOrCtrl+Shift+F' },
      { id: 'replace-project', label: 'Find and Replace in Project…', accel: 'CmdOrCtrl+Shift+H' },
      { id: 'find-symbol', label: 'Find Selected Symbol in Project', accel: 'Shift+F12', enabled: isFile },
      { type: 'separator' },
      { id: 'find', label: 'Find…', accel: 'CmdOrCtrl+F', passthrough: true },
      { id: 'replace', label: 'Find and Replace…', accel: 'CmdOrCtrl+H', passthrough: true },
      { id: 'find-next', label: 'Find Next', accel: 'F3', passthrough: true },
      { id: 'find-prev', label: 'Find Previous', accel: 'Shift+F3', passthrough: true },
      { id: 'find-selection', label: 'Use Selection for Find', accel: 'CmdOrCtrl+E', enabled: isFile },
    ],
    navigate: [
      { id: 'quick-open', label: 'Open Quickly…', accel: 'CmdOrCtrl+Shift+O' },
      { id: 'reveal-nav', label: 'Reveal in Project Navigator', accel: 'CmdOrCtrl+Shift+J', enabled: isFile },
      { type: 'separator' },
      { id: 'definition', label: 'Jump to Definition', accel: 'F12', passthrough: true },
      { id: 'peek-definition', label: 'Show Definition Inline', accel: 'Alt+F12', passthrough: true },
      { id: 'goto-line', label: 'Jump to Line…', accel: 'CmdOrCtrl+L' },
      { id: 'symbols-file', label: 'Jump to Symbol in File…', accel: 'CmdOrCtrl+6' },
      { type: 'separator' },
      { id: 'next-issue', label: 'Jump to Next Issue', accel: "CmdOrCtrl+'" },
      { id: 'prev-issue', label: 'Jump to Previous Issue', accel: "CmdOrCtrl+Shift+'" },
      { id: 'next-bookmark', label: 'Jump to Next Bookmark' },
      { type: 'separator' },
      { id: 'back', label: 'Go Back', accel: 'Alt+Left' },
      { id: 'forward', label: 'Go Forward', accel: 'Alt+Right' },
      { id: 'next-tab', label: 'Show Next Tab', accel: 'CmdOrCtrl+Tab' },
      { id: 'prev-tab', label: 'Show Previous Tab', accel: 'CmdOrCtrl+Shift+Tab' },
    ],
    editor: [
      { id: 'toggle-canvas', label: 'Canvas', checked: canvasShown(), accel: 'CmdOrCtrl+Alt+Enter', enabled: hasProj },
      { id: 'refresh-canvas', label: 'Refresh Canvas', accel: 'CmdOrCtrl+Alt+P', enabled: hasProj },
      { type: 'separator' },
      { id: 'minimap', label: 'Minimap', checked: setting('minimap'), accel: 'CmdOrCtrl+Shift+M' },
      { id: 'invisibles', label: 'Invisibles', checked: !!setting('invisibles') },
      { id: 'wrap', label: 'Wrap Lines', checked: setting('wrap') },
      { id: 'sticky', label: 'Sticky Headers', checked: setting('sticky') !== false },
      { type: 'separator' },
      { id: 'completions', label: 'Show Completions', accel: 'CmdOrCtrl+Space', passthrough: true, enabled: isFile },
      { id: 'code-actions', label: 'Show Code Actions', accel: 'CmdOrCtrl+Shift+A', enabled: isFile },
      { id: 'quick-help', label: 'Show Quick Help', accel: 'CmdOrCtrl+Shift+Alt+H', enabled: isFile },
      { type: 'separator' },
      { label: 'Refactor', enabled: isFile, submenu: [
        { id: 'rename', label: 'Rename…', accel: 'F2' },
        { id: 'refactor', label: 'Extract, Convert & More…', accel: 'CmdOrCtrl+Shift+R' },
      ] },
      { label: 'Structure', enabled: isFile, submenu: [
        { id: 'balance', label: 'Balance Delimiter' },
        { id: 'reindent', label: 'Re-Indent', accel: 'CmdOrCtrl+I' },
        { id: 'format', label: 'Format File', accel: 'CmdOrCtrl+Shift+I' },
        { type: 'separator' },
        { id: 'shift-left', label: 'Shift Left', accel: 'CmdOrCtrl+[' },
        { id: 'shift-right', label: 'Shift Right', accel: 'CmdOrCtrl+]' },
        { id: 'move-up', label: 'Move Line Up', accel: 'Alt+Up', passthrough: true },
        { id: 'move-down', label: 'Move Line Down', accel: 'Alt+Down', passthrough: true },
        { type: 'separator' },
        { id: 'comment', label: 'Comment Selection', accel: 'CmdOrCtrl+/', passthrough: true },
        { id: 'block-comment', label: 'Comment as Block', accel: 'Shift+Alt+A', passthrough: true },
      ] },
      { label: 'Code Folding', enabled: isFile, submenu: [
        { id: 'fold', label: 'Fold', accel: 'CmdOrCtrl+Alt+Left' },
        { id: 'unfold', label: 'Unfold', accel: 'CmdOrCtrl+Alt+Right' },
        { type: 'separator' },
        { id: 'fold-all', label: 'Fold All', accel: 'CmdOrCtrl+Shift+Alt+Left' },
        { id: 'unfold-all', label: 'Unfold All', accel: 'CmdOrCtrl+Shift+Alt+Right' },
        { id: 'fold-methods', label: 'Fold Methods & Functions' },
        { id: 'fold-comments', label: 'Fold Comment Blocks' },
      ] },
      { label: 'Syntax Coloring', enabled: isFile, submenu: [['swift-xcode', 'Swift'], ['json', 'JSON'], ['markdown', 'Markdown'], ['xml', 'XML'], ['strings', 'Strings'], ['plaintext', 'Plain Text']]
        .map(([lang, label]) => ({ id: 'syntax:' + lang, label, checked: isFile && doc.model.getLanguageId() === lang })) },
      { label: 'Font Size', submenu: [
        { id: 'font-up', label: 'Bigger', accel: 'CmdOrCtrl+=' },
        { id: 'font-down', label: 'Smaller', accel: 'CmdOrCtrl+-' },
        { id: 'font-reset', label: 'Reset' },
      ] },
      { type: 'separator' },
      { id: 'edit-all', label: 'Edit All in Scope', accel: 'CmdOrCtrl+Shift+E', enabled: isFile },
      { id: 'add-bookmark', label: 'Add Bookmark', accel: 'CmdOrCtrl+Shift+D', enabled: isFile },
      { id: 'create-snippet', label: 'Create Code Snippet…', enabled: isFile },
    ],
    product: [
      { id: 'run', label: 'Run', accel: 'CmdOrCtrl+R', enabled: hasProj },
      { id: 'run-nodebug', label: 'Run Without Debugging', accel: 'CmdOrCtrl+Shift+R', enabled: hasProj && !S.isPackage },
      { id: 'build', label: 'Build', accel: 'CmdOrCtrl+B', enabled: hasProj },
      { id: 'stop', label: 'Stop', accel: 'CmdOrCtrl+.', enabled: S.building || S.running },
      { type: 'separator' },
      { id: 'clean', label: 'Clean Build Folder', accel: 'CmdOrCtrl+Shift+K', enabled: hasProj },
      { id: 'build-folder', label: 'Show Build Folder in Explorer', enabled: hasProj },
      { type: 'separator' },
      { id: 'preview', label: 'Run #Preview in Simulator', enabled: hasProj },
      { label: 'Destination', enabled: hasProj, submenu: S.ios ? SIM_DEVICES.map(d => ({ id: 'dest:' + d.name, label: `${d.name} (Simulator)`, checked: S.device === d.name })) : [{ id: 'x-dest', label: 'My PC (Windows, x86_64)', checked: true }] },
      { label: 'Scheme', submenu: [
        { id: 'edit-scheme', label: 'Edit Scheme…', accel: 'CmdOrCtrl+Shift+,', enabled: hasProj },
      ] },
      { id: 'project-editor', label: 'Project Settings (Info, Localizations, Build Settings)', enabled: hasProj },
      { type: 'separator' },
      { id: 'toolchain', label: 'Toolchain…' },
      { id: 'install-sdk', label: 'Install Windows SDK (no admin)…' },
    ],
    debug: [
      { id: 'dbg-continue', label: DBG.paused ? 'Continue' : 'Pause', accel: 'CmdOrCtrl+Alt+Y', enabled: DBG.session },
      { id: 'dbg-over', label: 'Step Over', accel: 'F6', enabled: DBG.paused },
      { id: 'dbg-into', label: 'Step Into', accel: 'F7', enabled: DBG.paused },
      { id: 'dbg-out', label: 'Step Out', accel: 'F8', enabled: DBG.paused },
      { type: 'separator' },
      { label: 'Breakpoints', submenu: [
        { id: 'bp-toggle', label: 'Add/Remove Breakpoint at Current Line', accel: 'CmdOrCtrl+\\', enabled: isFile },
        { id: 'bp-enable', label: 'Enable/Disable Breakpoint at Current Line', enabled: isFile },
        { type: 'separator' },
        { id: 'bp-delete-all', label: 'Delete All Breakpoints', enabled: DBG.breakpoints.length > 0 },
      ] },
      { id: 'bp-activate', label: DBG.active ? 'Deactivate Breakpoints' : 'Activate Breakpoints', accel: 'CmdOrCtrl+Alt+B' },
      { type: 'separator' },
      { label: 'Debug Workflow', submenu: [
        { id: 'clear-console', label: 'Clear Console', accel: 'CmdOrCtrl+K' },
        { id: 'activate-console', label: 'Activate Console' },
      ] },
      { id: 'dbg-detach', label: S.running ? `Detach from ${S.name}` : 'Detach', enabled: DBG.session },
    ],
    window: [
      { id: 'welcome', label: 'Welcome to WinSwift Studio', accel: 'CmdOrCtrl+Shift+1' },
      { id: 'show-simulator', label: 'Devices and Simulators', accel: 'CmdOrCtrl+Shift+2' },
      { type: 'separator' },
      { id: 'settings', label: 'Settings…', accel: 'CmdOrCtrl+,' },
      { type: 'separator' },
      { id: 'devtools', label: 'Developer Tools', accel: 'CmdOrCtrl+Shift+Alt+I' },
    ],
    help: [
      { id: 'help-docs', label: 'Developer Documentation', accel: 'CmdOrCtrl+Shift+0' },
      { id: 'quick-help', label: 'Quick Help for Selected Item', accel: 'CmdOrCtrl+Shift+Alt+H', enabled: isFile },
      { type: 'separator' },
      { id: 'help-book', label: 'The Swift Programming Language' },
      { id: 'help-windows', label: 'Swift on Windows' },
      { id: 'help-stdlib', label: 'Swift Standard Library Reference' },
      { type: 'separator' },
      { id: 'help-keys', label: 'Keyboard Shortcuts' },
      { type: 'separator' },
      { id: 'check-updates', label: S.update ? `Update Available: ${S.update.latest}…` : 'Check for Updates…' },
      { id: 'install-swift', label: 'Install Swift Toolchain…' },
      { type: 'separator' },
      { id: 'sponsor', label: 'ProZlecenie.pl — fachowcy z Twojej okolicy (sponsor)' },
      { id: 'about', label: 'About WinSwift Studio' },
    ],
  };
  return applyKeyOverrides(M[name]);
}

const COMMANDS = {
  'new-file': cmdNewFile,
  'new-project': () => cmdNewProject(),
  'new-group': cmdNewGroup,
  'open': cmdOpen,
  'open-file': cmdOpenFile,
  'close-tab': () => S.active && closeTab(S.active),
  'close-project': async () => { if (await confirmDiscardAll()) closeProject(false); },
  'save': () => saveDoc(activeDoc()),
  'save-all': saveAll,
  'revert': async () => { const d = activeDoc(); if (!d) return; const r = await api.read(d.path); d.model.setValue(r.content); d.saved = d.model.getAlternativeVersionId(); onDocChanged(d); },
  'reveal': () => api.reveal(activeDoc()?.path || S.root),
  'quit': () => window.close(),
  'undo': () => { editor.focus(); editor.trigger('menu', 'undo'); },
  'redo': () => { editor.focus(); editor.trigger('menu', 'redo'); },
  'cut': () => { editor.focus(); document.execCommand('cut'); },
  'copy': () => { editor.focus(); document.execCommand('copy'); },
  'paste': async () => { editor.focus(); const t = await navigator.clipboard.readText(); editor.trigger('menu', 'paste', { text: t }); },
  'select-all': () => { editor.focus(); editor.trigger('menu', 'editor.action.selectAll'); },
  'comment': () => { editor.focus(); editor.trigger('menu', 'editor.action.commentLine'); },
  'reindent': () => { editor.focus(); editor.trigger('menu', 'editor.action.reindentselectedlines'); },
  'move-up': () => editor.trigger('menu', 'editor.action.moveLinesUpAction'),
  'move-down': () => editor.trigger('menu', 'editor.action.moveLinesDownAction'),
  'library': cmdLibrary,
  'duplicate': edAction('editor.action.copyLinesDownAction'),
  'delete-line': edAction('editor.action.deleteLines'),
  'select-next': edAction('editor.action.addSelectionToNextFindMatch'),
  'select-all-occ': edAction('editor.action.selectHighlights'),
  'expand-sel': edAction('editor.action.smartSelect.expand'),
  'shrink-sel': edAction('editor.action.smartSelect.shrink'),
  'cursor-below': edAction('editor.action.insertCursorBelow'),
  'cursor-above': edAction('editor.action.insertCursorAbove'),
  'upper': edAction('editor.action.transformToUppercase'),
  'lower': edAction('editor.action.transformToLowercase'),
  'title': edAction('editor.action.transformToTitlecase'),
  'sort-lines': edAction('editor.action.sortLinesAscending'),
  'trim-ws': edAction('editor.action.trimTrailingWhitespace'),
  'nav-project': () => showNav('project'),
  'nav-bookmarks': () => showNav('bookmarks'),
  'nav-symbols': () => showNav('symbols'),
  'nav-find': () => showNav('find'),
  'nav-issues': () => showNav('issues'),
  'nav-debug': () => showNav('debug'),
  'nav-breakpoints': () => showNav('breakpoints'),
  'nav-reports': () => showNav('reports'),
  'insp-file': () => { toggleInspector(true); $('#insp-tabs [data-insp="file"]').click(); },
  'insp-help': () => { toggleInspector(true); $('#insp-tabs [data-insp="help"]').click(); },
  'fullscreen': () => api.toggleFullScreen(),
  // Editor menu
  'toggle-canvas': () => toggleCanvas(),
  'refresh-canvas': () => { if (!canvasShown()) toggleCanvas(true); else refreshCanvas({ force: true }); },
  'invisibles': () => { const v = !setting('invisibles'); setSetting('invisibles', v); editor.updateOptions({ renderWhitespace: v ? 'all' : 'none', renderControlCharacters: v }); },
  'sticky': () => { const v = setting('sticky') === false; setSetting('sticky', v); editor.updateOptions({ stickyScroll: { enabled: v } }); },
  'completions': edAction('editor.action.triggerSuggest'),
  'code-actions': edAction('editor.action.quickFix'),
  'quick-help': () => { edAction('editor.action.showHover')(); COMMANDS['insp-help'](); },
  'rename': edAction('editor.action.rename'),
  'refactor': edAction('editor.action.refactor'),
  'balance': edAction('editor.action.selectToBracket'),
  'format': edAction('editor.action.formatDocument'),
  'shift-left': edAction('editor.action.outdentLines'),
  'shift-right': edAction('editor.action.indentLines'),
  'block-comment': edAction('editor.action.blockComment'),
  'fold': edAction('editor.fold'),
  'unfold': edAction('editor.unfold'),
  'fold-all': edAction('editor.foldAll'),
  'unfold-all': edAction('editor.unfoldAll'),
  'fold-methods': edAction('editor.foldLevel2'),
  'fold-comments': edAction('editor.foldAllBlockComments'),
  'edit-all': edAction('editor.action.changeAll'),
  'add-bookmark': () => { const d = activeDoc(); if (d?.kind === 'file') toggleBookmark(d.path, editor.getPosition().lineNumber); },
  'next-bookmark': () => jumpToBookmark(1),
  'create-snippet': () => createUserSnippet(),
  // Debug menu
  'dbg-continue': () => debugCommand(DBG.paused ? 'continue' : 'pause'),
  'dbg-over': () => debugCommand('over'),
  'dbg-into': () => debugCommand('into'),
  'dbg-out': () => debugCommand('out'),
  'dbg-detach': () => api.debugRequest('disconnect', { terminateDebuggee: false }),
  'bp-toggle': () => { const d = activeDoc(); if (d?.kind === 'file') toggleBreakpoint(d.path, editor.getPosition().lineNumber); },
  'bp-enable': () => {
    const d = activeDoc();
    const b = d?.kind === 'file' && findBp(d.path, editor.getPosition().lineNumber);
    if (b) { b.enabled = b.enabled === false; pushBreakpoints(); } else toast('No breakpoint on this line');
  },
  'bp-delete-all': () => { DBG.breakpoints = []; pushBreakpoints(); },
  'bp-activate': () => $('#dbg-bp').click(),
  'run-nodebug': () => runAction('run', { noDebug: true }),
  'replace-project': () => { COMMANDS['find-project'](); setFindMode('replace'); },
  'find-symbol': () => {
    const m = editor.getModel();
    const w = m && m.getWordAtPosition(editor.getPosition());
    if (!w) { toast('Put the cursor on a symbol'); return; }
    showNav('find'); setFindMode('find');
    $('#find-input').value = w.word; $('#find-word').checked = true; $('#find-regex').checked = false; $('#find-case').checked = true;
    runFind();
  },
  'find-selection': () => {
    const sel = editor.getModel()?.getValueInRange(editor.getSelection());
    const w = sel || editor.getModel()?.getWordAtPosition(editor.getPosition())?.word;
    if (w && !w.includes('\n')) { editor.trigger('menu', 'actions.findWithSelection'); toast(`Find: “${w}”`); }
  },
  'peek-definition': edAction('editor.action.peekDefinition'),
  'settings': () => showSettings(),
  'toggle-nav': () => toggleNavigator(),
  'toggle-debug': () => toggleDebug(),
  'toggle-insp': () => toggleInspector(),
  'activate-console': () => { toggleDebug(true); (S.running ? $('#console-in') : $('#console-out')).focus(); },
  'minimap': () => { const v = !setting('minimap'); setSetting('minimap', v); editor.updateOptions({ minimap: { enabled: v } }); },
  'wrap': () => { const v = !setting('wrap'); setSetting('wrap', v); editor.updateOptions({ wordWrap: v ? 'on' : 'off' }); renderInspector(); },
  'font-up': () => setFontSize(setting('fontSize') + 1),
  'font-down': () => setFontSize(setting('fontSize') - 1),
  'font-reset': () => setFontSize(DEFAULTS.fontSize),
  'find-project': () => { showNav('find'); const sel = editor.getModel() ? editor.getModel().getValueInRange(editor.getSelection()) : ''; if (sel && !sel.includes('\n')) $('#find-input').value = sel; $('#find-input').select(); },
  'find': () => { editor.focus(); editor.trigger('menu', 'actions.find'); },
  'replace': () => { editor.focus(); editor.trigger('menu', 'editor.action.startFindReplaceAction'); },
  'find-next': () => editor.trigger('menu', 'editor.action.nextMatchFindAction'),
  'find-prev': () => editor.trigger('menu', 'editor.action.previousMatchFindAction'),
  'quick-open': cmdQuickOpen,
  'reveal-nav': () => { showNav('project'); revealInTree(activeDoc()?.path, true); },
  'definition': () => { editor.focus(); editor.trigger('menu', 'editor.action.revealDefinition'); },
  'goto-line': () => { editor.focus(); editor.trigger('menu', 'editor.action.gotoLine'); },
  'symbols-file': () => { editor.focus(); editor.trigger('menu', 'editor.action.quickOutline'); },
  'next-issue': () => jumpToIssue(1),
  'prev-issue': () => jumpToIssue(-1),
  'back': () => goHistory(-1),
  'forward': () => goHistory(1),
  'next-tab': () => cycleTab(1),
  'prev-tab': () => cycleTab(-1),
  'run': () => runAction('run'),
  'build': () => runAction('build'),
  'stop': stopAction,
  'clean': cleanAction,
  'build-folder': () => S.root && api.openPath(S.root + '\\.build'),
  'clear-console': consoleClear,
  'toolchain': cmdAbout,
  'edit-scheme': () => showEditScheme(),
  'project-editor': () => openProjectEditor(),
  'add-files': async () => { if (!S.root) return; const f = await api.openFilesDialog(); if (f.length) { await api.importFiles(targetDir(), f); await loadTree(); renderTree(); } },
  'preview': previewAction,
  'show-simulator': () => api.showSimulator(),
  'install-sdk': async () => {
    toggleDebug(true);
    consoleWrite('Installing the Windows SDK for Swift into %LOCALAPPDATA%\\SwiftCode\\WinSDK…\n', 'c-sys');
    const ok = await api.installSdk();
    consoleWrite(ok ? '\nWindows SDK installed.\n' : '\nWindows SDK installation failed.\n', 'c-sys');
  },
  'welcome': showWelcome,
  'devtools': () => api.devtools(),
  'help-docs': () => {
    const m = editor.getModel();
    const w = m && m.getWordAtPosition(editor.getPosition());
    api.openExternal(w ? `https://developer.apple.com/search/?q=${encodeURIComponent(w.word)}` : 'https://developer.apple.com/documentation/swiftui');
  },
  'help-book': () => api.openExternal('https://docs.swift.org/swift-book/documentation/the-swift-programming-language/'),
  'help-windows': () => api.openExternal('https://www.swift.org/install/windows/'),
  'help-stdlib': () => api.openExternal('https://developer.apple.com/documentation/swift/swift-standard-library'),
  'help-keys': showShortcuts,
  'sponsor': () => api.openExternal('https://prozlecenie.pl/'),
  'check-updates': () => checkForUpdates(true),
  'install-swift': () => showOverlay('toolchain-sheet'),
  'about': cmdAbout,
};

function edAction(action) {
  return () => { if (!editor.getModel()) return; editor.focus(); editor.trigger('menu', action); };
}

function runCommand(id) {
  if (!id) return;
  if (id.startsWith('recent:')) { const r = (P.recent || [])[+id.slice(7)]; if (r) openProject(r.path); return; }
  if (id.startsWith('syntax:')) { const d = activeDoc(); if (d?.kind === 'file') monaco.editor.setModelLanguage(d.model, id.slice(7)); return; }
  if (id.startsWith('dest:')) { setSimDevice(id.slice(5)); return; }
  const fn = COMMANDS[id];
  if (fn) Promise.resolve(fn()).catch(err => toast(String(err.message || err)));
}

function setFontSize(n) {
  n = Math.max(8, Math.min(32, n));
  setSetting('fontSize', n);
  editor.updateOptions({ fontSize: n, lineHeight: Math.round(n * 1.55) });
}

function cycleTab(d) {
  if (S.tabs.length < 2) return;
  const i = S.tabs.indexOf(S.active);
  activate(S.tabs[(i + d + S.tabs.length) % S.tabs.length]);
}

function showShortcuts() {
  const rows = [];
  for (const m of MENU_NAMES) {
    const items = [];
    const walk = list => list.forEach(it => { if (it.submenu) walk(it.submenu); else if (it.accel && it.label) items.push(`  ${accelKey(it.accel).padEnd(22)}${it.label}`); });
    walk(menuTemplate(m));
    if (items.length) rows.push(m[0].toUpperCase() + m.slice(1), ...items, '');
  }
  const key = 'swiftcode-log:/shortcuts';
  let doc = S.docs.get(key);
  if (!doc) {
    doc = { key, kind: 'log', title: 'Keyboard Shortcuts', model: monaco.editor.createModel(rows.join('\n'), 'plaintext', monaco.Uri.parse(key)) };
    S.docs.set(key, doc);
  }
  activate(key);
}

// menubar clicks → native popup menus
$('#menubar').addEventListener('click', async e => {
  const span = e.target.closest('[data-menu]');
  if (!span) return;
  const r = span.getBoundingClientRect();
  span.classList.add('open');
  const id = await api.popupMenu(menuTemplate(span.dataset.menu), r.left, r.bottom + 2);
  span.classList.remove('open');
  runCommand(id);
});

// keyboard shortcuts (captured before Monaco so Xcode bindings win over its defaults)
function accelKey(accel) {
  // same modifier order as eventKey(), whatever order the menu item spells them in
  const parts = accel.replace('CmdOrCtrl', 'Ctrl').split('+');
  const key = parts.pop();
  return [...['Ctrl', 'Shift', 'Alt'].filter(m => parts.includes(m)), key.length === 1 ? key.toUpperCase() : key].join('+');
}
function eventKey(e) {
  const map = { Period: '.', Comma: ',', Slash: '/', Quote: "'", Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Backquote: '`', Backslash: '\\' };
  let k;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) k = e.code.slice(5);
  else if (map[e.code]) k = map[e.code];
  else if (e.key === 'ArrowLeft') k = 'Left';
  else if (e.key === 'ArrowRight') k = 'Right';
  else if (e.key === 'ArrowUp') k = 'Up';
  else if (e.key === 'ArrowDown') k = 'Down';
  else k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', k].filter(Boolean).join('+');
}
let SHORTCUTS = null;
function buildShortcutTable() {
  SHORTCUTS = new Map();
  for (const m of MENU_NAMES) {
    const walk = items => items.forEach(it => {
      if (it.submenu) walk(it.submenu);
      else if (it.accel && !it.passthrough && it.id && it.id !== 'quit') SHORTCUTS.set(accelKey(it.accel), it.id);
    });
    walk(menuTemplate(m));
  }
}

window.addEventListener('keydown', e => {
  if (S.recordingKey) return;   // Settings ▸ Key Bindings is listening
  if (!SHORTCUTS) buildShortcutTable();
  const key = eventKey(e);
  if (overlayOpen()) {
    if (e.key === 'Escape') {
      const top = $$('.overlay.show').pop();
      if (top && !(top.id === 'welcome' && !S.root)) hideOverlay(top.id);
    }
    return;
  }
  const id = SHORTCUTS.get(key);
  if (!id) return;
  // keep the plain editing keys for text inputs
  const inInput = e.target.tagName === 'INPUT' && !e.target.closest('.monaco-editor');
  if (inInput && ['Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y'].includes(key)) return;
  e.preventDefault();
  e.stopPropagation();
  runCommand(id);
}, true);

window.addEventListener('mouseup', e => {
  if (e.button === 3) goHistory(-1);
  if (e.button === 4) goHistory(1);
});

// unsaved changes on window close
api.on('app:before-close', async () => {
  if (await confirmDiscardAll()) api.closeConfirmed();
});

// ======================================================================== init

async function init() {
  P = await api.getState();
  applyLayout();
  applyTheme();
  applyEditorSettings();
  syncUserSnippets();
  try {
    S.simModel = (await api.simDevice()).model;
    $('#cv-device span:last-child').textContent = S.simModel;
  } catch {}
  buildShortcutTable();
  appEl.classList.add('no-tabs');
  setStatus('none');
  const last = (P.recent || [])[0];
  const initial = await api.initialPath();
  if (initial) {
    await openProject(initial.folder, { file: initial.file });
  } else if (last && P.lastOpen && setting('reopen') !== false && await api.exists(last.path)) {
    await openProject(last.path);
  } else {
    showWelcome();
  }
  window.addEventListener('beforeunload', () => api.setState({ lastOpen: !!S.root }));
  setInterval(() => api.setState({ lastOpen: !!S.root }), 5000);
  // test hook: SWIFTCODE_DEBUG=1 + SWIFTCODE_SCRIPT="<js>" runs a script once the UI is up
  const script = await api.debugScript();
  if (!script) {
    // first run on a new PC: offer to install Swift right away; then look for a newer release
    const tc = await api.toolchain();
    if (!tc.found) setTimeout(() => showOverlay('toolchain-sheet'), 600);
    setTimeout(() => checkForUpdates(false), 4000);
  }
  if (script) setTimeout(() => { try { (0, eval)(script); } catch (e) { console.error(e); } }, 800);
}
