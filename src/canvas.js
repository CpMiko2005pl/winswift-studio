'use strict';
// Canvas: Xcode's live SwiftUI previews next to the editor (Editor ▸ Canvas, ⌥⌘↩ → Ctrl+Alt+Enter).

const CV = {
  ready: false,          // the embedded simulator page has loaded
  queue: [],             // messages for the page until it's ready
  target: null,          // { file, index } being previewed
  pinned: null,          // file pinned with the pin button
  building: false,
  pending: false,        // another update was requested while building
  seq: 0,
  scheme: 'light',
  shownFor: null,        // target key of the frame on screen
  changedAt: 0,
};

const cvFrame = () => $('#cv-frame');

function cvPost(type, data) {
  const msg = { __canvasHost: true, type, data };
  if (!CV.ready) { CV.queue.push(msg); return; }
  cvFrame().contentWindow.postMessage(msg, '*');
}

window.addEventListener('message', async e => {
  const m = e.data;
  if (!m || !m.__canvas || e.source !== cvFrame().contentWindow) return;
  const reply = data => cvFrame().contentWindow.postMessage({ __canvasHost: true, reply: m.id, data }, '*');
  switch (m.type) {
    case 'info': reply({ ...(await api.previewInfo()), app: S.name || 'Preview' }); break;
    case 'device': reply(await api.simDevice()); break;
    case 'event':
      if (m.data && m.data.k === 'scheme') CV.scheme = m.data.v;
      api.previewInput(m.data);
      break;
    case 'openLink': api.openExternal(m.data); break;
    case 'ready':
      CV.ready = true;
      for (const q of CV.queue) cvFrame().contentWindow.postMessage(q, '*');
      CV.queue = [];
      break;
  }
});

/** #Preview blocks in a source text: [{ title, line }] */
function parsePreviews(text) {
  const out = [];
  const re = /^[ \t]*#Preview\b\s*(?:\(\s*"([^"]*)")?/gm;
  let m;
  while ((m = re.exec(text))) out.push({ title: m[1] || 'Preview', line: text.slice(0, m.index).split('\n').length });
  return out;
}

function canvasShown() { return appEl.classList.contains('show-canvas'); }

function toggleCanvas(force) {
  const show = force !== undefined ? force : !canvasShown();
  appEl.classList.toggle('show-canvas', show);
  setSetting('canvas', show);
  if (show) refreshCanvas({ reason: 'open' });
  else { api.previewStop(); CV.shownFor = null; CV.building = false; }
}

function canvasSource() {
  const pinned = CV.pinned && S.docs.get(docKey(CV.pinned));
  const doc = pinned || activeDoc();
  if (!doc || doc.kind !== 'file' || !/\.swift$/i.test(doc.path)) return null;
  return doc;
}

function renderCanvasTabs(doc, previews) {
  const host = $('#cv-tabs');
  if (!doc || !previews.length) { host.innerHTML = ''; return; }
  const idx = CV.target && norm(CV.target.file) === norm(doc.path) ? CV.target.index : 0;
  host.innerHTML = previews.map((p, i) => `<span class="cv-tab ${i === idx ? 'sel' : ''}" data-i="${i}" title="${esc(basename(doc.path))}, line ${p.line}">${esc(p.title)}</span>`).join('');
  $('#cv-pin').classList.toggle('active', !!CV.pinned);
}

$('#cv-tabs').addEventListener('click', e => {
  const t = e.target.closest('.cv-tab');
  if (!t || !CV.target) return;
  CV.target.index = +t.dataset.i;
  refreshCanvas({ force: true });
});

function canvasStatus(html, cls = '') {
  const el = $('#cv-status');
  el.className = 'cv-status' + (html ? ' show ' + cls : '');
  el.innerHTML = html || '';
}

/** Rebuilds the preview for the active (or pinned) file — after edits, file switches and on demand. */
function refreshCanvas({ force = false } = {}) {
  if (!canvasShown() || !S.root) return;
  const doc = canvasSource();
  const previews = doc ? parsePreviews(doc.model.getValue()) : [];
  if (!doc || !previews.length) {
    renderCanvasTabs(null, []);
    CV.target = null;
    api.previewStop();
    CV.shownFor = null;
    cvPost('state', { state: 'launching', app: S.name });
    canvasStatus(`<div class="cv-empty"><b>No Preview</b><span>${doc ? 'Add a <code>#Preview { … }</code> to this file to see it here.' : 'Open a SwiftUI file to preview it.'}</span></div>`, 'empty');
    $('#cv-progress').classList.remove('on');
    return;
  }
  const same = CV.target && norm(CV.target.file) === norm(doc.path);
  const index = same ? Math.min(CV.target.index, previews.length - 1) : 0;
  CV.target = { file: doc.path, index };
  renderCanvasTabs(doc, previews);
  if (CV.building) { CV.pending = true; return; }
  const key = `${norm(doc.path)}#${index}`;
  if (!force && CV.shownFor === key && !CV.dirtySinceBuild) return;
  startCanvasBuild(doc, index, key);
}

