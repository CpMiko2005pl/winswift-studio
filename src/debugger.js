'use strict';
// Debugger UI: breakpoints in the gutter, the debug bar, variables view, Debug & Breakpoint navigators, LLDB console.

const DBG = {
  breakpoints: [],      // { path, line, enabled, condition, verified }
  active: true,         // Debug ▸ Activate Breakpoints
  session: false,       // LLDB attached to the running program
  paused: false,
  threadId: null,
  threads: [],
  frames: [],
  frameIdx: 0,
  reason: null,
  description: null,
  bpDecos: new Map(),   // doc key -> decoration ids
  pcDecos: new Map(),   // doc key -> current-line decoration ids
  varOpen: new Set(),   // expanded variable paths
};

// ------------------------------------------------------------------ breakpoints model

function bpKey(p, line) { return `${norm(p)}:${line}`; }
function findBp(p, line) { return DBG.breakpoints.find(b => norm(b.path) === norm(p) && b.line === line); }

function loadBreakpoints() {
  const saved = S.root && (P.projects || {})[norm(S.root)];
  DBG.breakpoints = (saved && saved.breakpoints || []).map(b => ({ ...b, verified: undefined }));
  DBG.active = !(saved && saved.breakpointsInactive);
  renderBreakpointDecorationsAll();
  renderBreakpointNav();
  updateDebugBar();
}

function saveBreakpoints() {
  if (!S.root) return;
  P.projects = P.projects || {};
  const cur = P.projects[norm(S.root)] || {};
  cur.breakpoints = DBG.breakpoints.map(({ path, line, enabled, condition }) => ({ path, line, enabled, condition }));
  cur.breakpointsInactive = !DBG.active;
  P.projects[norm(S.root)] = cur;
  saveProjectStateDebounced();
}

/** Lines move while you type above a breakpoint: read them back from the decorations. */
function syncBreakpointLines() {
  for (const [key, ids] of DBG.bpDecos) {
    const doc = S.docs.get(key);
    if (!doc || doc.model.isDisposed()) continue;
    const bps = DBG.breakpoints.filter(b => norm(b.path) === norm(doc.path));
    bps.forEach((b, i) => {
      const r = ids[i] && doc.model.getDecorationRange(ids[i]);
      if (r) b.line = r.startLineNumber;
    });
  }
}

function breakpointsForRun() {
  syncBreakpointLines();
  return DBG.active ? DBG.breakpoints.filter(b => b.enabled !== false).map(b => ({ path: b.path, line: b.line, condition: b.condition })) : [];
}

function pushBreakpoints() {
  saveBreakpoints();
  renderBreakpointDecorationsAll();
  renderBreakpointNav();
  if (DBG.session) api.debugSetBreakpoints(breakpointsForRun());
}

function toggleBreakpoint(p, line) {
  syncBreakpointLines();
  const b = findBp(p, line);
  if (b) DBG.breakpoints = DBG.breakpoints.filter(x => x !== b);
  else DBG.breakpoints.push({ path: p, line, enabled: true });
  DBG.breakpoints.sort((a, b2) => a.path.localeCompare(b2.path) || a.line - b2.line);
  if (!DBG.active && !b) { DBG.active = true; toast('Breakpoints activated'); }
  pushBreakpoints();
  updateDebugBar();
}

function renderBreakpointDecorations(doc) {
  if (!doc || doc.kind !== 'file' || doc.model.isDisposed()) return;
  const list = DBG.breakpoints.filter(b => norm(b.path) === norm(doc.path));
  const decos = list.map(b => ({
    range: new monaco.Range(Math.min(b.line, doc.model.getLineCount()), 1, Math.min(b.line, doc.model.getLineCount()), 1),
    options: {
      lineNumberClassName: 'xc-bp' + (b.enabled === false || !DBG.active ? ' off' : '') + (b.verified === false ? ' unresolved' : ''),
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      lineNumberHoverMessage: { value: b.condition ? `Breakpoint (condition: \`${b.condition}\`)` : 'Breakpoint' },
    },
  }));
  DBG.bpDecos.set(doc.key, doc.model.deltaDecorations(DBG.bpDecos.get(doc.key) || [], decos));
}
function renderBreakpointDecorationsAll() { for (const d of S.docs.values()) renderBreakpointDecorations(d); }

