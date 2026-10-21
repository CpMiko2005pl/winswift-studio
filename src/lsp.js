'use strict';
// SourceKit-LSP client — the engine behind Xcode's code completion, live issues, Quick Help and refactoring.

const LSP = {
  active: false,          // server initialized for the open project
  starting: false,
  root: null,
  opened: new Map(),      // uri -> { version, doc, timer }
  diags: new Map(),       // norm(path) -> live issues
  raw: new Map(),         // norm(path) -> raw LSP diagnostics (for code actions)
  progress: new Map(),    // token -> title
};

const LSP_SEVERITY = { 1: 'error', 2: 'warning', 3: 'note', 4: 'note' };

// diagnostics that only exist because SwiftCode isn't Xcode (the build handles these itself)
const LSP_NOISE = [/macro ['‘]?Preview['’]?/i, /No macro named 'Preview'/i, /external macro implementation type .*Preview/i];

function fileUri(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  return 'file:///' + parts.map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join('/');
}
function uriToPath(uri) {
  try { return decodeURIComponent(String(uri).replace(/^file:\/\/\//i, '')).replace(/\//g, '\\'); } catch { return null; }
}
const toLspPos = p => ({ line: p.lineNumber - 1, character: p.column - 1 });
const fromLspRange = r => new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);

/** Is SourceKit serving this model? (Used by swift-lang.js to step its simple providers aside.) */
window.swiftLspActive = model => LSP.active && !!model && model.getLanguageId() === SWIFT_LANG && model.uri.scheme === 'file';

function docForModel(model) {
  if (!model || model.uri.scheme !== 'file') return null;
  return S.docs.get(model.uri.toString()) || null;
}

// ------------------------------------------------------------------ lifecycle

async function lspStartProject(root) {
  await lspStopProject();
  if (!root) return;
  LSP.root = root;
  LSP.starting = true;
  renderBackgroundActivity();
  const r = await api.lspStart(root);
  if (LSP.root !== root) return;
  LSP.starting = false;
  LSP.active = !!(r && r.ok);
  if (editor) editor.updateOptions({ wordBasedSuggestions: LSP.active ? 'off' : 'matchingDocuments' });
  renderBackgroundActivity();
  if (!LSP.active) return;
  // the visible files are the ones SourceKit should keep type-checked
  for (const key of S.tabs) { const d = S.docs.get(key); if (d) lspOpen(d); }
  const a = activeDoc();
  if (a) lspOpen(a);
}

async function lspStopProject() {
  const was = LSP.active || LSP.starting;
  LSP.active = false;
  LSP.starting = false;
  LSP.root = null;
  for (const o of LSP.opened.values()) clearTimeout(o.timer);
  LSP.opened.clear();
  LSP.diags.clear();
  LSP.raw.clear();
  LSP.progress.clear();
  if (was) await api.lspStop();
  renderBackgroundActivity();
}

function lspWants(doc) {
  return LSP.active && doc && doc.kind === 'file' && /\.swift$/i.test(doc.path) && LSP.root && norm(doc.path).startsWith(norm(LSP.root));
}

function lspOpen(doc) {
  if (!lspWants(doc)) return;
  const uri = fileUri(doc.path);
  if (LSP.opened.has(uri)) return;
  LSP.opened.set(uri, { version: 1, doc, timer: null, dirty: false });
  api.lspNotify('textDocument/didOpen', { textDocument: { uri, languageId: 'swift', version: 1, text: doc.model.getValue() } });
}

function lspClose(doc) {
  if (!doc || doc.kind !== 'file') return;
  const uri = fileUri(doc.path);
  const o = LSP.opened.get(uri);
  if (!o) return;
  clearTimeout(o.timer);
  LSP.opened.delete(uri);
  if (LSP.active) api.lspNotify('textDocument/didClose', { textDocument: { uri } });
}

/** Text changed: tell SourceKit shortly after typing pauses (or right away before a request needs it). */
function lspChanged(doc) {
  if (!lspWants(doc)) return;
  const uri = fileUri(doc.path);
  if (!LSP.opened.has(uri)) { lspOpen(doc); return; }
  const o = LSP.opened.get(uri);
  o.dirty = true;
  clearTimeout(o.timer);
  o.timer = setTimeout(() => lspFlush(doc), 250);
}

function lspFlush(doc) {
  if (!doc) return;
  const uri = fileUri(doc.path);
  const o = LSP.opened.get(uri);
  if (!o) { lspOpen(doc); return; }
  clearTimeout(o.timer);
  if (!o.dirty) return;
  o.dirty = false;
  o.version++;
  api.lspNotify('textDocument/didChange', { textDocument: { uri, version: o.version }, contentChanges: [{ text: doc.model.getValue() }] });
}

function lspSaved(doc) {
  if (!lspWants(doc)) return;
  const uri = fileUri(doc.path);
  if (!LSP.opened.has(uri)) return;
  lspFlush(doc);
  api.lspNotify('textDocument/didSave', { textDocument: { uri } });
}

/** Make sure SourceKit has the latest text of a model before asking it something. */
function lspReady(model) {
  const doc = docForModel(model);
  if (!lspWants(doc)) return null;
  if (!LSP.opened.has(fileUri(doc.path))) lspOpen(doc); else lspFlush(doc);
  return { doc, uri: fileUri(doc.path) };
}

async function lspCall(method, params) {
  const r = await api.lspRequest(method, params);
  if (!r || r.error) return null;
  return r.result;
}

// ------------------------------------------------------------------ notifications

api.on('lsp:notification', msg => {
  if (!msg) return;
  if (msg.method === 'textDocument/publishDiagnostics') onLspDiagnostics(msg.params);
  else if (msg.method === '$/progress') onLspProgress(msg.params);
  else if (msg.method === 'swiftcode/status') {
    if (msg.params.state === 'stopped' && LSP.active) { LSP.active = false; renderBackgroundActivity(); }
  } else if (msg.method === 'swiftcode/applyEdit') applyLspWorkspaceEdit(msg.params.edit);
});

function onLspDiagnostics(p) {
  const file = uriToPath(p.uri);
  if (!file) return;
  const key = norm(file);
  const raw = (p.diagnostics || []).filter(d => !LSP_NOISE.some(re => re.test(d.message)));
  LSP.raw.set(key, raw);
  LSP.diags.set(key, raw.map(d => ({
    file, line: d.range.start.line + 1, col: d.range.start.character + 1,
    endLine: d.range.end.line + 1, endCol: d.range.end.character + 1,
    severity: LSP_SEVERITY[d.severity] || 'error', message: d.message, live: true, inProject: true,
  })));
  const doc = S.docs.get(docKey(file));
  if (doc) applyDiagsToDoc(doc);
  refreshIssueViews();
}

function onLspProgress(p) {
  const v = p.value || {};
  if (v.kind === 'begin') LSP.progress.set(p.token, v.title || 'Indexing');
  else if (v.kind === 'report' && v.message) LSP.progress.set(p.token, (LSP.progress.get(p.token) || '').split(' — ')[0] + (v.message ? ` — ${v.message}` : ''));
  else if (v.kind === 'end') LSP.progress.delete(p.token);
  renderBackgroundActivity();
}

/** Xcode shows "Indexing…" next to the build status while SourceKit works in the background. */
function renderBackgroundActivity() {
  const el = $('#act-bg');
  if (!el) return;
  let text = '';
  if (LSP.starting) text = 'Indexing';
  else if (LSP.progress.size) text = [...LSP.progress.values()][0].replace(/^Indexing.*$/i, 'Indexing');
  el.textContent = text ? `| ${text}…` : '';
  el.classList.toggle('on', !!text);
}

// ------------------------------------------------------------------ edits

function lspTextEditsToMonaco(edits) {
  return (edits || []).map(e => ({ range: fromLspRange(e.range), text: e.newText }));
}

/** Applies a WorkspaceEdit to the files (opening models for files that aren't loaded yet). */
async function applyLspWorkspaceEdit(edit) {
  if (!edit) return 0;
  const perFile = new Map();
  for (const [uri, edits] of Object.entries(edit.changes || {})) perFile.set(uri, edits);
  for (const dc of edit.documentChanges || []) if (dc.textDocument && dc.edits) perFile.set(dc.textDocument.uri, dc.edits);
  let n = 0;
  for (const [uri, edits] of perFile) {
    const file = uriToPath(uri);
    const doc = file && await ensureDoc(file);
    if (!doc) continue;
    doc.model.pushEditOperations([], lspTextEditsToMonaco(edits), () => null);
    n += edits.length;
  }
  return n;
}

// ------------------------------------------------------------------ Monaco providers

const LSP_KIND = () => {
  const K = monaco.languages.CompletionItemKind;
  return { 1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field, 6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
    11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet, 16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
    21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter };
};

const mdDoc = d => (d == null ? undefined : typeof d === 'string' ? d : { value: d.value || '' });

function lspInit(monaco) {
  const SnippetRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  const kinds = LSP_KIND();

  monaco.languages.registerCompletionItemProvider(SWIFT_LANG, {
    triggerCharacters: ['.', '(', ',', ':', '\\'],
    async provideCompletionItems(model, position, context) {
      const t = lspReady(model);
      if (!t) return { suggestions: [] };
      const res = await lspCall('textDocument/completion', {
        textDocument: { uri: t.uri }, position: toLspPos(position),
        context: { triggerKind: (context.triggerKind || 0) + 1, triggerCharacter: context.triggerCharacter },
      });
      if (!res) return { suggestions: [] };
      const items = Array.isArray(res) ? res : res.items || [];
      const word = model.getWordUntilPosition(position);
      const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const suggestions = items.map(it => {
        let range = fallback;
        let text = it.insertText != null ? it.insertText : it.label;
        if (it.textEdit) {
          const r = fromLspRange(it.textEdit.range || it.textEdit.insert);
          if (r.startLineNumber === position.lineNumber && r.endLineNumber === position.lineNumber && r.startColumn <= position.column) range = r;
          text = it.textEdit.newText;
        }
        return {
          label: it.labelDetails ? { label: it.label, detail: it.labelDetails.detail, description: it.labelDetails.description } : it.label,
          kind: kinds[it.kind] ?? monaco.languages.CompletionItemKind.Text,
          detail: it.detail,
          documentation: mdDoc(it.documentation),
          insertText: text,
          insertTextRules: it.insertTextFormat === 2 ? SnippetRule : 0,
          range,
          sortText: it.sortText,
          filterText: it.filterText,
          preselect: it.preselect,
          tags: it.deprecated ? [1] : undefined,
          additionalTextEdits: it.additionalTextEdits ? lspTextEditsToMonaco(it.additionalTextEdits) : undefined,
        };
      });
      return { suggestions, incomplete: !Array.isArray(res) && !!res.isIncomplete };
    },
  });

  monaco.languages.registerHoverProvider(SWIFT_LANG, {
    async provideHover(model, position) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/hover', { textDocument: { uri: t.uri }, position: toLspPos(position) });
      if (!res || !res.contents) return null;
      const c = res.contents;
      const value = typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (typeof x === 'string' ? x : '```swift\n' + x.value + '\n```')).join('\n\n') : c.value;
      if (!value) return null;
      return { contents: [{ value: cleanSignature(value.replace(/^## Multiple results\n+/, '')) }], range: res.range ? fromLspRange(res.range) : undefined };
    },
  });

  monaco.languages.registerSignatureHelpProvider(SWIFT_LANG, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    async provideSignatureHelp(model, position) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/signatureHelp', { textDocument: { uri: t.uri }, position: toLspPos(position) });
      if (!res || !res.signatures || !res.signatures.length) return null;
      return {
        value: {
          activeSignature: res.activeSignature || 0,
          activeParameter: res.activeParameter || 0,
          signatures: res.signatures.map(s => ({ label: s.label, documentation: mdDoc(s.documentation), parameters: (s.parameters || []).map(p => ({ label: p.label, documentation: mdDoc(p.documentation) })) })),
        },
        dispose() {},
      };
    },
  });

  const toLocations = res => {
    if (!res) return [];
    const list = Array.isArray(res) ? res : [res];
    return list.map(l => {
      const uri = l.uri || l.targetUri;
      const range = l.range || l.targetSelectionRange || l.targetRange;
      const file = uri && /^file:/i.test(uri) ? uriToPath(uri) : null;
      return file && range ? { uri: monaco.Uri.file(file), range: fromLspRange(range) } : null;
    }).filter(Boolean);
  };

  monaco.languages.registerDefinitionProvider(SWIFT_LANG, {
    async provideDefinition(model, position) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/definition', { textDocument: { uri: t.uri }, position: toLspPos(position) });
      const locs = toLocations(res);
      for (const l of locs) await ensureDoc(l.uri.fsPath);
      return locs;
    },
  });

  monaco.languages.registerReferenceProvider(SWIFT_LANG, {
    async provideReferences(model, position, context) {
      const t = lspReady(model);
      if (!t) return null;
      let locs = toLocations(await lspCall('textDocument/references', { textDocument: { uri: t.uri }, position: toLspPos(position), context: { includeDeclaration: context.includeDeclaration } }));
      // without an index SourceKit only knows the current file: fall back to a project-wide identifier search
      if (locs.length <= 1) locs = textReferences(model, position) || locs;
      return locs;
    },
  });

  monaco.languages.registerDocumentHighlightProvider(SWIFT_LANG, {
    async provideDocumentHighlights(model, position) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/documentHighlight', { textDocument: { uri: t.uri }, position: toLspPos(position) });
      return (res || []).map(h => ({ range: fromLspRange(h.range), kind: (h.kind || 1) - 1 }));
    },
  });

  monaco.languages.registerRenameProvider(SWIFT_LANG, {
    async provideRenameEdits(model, position, newName) {
      const t = lspReady(model);
      if (!t) return null;
      let edit = await lspCall('textDocument/rename', { textDocument: { uri: t.uri }, position: toLspPos(position), newName });
      const count = edit ? Object.values(edit.changes || {}).reduce((a, e) => a + e.length, 0) + (edit.documentChanges || []).reduce((a, d) => a + (d.edits || []).length, 0) : 0;
      if (!count) edit = textRenameEdit(model, position, newName);
      if (!edit) return { edits: [], rejectReason: 'Nothing to rename here' };
      const edits = [];
      const perFile = new Map(Object.entries(edit.changes || {}));
      for (const dc of edit.documentChanges || []) if (dc.textDocument) perFile.set(dc.textDocument.uri, dc.edits);
      for (const [uri, list] of perFile) {
        const file = uriToPath(uri);
        const doc = file && await ensureDoc(file);
        if (!doc) continue;
        for (const e of list) edits.push({ resource: doc.model.uri, textEdit: { range: fromLspRange(e.range), text: e.newText }, versionId: undefined });
      }
      return { edits };
    },
    async resolveRenameLocation(model, position) {
      const w = model.getWordAtPosition(position);
      if (!w) return { rejectReason: 'Select a symbol to rename', range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: '' };
      return { range: new monaco.Range(position.lineNumber, w.startColumn, position.lineNumber, w.endColumn), text: w.word };
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider(SWIFT_LANG, {
    async provideDocumentFormattingEdits(model, options) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/formatting', { textDocument: { uri: t.uri }, options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } });
      if (!res) toast('swift-format could not format this file');
      return lspTextEditsToMonaco(res || []);
    },
  });

  monaco.languages.registerDocumentRangeFormattingEditProvider(SWIFT_LANG, {
    async provideDocumentRangeFormattingEdits(model, range, options) {
      const t = lspReady(model);
      if (!t) return null;
      const res = await lspCall('textDocument/rangeFormatting', { textDocument: { uri: t.uri }, range: { start: toLspPos({ lineNumber: range.startLineNumber, column: range.startColumn }), end: toLspPos({ lineNumber: range.endLineNumber, column: range.endColumn }) }, options: { tabSize: options.tabSize, insertSpaces: options.insertSpaces } });
      return lspTextEditsToMonaco(res || []);
    },
  });

  // Fix-its and refactorings (Xcode's "Fix" buttons and Editor ▸ Refactor)
  monaco.languages.registerCodeActionProvider(SWIFT_LANG, {
    async provideCodeActions(model, range, context) {
      const t = lspReady(model);
      if (!t) return { actions: [], dispose() {} };
      const raw = (LSP.raw.get(norm(t.doc.path)) || []).filter(d => {
        const r = fromLspRange(d.range);
        return r.startLineNumber <= range.endLineNumber && r.endLineNumber >= range.startLineNumber;
      });
      const res = await lspCall('textDocument/codeAction', {
        textDocument: { uri: t.uri },
        range: { start: toLspPos({ lineNumber: range.startLineNumber, column: range.startColumn }), end: toLspPos({ lineNumber: range.endLineNumber, column: range.endColumn }) },
        context: { diagnostics: raw },
      });
      const actions = [];
      for (const a of res || []) {
        if (a.edit) {
          const edits = [];
          const perFile = new Map(Object.entries(a.edit.changes || {}));
          for (const dc of a.edit.documentChanges || []) if (dc.textDocument) perFile.set(dc.textDocument.uri, dc.edits);
          for (const [uri, list] of perFile) {
            const file = uriToPath(uri);
            const doc = file && (S.docs.get(docKey(file)) || await ensureDoc(file));
            if (!doc) continue;
            for (const e of list) edits.push({ resource: doc.model.uri, textEdit: { range: fromLspRange(e.range), text: e.newText }, versionId: undefined });
          }
          actions.push({ title: a.title, kind: a.kind || 'quickfix', isPreferred: a.isPreferred || (a.kind === 'quickfix'), edit: { edits }, diagnostics: context.markers });
        } else if (a.command || (a.title && a.arguments)) {
          const cmd = a.command && typeof a.command === 'object' ? a.command : a;
          actions.push({ title: a.title, kind: a.kind || 'refactor', command: { id: 'swiftcode.lspCommand', title: a.title, arguments: [cmd] } });
        }
      }
      return { actions, dispose() {} };
    },
  });
  monaco.editor.registerCommand('swiftcode.lspCommand', async (_acc, cmd) => {
    await lspCall('workspace/executeCommand', { command: cmd.command, arguments: cmd.arguments });
  });
}

// ------------------------------------------------------------------ fallbacks (no index yet)

function identifierAt(model, position) {
  const w = model.getWordAtPosition(position);
  return w && /^[A-Za-z_]\w*$/.test(w.word) ? w : null;
}

function textReferences(model, position) {
  const w = identifierAt(model, position);
  if (!w) return null;
  const re = new RegExp(`\\b${w.word}\\b`, 'g');
  const out = [];
  for (const d of S.docs.values()) {
    if (d.kind !== 'file' || d.model.getLanguageId() !== SWIFT_LANG) continue;
    d.model.getLinesContent().forEach((line, i) => {
      // skip comments and string contents roughly: only code before a // comment
      const code = line.replace(/\/\/.*$/, '');
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(code))) out.push({ uri: d.model.uri, range: new monaco.Range(i + 1, m.index + 1, i + 1, m.index + 1 + w.word.length) });
    });
  }
  return out;
}

function textRenameEdit(model, position, newName) {
  const refs = textReferences(model, position);
  if (!refs || !refs.length) return null;
  const changes = {};
  for (const r of refs) {
    const uri = fileUri(r.uri.fsPath);
    (changes[uri] = changes[uri] || []).push({ range: { start: { line: r.range.startLineNumber - 1, character: r.range.startColumn - 1 }, end: { line: r.range.endLineNumber - 1, character: r.range.endColumn - 1 } }, newText: newName });
  }
  return { changes };
}

// ------------------------------------------------------------------ Quick Help from SourceKit

async function lspQuickHelp(doc, position) {
  if (!lspWants(doc)) return null;
  const t = lspReady(doc.model);
  if (!t) return null;
  const res = await lspCall('textDocument/hover', { textDocument: { uri: t.uri }, position: toLspPos(position) });
  if (!res || !res.contents) return null;
  const c = res.contents;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (typeof x === 'string' ? x : '```swift\n' + x.value + '\n```')).join('\n\n') : c.value;
}