function startCanvasBuild(doc, index, key) {
  CV.building = true;
  CV.pending = false;
  CV.dirtySinceBuild = false;
  CV.buildingFor = key;
  // what's in the editor wins over the files on disk, like Xcode's auto-saving previews
  const overrides = {};
  for (const d of S.docs.values()) if (d.kind === 'file' && /\.swift$/i.test(d.path) && isDirty(d)) overrides[d.path.toLowerCase()] = d.model.getValue();
  $('#cv-progress').classList.add('on');
  if (CV.shownFor !== key) canvasStatus('<div class="cv-pill">Preparing Preview…</div>', 'pill');
  else canvasStatus('');
  $('#cv-time').textContent = '';
  api.previewStart({ root: S.root, file: doc.path, index, scheme: CV.scheme === 'dark' ? 'dark' : undefined, overrides });
}

api.on('preview:event', ev => {
  if (!ev) return;
  switch (ev.type) {
    case 'building': break;
    case 'running':
      CV.building = false;
      $('#cv-progress').classList.remove('on');
      if (CV.shownFor !== CV.buildingFor) cvPost('state', { state: 'launching', app: S.name });
      CV.shownFor = CV.buildingFor;
      canvasStatus('');
      $('#cv-time').textContent = ev.ms ? `${(ev.ms / 1000).toFixed(1)} s` : '';
      if (CV.pending) setTimeout(() => refreshCanvas({ force: true }), 50);
      break;
    case 'frame':
      cvPost('frame', ev.json);
      break;
    case 'error': {
      CV.building = false;
      $('#cv-progress').classList.remove('on');
      const errs = (ev.errors || []).slice(0, 6);
      canvasStatus(`<div class="cv-error"><div class="cv-err-title">${icon('warning')} Cannot preview in this file</div>
        <div class="cv-err-sub">Failed to build ${esc(S.name)}.</div>
        ${errs.map((er, i) => `<div class="cv-err-row" data-i="${i}">${er.file ? `<b>${esc(basename(er.file))}:${er.line}</b> ` : ''}${esc(er.message)}</div>`).join('')}
        <button class="btn" id="cv-retry">Try Again</button></div>`, 'error');
      $$('#cv-status .cv-err-row').forEach(r => r.onclick = () => { const er = errs[+r.dataset.i]; if (er.file) openFile(er.file, { line: er.line, col: er.col || 1 }); });
      $('#cv-retry').onclick = () => refreshCanvas({ force: true });
      if (CV.pending) setTimeout(() => refreshCanvas({ force: true }), 50);
      break;
    }
    case 'crashed':
      canvasStatus(`<div class="cv-error"><div class="cv-err-title">${icon('warning')} ${esc(S.name)} crashed</div>
        <pre class="cv-err-log">${esc(ev.message || `Exit code ${ev.code}`)}</pre><button class="btn" id="cv-retry">Try Again</button></div>`, 'error');
      $('#cv-retry').onclick = () => refreshCanvas({ force: true });
      CV.shownFor = null;
      break;
  }
});

/** Edits update the preview after typing pauses (a preview build takes a few seconds). */
const canvasAfterEdit = debounce(() => refreshCanvas({ force: true }), 1200);
function canvasNoteEdit(doc) {
  if (!canvasShown() || !doc || doc.kind !== 'file' || !/\.swift$/i.test(doc.path)) return;
  CV.dirtySinceBuild = true;
  canvasAfterEdit();
}

$('#cv-close').onclick = () => toggleCanvas(false);
$('#cv-refresh').onclick = () => refreshCanvas({ force: true });
$('#cv-pin').onclick = () => {
  CV.pinned = CV.pinned ? null : CV.target?.file || null;
  $('#cv-pin').classList.toggle('active', !!CV.pinned);
  toast(CV.pinned ? `Pinned ${basename(CV.pinned)}` : 'Preview unpinned');
  refreshCanvas();
};
$('#cv-scheme').onclick = () => cvPost('toggleAppearance');
$('#cv-device').onclick = async e => {
  const r = e.currentTarget.getBoundingClientRect();
  const id = await api.popupMenu([
    { label: 'Device', submenu: SIM_DEVICES.map(d => ({ id: 'dest:' + d.name, label: d.name, checked: S.device === d.name })) },
    { type: 'separator' },
    { id: 'light', label: 'Light Appearance', checked: CV.scheme !== 'dark' },
    { id: 'dark', label: 'Dark Appearance', checked: CV.scheme === 'dark' },
    { type: 'separator' },
    { id: 'sim', label: 'Run in Simulator…' },
  ], r.left, r.top - 120);
  if (id && id.startsWith('dest:')) setSimDevice(id.slice(5));
  if ((id === 'light' && CV.scheme === 'dark') || (id === 'dark' && CV.scheme !== 'dark')) cvPost('toggleAppearance');
  if (id === 'sim') previewAction();
};

makeSplitter($('#split-canvas'), {
  axis: 'x', invert: true, min: 240, max: 900,
  get: () => cssNum('--canvas-w'),
  set: (v, save) => { document.documentElement.style.setProperty('--canvas-w', v + 'px'); if (save) setSetting('canvasW', v); },
});
document.documentElement.style.setProperty('--canvas-w', (setting('canvasW') || 380) + 'px');
