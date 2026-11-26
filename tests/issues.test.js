'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function renderer() {
  const events = new Map();
  const el = { append() {}, value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {} };
  const ctx = vm.createContext({
    window: { addEventListener() {}, swiftSource: require('../buildtools') },
    navigator: { language: 'pl' },
    document: { createElement: () => el, querySelector: () => el, querySelectorAll: () => [], addEventListener() {} },
    require: Object.assign(() => {}, { config() {} }), applyIcons() {}, setTimeout() {}, clearTimeout() {},
    api: { on: (name, fn) => events.set(name, fn), lspNotify() {} }
  });
  const run = source => vm.runInContext(source, ctx);
  for (const name of ['sf-symbols', 'swift-lang', 'app', 'lsp']) run(fs.readFileSync(path.join(__dirname, '../src/' + name + '.js'), 'utf8'));
  run('renderIssues = renderReports = renderTree = updateActivityIssues = setStatus = updateRunButtons = finishBuildLog = () => {}');
  const root = 'C:\\Projekt', file = root + '\\View.swift';
  const model = { revision: 1, getValue: () => 'import SwiftUI', isDisposed: () => false,
    getVersionId() { return this.revision; }, getAlternativeVersionId() { return this.revision; },
    getLineCount: () => 2, getWordAtPosition: () => null, getLineMaxColumn: () => 12,
    deltaDecorations(_old, decorations) { model.decorations = decorations; return decorations.map((_, i) => String(i)); } };
  const doc = { kind: 'file', path: file, key: file, saved: 1, model };
  Object.assign(ctx, { doc, root, file });
  ctx.fakeMonaco = { Uri: { file: path => ({ toString: () => path }) }, Range: class Range {},
    MarkerSeverity: { Error: 8, Warning: 4 }, editor: { OverviewRulerLane: {}, TrackedRangeStickiness: {},
      setModelMarkers(_model, _owner, markers) { model.markers = markers; } } };
  run("monaco = fakeMonaco; S.root = LSP.root = root; LSP.active = true; S.docs.set(file, doc); S.tabs = [file]; lspOpen(doc); S.currentReport = { id: 1, log: [], versions: new Map([[norm(file), 1]]), sourceRevision: S.sourceRevision }");
  return { run, doc, file, model, build: e => events.get('build:event')({ reportId: 1, ...e }), ctx };
}

test('edit clears build markers, inline banners and issues; a late compiler event cannot restore them', () => {
  const { run, model, build, file } = renderer();
  const diag = { type: 'diag', file, severity: 'error', line: 1, col: 2, message: 'invalid name' };
  build(diag);
  run('applyDiagsToDoc(doc)');
  assert.equal(model.markers.length, 1); assert.equal(model.decorations.length, 1);
  run('onLspDiagnostics({uri: fileUri(file), version: 1, diagnostics: []})');
  assert.equal(run('allIssues().length'), 1);
  model.revision++;
  run('noteIssueEdit(doc, {changes:[{range:{startLineNumber:1}, text:"fix"}]})');
  build(diag);
  assert.equal(run('allIssues().length'), 0);
  assert.equal(model.markers.length, 0); assert.equal(model.decorations.length, 0);
});

test('successful build clears stale live errors for the compiled revision and accepts new errors after editing', () => {
  const { ctx, run, file, model, build } = renderer();
  const report = version => ctx.onLspDiagnostics({ uri: ctx.fileUri(file), version, diagnostics: [
    { message: 'stale', severity: 1, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }
  ] });
  report(1); assert.equal(model.markers.length, 1);
  build({ type: 'build-end', ok: true, ms: 1 });
  report(1); assert.equal(model.markers.length, 0);
  model.revision++;
  run('noteIssueEdit(doc,{changes:[{range:{startLineNumber:1},text:"?"}]}); lspChanged(doc); lspFlush(doc)');
  report(2); assert.equal(model.markers.length, 1);
});
