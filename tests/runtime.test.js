'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { base, context, prepare, build, frames } = require('./build-harness');

function nodes(tree) {
  return tree.flatMap(n => [n, ...nodes(n.c || [])]);
}
function textOf(n) { return (n.p?.segs || []).map(s => s.s).join('') + (n.c || []).map(textOf).join(''); }

async function run() {
  const { version, env } = await prepare();
  const directory = fs.mkdtempSync(path.join(base, 'Próby '));
  const apps = {};
  for (const [name, template] of Object.entries({ Gallery: null, Filtered: null, Identity: null, Notes: 'ios-data', Posts: 'ios-api', Document: 'ios-document', Tabs: 'ios-sample', Network: null, NavBack: null })) {
    const root = path.join(directory, name);
    fs.mkdirSync(root);
    if (template) await context.createIOSProject(root, name, 'test', template);
    else fs.copyFileSync(path.join(__dirname, name + '.swift'), path.join(root, name + '.swift'));
    const exe = await build(root, version);
    apps[name] = { root, exe, env: { ...env, SWIFTCODE_PROJECT: root, SWIFTCODE_APPDATA: path.join(root, 'appdata'), SWIFTCODE_LANG: 'pl', SWIFTCODE_SCREEN: '402x874' } };
    console.log('Built', name);
  }
  const render = (name, cb) => { const a = apps[name]; return frames(a.exe, a.env, (tree, send) => cb(nodes(tree), send)); };
  await render('Posts', list => list.some(n => n.t === 'progress' || n.t === 'list'));
  await render('Document', list => list.some(n => n.t === 'textfield' && n.p.editor));
  await render('Tabs', list => list.some(n => n.t === 'tabview'));
  let step = 0;
  await render('Gallery', (list, send) => {
    for (const kind of ['map', 'canvas', 'chart', 'progress']) assert.ok(list.some(n => n.t === kind), kind);
    assert.ok(list.some(n => n.t === 'text' && textOf(n) === 'Placeholder'));
    const tap = name => send({ k: 'tap', id: list.find(n => n.t === 'button' && textOf(n) === name).id });
    const mods = list.flatMap(n => n.m || []);
    if (step === 0) { step++; send({ k: 'text', id: list.find(n => n.t === 'textfield').id, v: 'Łódź' }); }
    else if (step === 1 && list.some(n => n.t === 'text' && textOf(n) === 'Łódź')) { step++; tap('Inspect'); }
    else if (step === 2 && mods.some(m => m.k === 'sheet' && m.dismiss)) {
      step++; const sheet = mods.find(m => m.k === 'sheet' && m.dismiss);
      assert.ok(nodes(sheet.v).some(n => textOf(n) === 'Inspector content'));
      send({ k: 'tap', id: sheet.dismiss });
    } else if (step === 3 && !mods.some(m => m.k === 'sheet' && m.dismiss)) { step++; tap('Alert'); }
    else if (step === 4 && mods.some(m => m.k === 'alert')) { step++; tap('Animate'); }
    else if (step === 5) return list.some(n => n.t === 'text' && textOf(n) === 'Selected');
  });
  let stage = 0;
  await render('Notes', (list, send) => {
    if (stage === 0) { stage++; send({ k: 'text', id: list.find(n => n.t === 'textfield').id, v: 'Zażółć' }); }
    else if (stage === 1) { stage++; send({ k: 'tap', id: list.find(n => n.t === 'button' && textOf(n) === 'Add note').id }); }
    else return list.some(n => n.t === 'text' && textOf(n) === 'Zażółć');
  });
  await render('Notes', list => list.some(n => n.t === 'text' && textOf(n) === 'Zażółć'));
  let seeded = false, deleted = false;
  await render('Filtered', (list, send) => {
    if (!seeded) { seeded = true; send({ k: 'tap', id: list.find(n => n.t === 'button' && textOf(n) === 'Seed').id }); }
    else if (!deleted && list.some(n => n.t === 'text' && textOf(n) === 'Zeta,Alfa')) {
      deleted = true; send({ k: 'tap', id: list.find(n => n.t === 'button' && textOf(n) === 'Delete first').id });
    } else if (deleted) return list.some(n => n.t === 'text' && textOf(n) === 'Alfa');
  });
  await render('Filtered', list => list.some(n => n.t === 'text' && textOf(n) === 'Alfa'));
  let identityStep = 0;
  await render('Identity', (list, send) => {
    const buttons = list.filter(n => n.t === 'button');
    const tap = label => send({ k: 'tap', id: buttons.find(n => textOf(n) === label).id });
    const rows = buttons.map(textOf).filter(s => s.startsWith('Row '));
    if (identityStep === 0) { identityStep++; tap('Row 1 = 0'); }
    else if (identityStep === 1) { assert.deepEqual(rows, ['Row 1 = 1', 'Row 2 = 0']); identityStep++; tap('Reverse'); }
    else if (identityStep === 2) { assert.deepEqual(rows, ['Row 2 = 0', 'Row 1 = 1']); identityStep++; tap('Reset'); }
    else { assert.deepEqual(rows, ['Row 2 = 0', 'Row 1 = 0']); return true; }
  });
  // Draw → Back → Draw must open the screen again (Back turns the binding false), and so must Draw after Close
  let navStep = 0;
  await render('NavBack', (list, send) => {
    const nav = list.find(n => n.t === 'nav');
    const screens = nav.c.length;
    const has = s => list.some(n => n.t === 'text' && textOf(n) === s);
    const tap = label => send({ k: 'tap', id: list.find(n => n.t === 'button' && textOf(n) === label).id });
    if (navStep === 0) { navStep++; tap('Draw'); }
    else if (navStep === 1 && screens === 2 && has('Meal 1')) { navStep++; send({ k: 'tap', id: nav.id + '~back' }); }
    else if (navStep === 2 && screens === 1 && has('shown=false')) { navStep++; tap('Draw'); }
    else if (navStep === 3 && screens === 2 && has('Meal 2')) { navStep++; tap('Close'); }
    else if (navStep === 4 && screens === 1 && has('shown=false')) { navStep++; tap('Draw'); }
    else if (navStep === 5) return screens === 2 && has('Meal 3');
  });
  const record = { title: 'Łódź', date: '2026-01-01T12:00:00Z' };
  let gets = 0, posts = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith('/icon.png')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xv2QAAAAASUVORK5CYII=', 'base64'));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      posts++;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      assert.deepEqual(JSON.parse(Buffer.concat(chunks)), record);
      assert.equal(req.headers['content-type'], 'application/json');
    } else gets++;
    res.end(JSON.stringify(record));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    apps.Network.env.TEST_ENDPOINT = 'http://127.0.0.1:' + server.address().port + '/record';
    await render('Network', list => list.some(n => textOf(n) === 'Łódź/Łódź') && list.some(n => n.t === 'image' && fs.existsSync(n.p.src)));
    assert.equal(gets, 2); assert.equal(posts, 1);
  } finally { server.close(); }
  console.log('Runtime round trips passed', directory);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