// gutter: click a line number to add/remove, right-click for options (like Xcode)
function initBreakpointGutter() {
  const T = monaco.editor.MouseTargetType;
  editor.onMouseDown(e => {
    const t = e.target;
    if (!t || (t.type !== T.GUTTER_LINE_NUMBERS && t.type !== T.GUTTER_LINE_DECORATIONS)) return;
    if (!e.event.leftButton) return;
    const doc = activeDoc();
    if (!doc || doc.kind !== 'file' || !t.position) return;
    toggleBreakpoint(doc.path, t.position.lineNumber);
  });
  editor.onContextMenu(async e => {
    const t = e.target;
    if (!t || (t.type !== T.GUTTER_LINE_NUMBERS && t.type !== T.GUTTER_LINE_DECORATIONS) || !t.position) return;
    const doc = activeDoc();
    if (!doc || doc.kind !== 'file') return;
    const line = t.position.lineNumber;
    const b = findBp(doc.path, line);
    const id = await api.popupMenu(b ? [
      { id: 'edit', label: 'Edit Breakpoint…' },
      { id: 'toggle', label: b.enabled === false ? 'Enable Breakpoint' : 'Disable Breakpoint' },
      { id: 'delete', label: 'Delete Breakpoint' },
      { type: 'separator' },
      { id: 'nav', label: 'Reveal in Breakpoint Navigator' },
    ] : [
      { id: 'add', label: 'Add Breakpoint', accel: 'CmdOrCtrl+\\' },
      { id: 'bookmark', label: 'Add Bookmark' },
    ], e.event.posx, e.event.posy);
    if (id === 'add') toggleBreakpoint(doc.path, line);
    if (id === 'delete') toggleBreakpoint(doc.path, line);
    if (id === 'toggle') { b.enabled = b.enabled === false; pushBreakpoints(); }
    if (id === 'edit') editBreakpoint(b);
    if (id === 'nav') showNav('breakpoints');
    if (id === 'bookmark') toggleBookmark(doc.path, line);
  });
}

async function editBreakpoint(b) {
  const cond = await promptSheet(`Condition for breakpoint at ${basename(b.path)}:${b.line} (empty = always stop)`, b.condition || '', 'Done');
  if (cond === null) return;
  b.condition = cond || undefined;
  pushBreakpoints();
}

// ------------------------------------------------------------------ debug session events

api.on('debug:event', async ev => {
  if (!ev) return;
  switch (ev.event) {
    case 'attached':
      DBG.session = true;
      DBG.paused = false;
      updateDebugBar();
      break;
    case 'failed':
      DBG.session = false;
      consoleWrite('warning: the debugger could not attach — the program runs without it.\n', 'c-sys');
      updateDebugBar();
      break;
    case 'breakpoints':
      for (const r of ev.results || []) {
        const b = findBp(r.path, r.line);
        if (b) b.verified = r.verified;
      }
      renderBreakpointDecorationsAll();
      renderBreakpointNav();
      break;
    case 'stopped':
      onDebugStopped(ev);
      break;
    case 'continued':
      DBG.paused = false;
      clearPcDecorations();
      renderVariables();
      renderDebugNav();
      updateDebugBar();
      if (S.running) setStatus('running');
      break;
    case 'ended':
      DBG.session = false;
      DBG.paused = false;
      DBG.frames = [];
      clearPcDecorations();
      renderVariables();
      renderDebugNav();
      updateDebugBar();
      for (const b of DBG.breakpoints) b.verified = undefined;
      renderBreakpointDecorationsAll();
      break;
    case 'console':
      consoleWrite(ev.text, 'c-sys');
      break;
  }
});

