'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const notices = [];
  const ctx = vm.createContext({
    window: {}, setTimeout, clearTimeout, norm: p => p.toLowerCase(), docKey: p => p,
    S: { docs: new Map(), tabs: [] }, $: () => null, applyDiagsToDoc() {}, refreshIssueViews() {},
    api: { on() {}, lspNotify: (method, params) => notices.push({ method, params }) }
  });
  const run = s => vm.runInContext(s, ctx);
  run(fs.readFileSync(path.join(__dirname, '../src/lsp.js'), 'utf8'));
  const root = 'C:\\Projekt';
  const doc = { kind: 'file', path: root + '\\Żółć.swift', text: 'bad', model: { getValue: () => doc.text, isDisposed: () => false } };
  ctx.S.docs.set(doc.path, doc);
  Object.assign(ctx, { doc, root });
  run('LSP.active = true; LSP.root = root; lspOpen(doc)');
  const uri = run('fileUri(doc.path)');
  const report = version => ctx.onLspDiagnostics({ uri, version, diagnostics: [{ severity: 1, message: 'unknown identifier', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } } }] });
  return { ctx, doc, run, report, notices, count: () => run('LSP.diags.get(norm(doc.path))?.length || 0') };
}

test('late diagnostics during typing, after didChange, and after close/reopen', () => {
  const { ctx, doc, report, notices, count } = fixture();
  const first = notices[0].params.textDocument.version;
  report(first);
  assert.equal(count(), 1);
  doc.text = 'print("ż")';
  ctx.lspChanged(doc);
  report(first);
  assert.equal(count(), 0);
  ctx.lspFlush(doc);
  assert.equal(notices.at(-1).params.contentChanges[0].text, doc.text);
  report(first);
  assert.equal(count(), 0);
  const next = notices.at(-1).params.textDocument.version;
  report(next);
  assert.equal(count(), 1);
  ctx.lspClose(doc);
  report(next);
  assert.equal(count(), 0);
  ctx.lspOpen(doc);
  report(next);
  assert.equal(count(), 0);
});

test('sibling folders sharing a prefix are outside the workspace', () => {
  const { ctx, doc } = fixture();
  assert.equal(ctx.lspWants({ ...doc, path: 'C:\\Projekt2\\Other.swift' }), false);
});
