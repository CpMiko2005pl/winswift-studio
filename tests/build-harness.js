'use strict';
// Exercise the same toolchain discovery, source rewrite and link steps as Electron.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const base = process.env.WINSWIFT_TEST_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'WinSwift test '));
fs.mkdirSync(base, { recursive: true });
const main = path.resolve(__dirname, '../main.js');
const fromMain = createRequire(main);
const app = { setName() {}, setPath() {}, getPath: () => base, requestSingleInstanceLock: () => true,
  on() {}, setAppUserModelId() {}, commandLine: { appendSwitch() {} }, whenReady: () => ({ then() {} }) };
const context = vm.createContext({ process, console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
  __dirname: path.dirname(main), require: name => {
    if (name === 'electron') return { app, Menu: { setApplicationMenu() {} } };
    if (name === './activation.js' || name === './updater') return {};
    return fromMain(name);
  } });
vm.runInContext(fs.readFileSync(main, 'utf8'), context, { filename: main });

async function prepare() {
  await context.refreshEnv();
  const tc = await context.toolchainInfo();
  if (!tc.found) throw Error('Swift toolchain unavailable');
  const env = vm.runInContext('toolEnv', context);
  // Use a writable module cache even when the profile is read-only.
  env.CLANG_MODULE_CACHE_PATH = path.join(base, 'clang-cache');
  const dir = await context.ensureSwiftUIRuntime(tc.version);
  if (!dir) throw Error('Runtime compilation failed');
  return { env, version: tc.version, dir };
}

async function build(root, version) {
  const result = await context.buildFolderProject(root, version);
  if (!result.ok) throw Error('Build failed: ' + root);
  return result.exe;
}

function frames(exe, env, callback) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, [], { env, windowsHide: true });
    let settled = false;
    const timer = setTimeout(() => finish(Error('Timed out waiting for simulator frame')), 30000);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      p.stdin.end();
      if (error) p.kill();
      if (error) reject(error); else resolve();
    };
    p.on('error', finish);
    p.stderr.on('data', s => process.stderr.write(s));
    p.stdin.on('error', e => { if (!settled) finish(e); });
    p.on('close', code => { if (!settled) finish(Error('App exited before expected frame: ' + code)); });
    const send = ev => p.stdin.write('\x1eEV ' + JSON.stringify(ev) + '\n');
    createInterface({ input: p.stdout }).on('line', line => {
      if (settled || !line.startsWith('\x1eUI ')) return;
      try { if (callback(JSON.parse(line.slice(4)), send)) finish(); } catch (e) { finish(e); }
    });
  });
}
module.exports = { base, context, prepare, build, frames };
if (require.main === module) prepare().then(x => console.log('Runtime ready', x.dir)).catch(e => { console.error(e); process.exitCode = 1; });