/** SwiftCode's runtime plumbing (_PrimitiveView, _DynamicProperty…) isn't part of the API Xcode would show. */
const cleanSignature = s => String(s).replace(/,\s*_[A-Z]\w*(?=[\s,{<]|$)/g, '').replace(/:\s*_[A-Z]\w*\s*,\s*/g, ': ');

/** Minimal Markdown → HTML for Quick Help (code blocks, headings, paragraphs, inline code, emphasis, lists). */
function markdownToHtml(md) {
  const out = [];
  const blocks = cleanSignature(String(md).replace(/^## Multiple results\n+/, '')).split(/(```[\s\S]*?```)/);
  for (const b of blocks) {
    if (!b.trim()) continue;
    const fence = b.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (fence) { out.push(`<pre class="qh-code">${esc(fence[2].trim())}</pre>`); continue; }
    for (const para of b.split(/\n{2,}/)) {
      const p = para.trim();
      if (!p || p === '---') { if (p === '---') out.push('<hr class="qh-hr">'); continue; }
      const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1<i>$2</i>');
      const h = p.match(/^(#{1,4})\s+(.*)$/);
      if (h) { out.push(`<div class="qh-h">${inline(h[2])}</div>`); continue; }
      if (/^[-*] /m.test(p)) { out.push('<ul class="qh-list">' + p.split(/\n/).map(l => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + '</ul>'); continue; }
      out.push(`<p class="qh-body">${inline(p).replace(/\n/g, ' ')}</p>`);
    }
  }
  return out.join('');
}
