'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sourceControl } = require('../source-control');

test('status and staged/unstaged diff preserve paths with Polish characters and spaces', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'SwiftCode Git '));
  execFileSync('git', ['init', '-q', root], { stdio: 'ignore' });
  const file = 'Zażółć [1].swift';
  const nested = path.join(root, 'Źródła');
  fs.mkdirSync(nested);
  const name = path.join(nested, file);
  fs.writeFileSync(name, 'let value = 1\n');
  assert.deepEqual(await sourceControl(nested, 'status'), [{ status: '??', file }]);
  await sourceControl(nested, 'stage', file);
  fs.writeFileSync(name, 'let value = 2\n');
  assert.deepEqual(await sourceControl(nested, 'status'), [{ status: 'AM', file }]);
  const diff = await sourceControl(nested, 'diff', file);
  assert.match(diff, /\+let value = 1/);
  assert.match(diff, /\+let value = 2/);
});
