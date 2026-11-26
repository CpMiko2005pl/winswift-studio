'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { base, prepare, context } = require('./build-harness');

async function run() {
  await prepare();
  const root = fs.mkdtempSync(path.join(base, 'SourceKit test '));
  const file = path.join(root, 'Żółć.swift');
  const uri = pathToFileURL(file).href;
  const model = path.join(root, 'Note.swift');
  fs.writeFileSync(model, 'import SwiftData\n@Model final class Note { var title = "Łódź" }\n');
  const valid = 'import SwiftUI\nstruct Notes: View { @Query var notes: [Note]; var body: some View { Text(notes.first?.title ?? "Empty") } }\n@main struct Demo: App { var body: some Scene { WindowGroup { Text("Łódź") } } }\n';
  fs.writeFileSync(file, valid);
  const result = await context.lspStart(root);
  try {
    assert.ok(result.ok, result.reason);
    const state = vm.runInContext('lsp', context);
    const notify = (method, params) => context.lspWrite(state, { jsonrpc: '2.0', method, params });
    const check = async () => {
      const result = await context.lspRequest(state, 'textDocument/diagnostic', { textDocument: { uri } }, 30000);
      assert.ok(result?.result?.items, JSON.stringify(result)); return result.result.items;
    };
    notify('textDocument/didOpen', { textDocument: { uri, languageId: 'swift', version: 1, text: valid + 'let invalidValue: Int = "bad"\n' } });
    const broken = await check();
    assert.ok(broken.some(d => d.severity === 1 && /convert|cannot assign/i.test(d.message)), JSON.stringify(broken));
    notify('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: valid }] });
    const errors = (await check()).filter(d => d.severity === 1);
    assert.equal(errors.length, 0, errors.map(d => d.message).join('\n'));
    console.log('SourceKit reports a real error and clears it after didChange');
  } finally { await context.lspStop(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