async function onDebugStopped(ev) {
  DBG.session = true;
  DBG.paused = true;
  DBG.threadId = ev.threadId;
  DBG.threads = ev.threads || [];
  DBG.frames = ev.frames || [];
  DBG.reason = ev.reason;
  DBG.description = ev.description || ev.text || ev.reason;
  // frames without source come back as "Module.exe`mangled…": keep only real file paths
  for (const f of DBG.frames) if (!/^[A-Za-z]:[\\/][^`]*$/.test(f.path || '')) f.path = null;
  if (ev.reason === 'exception') {
    // a Swift trap: the runtime printed "Fatal error: …" to stderr just before it — Xcode shows that on the line
    await new Promise(r => setTimeout(r, 200));
    if (S.lastFatal) DBG.description = S.lastFatal;
    else if (/0xc000001d|0x80000003|illegal instruction/i.test(DBG.description)) DBG.description = 'EXC_BAD_INSTRUCTION (Swift runtime trap)';
    else if (/0xc0000005/i.test(DBG.description)) DBG.description = 'EXC_BAD_ACCESS (access violation)';
    S.lastFatal = null;
  }
  // Xcode selects the first frame that has source in the project (not a frame inside the Swift runtime)
  const inProject = f => f.path && S.root && norm(f.path).startsWith(norm(S.root)) && !/\\\.build\\/i.test(f.path);
  let idx = DBG.frames.findIndex(inProject);
  if (idx < 0) idx = DBG.frames.findIndex(f => f.path);
  DBG.frameIdx = Math.max(0, idx);
  selectFrame(DBG.frameIdx, { reveal: true });
  updateDebugBar();
  renderDebugNav();
  if (appEl.classList.contains('hide-debug')) toggleDebug(true);
  setStatus('paused');
  if (ev.reason === 'exception') showNav('debug');
}

async function selectFrame(i, { reveal = false } = {}) {
  DBG.frameIdx = i;
  const f = DBG.frames[i];
  clearPcDecorations();
  if (f && f.path && await api.exists(f.path)) {
    await openFile(f.path, { line: f.line, col: 1, focus: reveal });
    const doc = S.docs.get(docKey(f.path));
    if (doc) {
      const top = i === DBG.frames.findIndex(x => x.path);
      const crash = DBG.reason === 'exception';
      const label = top ? `Thread ${threadNumber()}: ${crash ? DBG.description : DBG.reason === 'breakpoint' ? DBG.description || 'breakpoint' : DBG.reason}` : '';
      DBG.pcDecos.set(doc.key, doc.model.deltaDecorations([], [{
        range: new monaco.Range(f.line, 1, f.line, doc.model.getLineMaxColumn(f.line)),
        options: {
          isWholeLine: true,
          className: crash ? 'xc-pc-line crash' : 'xc-pc-line',
          glyphMarginClassName: 'xc-pc-glyph',
          after: label ? { content: label, inlineClassName: crash ? 'xc-pc-label crash' : 'xc-pc-label' } : undefined,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      }]));
    }
  }
  renderDebugNav();
  renderVariables();
}

/** LLDB's own thread number ("Thread 1" is the main thread) — DAP lists threads by OS id, not in that order. */
function threadIndex(t, fallback) {
  const m = /(\d+)\s*$/.exec(t?.name || '');
  return m ? +m[1] : fallback;
}
function threadNumber() {
  const i = DBG.threads.findIndex(t => t.id === DBG.threadId);
  return threadIndex(DBG.threads[i], i >= 0 ? i + 1 : 1);
}

function clearPcDecorations() {
  for (const [key, ids] of DBG.pcDecos) {
    const doc = S.docs.get(key);
    if (doc && !doc.model.isDisposed()) doc.model.deltaDecorations(ids, []);
  }
  DBG.pcDecos.clear();
}

// ------------------------------------------------------------------ stepping

async function debugCommand(cmd) {
  if (!DBG.session) { toast('The program isn’t running under the debugger'); return; }
  const tid = DBG.threadId || DBG.threads[0]?.id;
  if (cmd === 'pause') {
    if (DBG.paused) return;
    let t = tid;
    if (!t) { const th = await api.debugRequest('threads', {}); t = th?.body?.threads?.[0]?.id; }
    await api.debugRequest('pause', { threadId: t });
    return;
  }
  if (!DBG.paused) return;
  clearPcDecorations();
  DBG.paused = false;
  updateDebugBar();
  const map = { continue: 'continue', over: 'next', into: 'stepIn', out: 'stepOut' };
  await api.debugRequest(map[cmd], { threadId: tid });
}

function updateDebugBar() {
  const bpBtn = $('#dbg-bp');
  if (!bpBtn) return;
  bpBtn.classList.toggle('active', DBG.active);
  bpBtn.title = DBG.active ? 'Deactivate Breakpoints (Ctrl+Alt+B)' : 'Activate Breakpoints (Ctrl+Alt+B)';
  const pc = $('#dbg-pause');
  pc.disabled = !DBG.session;
  pc.innerHTML = icon(DBG.paused ? 'continueBtn' : 'pause');
  pc.title = DBG.paused ? 'Continue program execution (Ctrl+Alt+Y)' : 'Pause program execution (Ctrl+Alt+Y)';
  for (const id of ['#dbg-over', '#dbg-in', '#dbg-out']) $(id).disabled = !DBG.paused;
  appEl.classList.toggle('debug-paused', DBG.paused);
  $('.console-prompt').textContent = DBG.paused ? '(lldb)' : '›';
  $('#console-in').placeholder = DBG.paused ? 'po variable, p expression, bt, frame variable…' : 'Type input for the running program and press Enter';
  renderBreakpointDecorationsAll();
}

// ------------------------------------------------------------------ variables view

const VAR_BADGE = { Locals: ['L', '#4F86C6'], Arguments: ['A', '#9E6BC9'], Globals: ['G', '#C9783B'], Statics: ['S', '#4DA05F'] };

async function renderVariables() {
  const host = $('#var-tree');
  if (!host) return;
  const f = DBG.frames[DBG.frameIdx];
  if (!DBG.paused || !f) { host.innerHTML = '<div class="placeholder">No Variables</div>'; return; }
  const filter = ($('#var-filter')?.value || '').toLowerCase();
  const scopes = await api.debugRequest('scopes', { frameId: f.id });
  const rows = [];
  const add = async (vars, depth, badge, prefix) => {
    for (const v of vars) {
      if (/^General Purpose Registers|Floating Point Registers/.test(v.name)) continue;
      // LLDB's own temporaries ($element of a for-in, $R0…) aren't the program's variables
      if (depth === 0 && v.name.startsWith('$')) continue;
      const pathKey = prefix + '/' + v.name;
      const open = DBG.varOpen.has(pathKey);
      // a struct/class shows as "(Type)" with its fields underneath, like Xcode — not "Type @ 0x…"
      let value = v.value ?? '';
      if (v.variablesReference && /^[\w.<>\[\], ]+ @ 0x[0-9a-f]+$/i.test(value)) value = '';
      if (!filter || v.name.toLowerCase().includes(filter) || depth > 0) {
        rows.push(`<div class="var-row" style="padding-left:${6 + depth * 14}px" data-k="${esc(pathKey)}" data-ref="${v.variablesReference || 0}" title="${esc(`${v.name}: ${v.type || ''} = ${v.value ?? ''}`)}">
          <span class="twisty">${v.variablesReference ? icon('chevronDown', open ? '' : 'closed') : ''}</span>
          ${depth === 0 && badge ? `<span class="var-badge" style="background:${badge[1]}">${badge[0]}</span>` : ''}
          <span class="var-name">${esc(v.name)}</span><span class="var-eq">=</span>${v.type ? `<span class="var-type">(${esc(v.type)})</span>` : ''}<span class="var-val">${esc(value)}</span></div>`);
      }
      if (open && v.variablesReference) {
        const kids = await api.debugRequest('variables', { variablesReference: v.variablesReference });
        await add(kids?.body?.variables || [], depth + 1, null, pathKey);
      }
    }
  };
  for (const sc of scopes?.body?.scopes || []) {
    if (/register/i.test(sc.name)) continue;
    const v = await api.debugRequest('variables', { variablesReference: sc.variablesReference });
    await add(v?.body?.variables || [], 0, VAR_BADGE[sc.name] || ['V', '#777'], sc.name);
  }
  host.innerHTML = rows.join('') || '<div class="placeholder">No Variables</div>';
}

// ------------------------------------------------------------------ navigators

function renderDebugNav() {
  const host = $('#debug-nav');
  if (!host) return;
  if (!DBG.session) { host.innerHTML = '<div class="nav-empty">Not Debugging<br><small>Run the app (Ctrl+R) — it runs under LLDB like in Xcode.</small></div>'; return; }
  const head = `<div class="dn-proc">${FILE_BADGES.app}<b>${esc(S.name)}</b><span>PID ${esc(String($('#dbg-process').dataset.pid || ''))}</span><span class="dn-state">${DBG.paused ? 'Paused' : 'Running'}</span></div>`;
  if (!DBG.paused) { host.innerHTML = head; return; }
  const out = [head];
  const threads = DBG.threads.map((t, ti) => ({ t, n: threadIndex(t, ti + 1) })).sort((a, b) => a.n - b.n);
  threads.forEach(({ t, n }) => {
    const cur = t.id === DBG.threadId;
    out.push(`<div class="group-row dn-thread">${icon('debugNav')}Thread ${n}${cur && DBG.description ? `<span class="dn-why">${esc(DBG.description)}</span>` : ''}</div>`);
    if (!cur) return;
    DBG.frames.forEach((f, i) => {
      const mine = f.path && S.root && norm(f.path).startsWith(norm(S.root));
      out.push(`<div class="item-row dn-frame ${i === DBG.frameIdx ? 'selected' : ''} ${mine ? '' : 'sys'}" data-frame="${i}">
        <span class="dn-num">${i}</span><div class="txt"><div class="ln" style="font-family:var(--font-ui)" title="${esc(f.name)}">${esc(frameTitle(f.name))}</div>${f.path ? `<div class="sub">${esc(basename(f.path))}:${f.line}</div>` : ''}</div></div>`);
    });
  });
  host.innerHTML = out.join('');
}

/** "MyApp.exe`SwiftUI.TabView<…>.init(content: …) -> …" → "TabView.init(content:)", like Xcode's Debug navigator. */
function frameTitle(name) {
  let n = String(name || '').replace(/^[\w.-]+\.(exe|dll)`/i, '');
  let prev;
  do { prev = n; n = n.replace(/<[^<>]*>/g, ''); } while (n !== prev);
  const mod = (S.name || '').replace(/[^A-Za-z0-9_]/g, '_');
  n = n.replace(/\b(SwiftUI|Swift|Foundation|Dispatch)\./g, '').replace(mod ? new RegExp(`\\b${mod}\\.`, 'g') : /^$/, '');
  n = n.replace(/\s:\s.*$/, '').replace(/\(void\)/, '()');
  // keep "name(label:label:)" — drop types, return type and where-clauses
  const open = n.indexOf('(');
  if (open > 0 && !/^closure|^protocol witness|^reabstraction/.test(n) && !/^\(([\w_]+:)*\)/.test(n.slice(open))) {
    let depth = 0, close = -1;
    for (let i = open; i < n.length; i++) { if (n[i] === '(') depth++; else if (n[i] === ')' && --depth === 0) { close = i; break; } }
    if (close > 0) {
      const args = [];
      let d = 0, cur = '';
      for (const ch of n.slice(open + 1, close)) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && d === 0) { args.push(cur); cur = ''; } else cur += ch; }
      if (cur.trim()) args.push(cur);
      const labels = args.map(a => a.trim()).filter(Boolean).map(a => { const m = a.match(/^([\w_]+)\s*:/); return (m ? m[1] : '_') + ':'; });
      n = n.slice(0, open) + '(' + labels.join('') + ')';
    }
  }
  return n.replace(/ where .*$/, '').trim() || String(name);
}

function renderBreakpointNav() {
  const host = $('#bp-nav');
  if (!host) return;
  if (!DBG.breakpoints.length) { host.innerHTML = '<div class="nav-empty">No Breakpoints<br><small>Click a line number in the editor to add one.</small></div>'; return; }
  const groups = new Map();
  for (const b of DBG.breakpoints) { if (!groups.has(b.path)) groups.set(b.path, []); groups.get(b.path).push(b); }
  const out = [];
  for (const [p, list] of groups) {
    out.push(`<div class="group-row"><span class="badge">${fileBadge(basename(p), 'file')}</span>${esc(basename(p))}<span class="count">${list.length}</span></div>`);
    for (const b of list) {
      const doc = S.docs.get(docKey(p));
      const text = doc ? doc.model.getLineContent(Math.min(b.line, doc.model.getLineCount())).trim() : '';
      out.push(`<div class="item-row bp-row ${b.enabled === false || !DBG.active ? 'off' : ''}" data-open="${esc(p)}" data-line="${b.line}">
        <span class="bp-chip ${b.enabled === false || !DBG.active ? 'off' : ''}" data-bp="${esc(bpKey(p, b.line))}" title="Enable / disable"></span>
        <div class="txt"><div class="ln">${esc(text || '—')}</div><div class="sub">line ${b.line}${b.condition ? ` · if ${esc(b.condition)}` : ''}${b.verified === false ? ' · unresolved' : ''}</div></div></div>`);
    }
  }
  host.innerHTML = out.join('');
}

$('#bp-nav').addEventListener('click', e => {
  const chip = e.target.closest('[data-bp]');
  if (chip) {
    e.stopPropagation();
    const b = DBG.breakpoints.find(x => bpKey(x.path, x.line) === chip.dataset.bp);
    if (b) { b.enabled = b.enabled === false; pushBreakpoints(); }
    return;
  }
  const r = e.target.closest('[data-open]');
  if (r) openFile(r.dataset.open, { line: +r.dataset.line });
});
$('#bp-nav').addEventListener('contextmenu', async e => {
  const r = e.target.closest('[data-open]');
  if (!r) return;
  const b = findBp(r.dataset.open, +r.dataset.line);
  if (!b) return;
  const id = await api.popupMenu([{ id: 'edit', label: 'Edit Breakpoint…' }, { id: 'toggle', label: b.enabled === false ? 'Enable Breakpoint' : 'Disable Breakpoint' }, { id: 'delete', label: 'Delete Breakpoint' }, { type: 'separator' }, { id: 'all', label: 'Delete All Breakpoints' }], e.clientX, e.clientY);
  if (id === 'edit') editBreakpoint(b);
  if (id === 'toggle') { b.enabled = b.enabled === false; pushBreakpoints(); }
  if (id === 'delete') toggleBreakpoint(b.path, b.line);
  if (id === 'all') { DBG.breakpoints = []; pushBreakpoints(); }
});
$('#debug-nav').addEventListener('click', e => {
  const r = e.target.closest('[data-frame]');
  if (r) selectFrame(+r.dataset.frame, { reveal: true });
});
$('#var-tree').addEventListener('click', e => {
  const r = e.target.closest('.var-row');
  if (!r || r.dataset.ref === '0') return;
  const k = r.dataset.k;
  if (DBG.varOpen.has(k)) DBG.varOpen.delete(k); else DBG.varOpen.add(k);
  renderVariables();
});
$('#var-filter').addEventListener('input', debounce(renderVariables, 200));

// debug bar
$('#dbg-bp').onclick = () => { DBG.active = !DBG.active; pushBreakpoints(); updateDebugBar(); };
$('#dbg-pause').onclick = () => debugCommand(DBG.paused ? 'continue' : 'pause');
$('#dbg-over').onclick = () => debugCommand('over');
$('#dbg-in').onclick = () => debugCommand('into');
$('#dbg-out').onclick = () => debugCommand('out');

// ------------------------------------------------------------------ LLDB console & data tips

/** While paused, the console talks to LLDB like Xcode's "(lldb)" prompt. */
async function lldbEvaluate(text) {
  const f = DBG.frames[DBG.frameIdx];
  consoleWrite(`(lldb) ${text}\n`, 'c-in');
  const m = /^(po|p|print|e|expression)\s+([A-Za-z_][\w.\[\]]*)\s*$/.exec(text);
  // `p variable` reads memory directly like Xcode's dwim-print (no expression compile, so it's instant)
  if (m && (m[1] === 'p' || m[1] === 'print')) {
    const v = await api.debugRequest('evaluate', { expression: `frame variable ${m[2]}`, context: 'repl', frameId: f?.id });
    if (v && v.success !== false && v.body?.result && !/^error:/.test(v.body.result)) { consoleWrite(v.body.result + (v.body.result.endsWith('\n') ? '' : '\n'), ''); return; }
  }
  const slow = setTimeout(() => toast('LLDB is compiling the expression… (the first po in a session takes a while)', 5000), 2500);
  let r = await api.debugRequest('evaluate', { expression: text, context: 'repl', frameId: f?.id });
  clearTimeout(slow);
  // when the expression evaluator can't (Clang importer, IRGen…), show the variable the way `frame variable` sees it
  const failed = !r || r.success === false || /^error:|couldn't IRGen|Clang importer/m.test(r.body?.result || '');
  if (failed && m) {
    const v = await api.debugRequest('evaluate', { expression: `frame variable ${m[1] === 'po' ? '-O ' : ''}${m[2]}`, context: 'repl', frameId: f?.id });
    if (v && v.success !== false && v.body?.result && !/^error:/.test(v.body.result)) r = v;
  }
  if (!r) { consoleWrite('error: no response from LLDB\n', 'c-err'); return; }
  if (r.success === false) consoleWrite((r.message || 'error') + '\n', 'c-err');
  else if (r.body?.result) consoleWrite(r.body.result + (r.body.result.endsWith('\n') ? '' : '\n'), /^error:/.test(r.body.result) ? 'c-err' : '');
  renderVariables();
}

function initDebugHover() {
  monaco.languages.registerHoverProvider(SWIFT_LANG, {
    async provideHover(model, position) {
      if (!DBG.paused) return null;
      const w = model.getWordAtPosition(position);
      if (!w || !/^[A-Za-z_]\w*$/.test(w.word)) return null;
      const f = DBG.frames[DBG.frameIdx];
      const r = await api.debugRequest('evaluate', { expression: w.word, context: 'hover', frameId: f?.id });
      if (!r || r.success === false || !r.body?.result) return null;
      return { range: new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn), contents: [{ value: '```swift\n' + `${w.word}${r.body.type ? ': ' + r.body.type : ''} = ${r.body.result}` + '\n```' }] };
    },
  });
}

// ------------------------------------------------------------------ bookmarks (Xcode 15)

function toggleBookmark(p, line) {
  if (!S.root) return;
  P.projects = P.projects || {};
  const cur = P.projects[norm(S.root)] || {};
  const list = cur.bookmarks || [];
  const i = list.findIndex(b => norm(b.path) === norm(p) && b.line === line);
  if (i >= 0) list.splice(i, 1);
  else {
    const doc = S.docs.get(docKey(p));
    list.push({ path: p, line, text: doc ? doc.model.getLineContent(line).trim().slice(0, 120) : '' });
  }
  cur.bookmarks = list;
  P.projects[norm(S.root)] = cur;
  saveProjectStateDebounced();
  renderBookmarkDecorationsAll();
  if (S.nav === 'bookmarks') renderBookmarks();
  toast(i >= 0 ? 'Bookmark removed' : 'Bookmark added');
}

function projectBookmarks() { return (S.root && (P.projects || {})[norm(S.root)]?.bookmarks) || []; }

let bookmarkIdx = -1;
function jumpToBookmark(delta) {
  const list = projectBookmarks();
  if (!list.length) { toast('No Bookmarks'); return; }
  bookmarkIdx = (bookmarkIdx + delta + list.length) % list.length;
  openFile(list[bookmarkIdx].path, { line: list[bookmarkIdx].line });
}

const bmDecos = new Map();
function renderBookmarkDecorations(doc) {
  if (!doc || doc.kind !== 'file' || doc.model.isDisposed()) return;
  const list = projectBookmarks().filter(b => norm(b.path) === norm(doc.path));
  bmDecos.set(doc.key, doc.model.deltaDecorations(bmDecos.get(doc.key) || [], list.map(b => ({
    range: new monaco.Range(Math.min(b.line, doc.model.getLineCount()), 1, Math.min(b.line, doc.model.getLineCount()), 1),
    options: { linesDecorationsClassName: 'xc-bookmark', stickiness: 1 },
  }))));
}
function renderBookmarkDecorationsAll() { for (const d of S.docs.values()) renderBookmarkDecorations(d); }

function renderBookmarks() {
  const host = $('#bookmark-list');
  if (!host) return;
  const list = projectBookmarks();
  if (!list.length) { host.innerHTML = '<div class="nav-empty">No Bookmarks<br><small>Right-click a line number ▸ Add Bookmark, or Editor ▸ Add Bookmark (Ctrl+Alt+K).</small></div>'; return; }
  host.innerHTML = list.map((b, i) => `<div class="item-row" data-open="${esc(b.path)}" data-line="${b.line}" data-i="${i}">${icon('bookmark')}
    <div class="txt"><div class="ln">${esc(b.text || '—')}</div><div class="sub">${esc(basename(b.path))}:${b.line}</div></div></div>`).join('');
}
$('#bookmark-list').addEventListener('click', e => {
  const r = e.target.closest('[data-open]');
  if (r) openFile(r.dataset.open, { line: +r.dataset.line });
});
$('#bookmark-list').addEventListener('contextmenu', async e => {
  const r = e.target.closest('[data-open]');
  if (!r) return;
  const id = await api.popupMenu([{ id: 'del', label: 'Delete Bookmark' }], e.clientX, e.clientY);
  if (id === 'del') toggleBookmark(r.dataset.open, +r.dataset.line);
});
