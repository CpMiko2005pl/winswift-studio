// Serves website/dist locally and saves full-page screenshots (desktop + phone) for a visual check.
// Run with:  node_modules\electron\dist\electron.exe website\preview.js <outDir> [path]
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const outDir = process.argv[2] || path.join(__dirname, 'preview');
const pagePath = process.argv[3] || '/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end(fs.readFileSync(path.join(DIST, '404.html'))); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});   // keep running between the desktop and phone windows
app.whenReady().then(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, w, h, mobile] of [['desktop', 1440, 900, false], ['phone', 390, 844, true]]) {
    const win = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, webPreferences: { offscreen: true } });
    if (mobile) win.webContents.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await win.loadURL(`http://127.0.0.1:${port}${pagePath}?nie-licz`); break; }
      catch (e) { if (attempt === 2) throw e; await new Promise(r => setTimeout(r, 800)); }
    }
    // reveal everything that animates in on scroll, load lazy images, then grow the window to the full page height
    await win.webContents.executeJavaScript(`document.querySelectorAll('.rv').forEach(e => e.classList.add('in'));
      document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; }); true`);
    await new Promise(r => setTimeout(r, 1500));
    const fullH = await win.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
    win.setContentSize(w, Math.min(fullH, 16000));
    await new Promise(r => setTimeout(r, 2000));
    const errors = await win.webContents.executeJavaScript(`[...document.images].filter(i => i.offsetParent && (!i.complete || !i.naturalWidth)).map(i => i.src)`);
    const img = await win.webContents.capturePage();
    const scaled = img.resize({ width: w });
    fs.writeFileSync(path.join(outDir, `${name}.png`), scaled.toPNG());
    // slices at real size for close inspection
    const sliceH = mobile ? 1400 : 1000;
    const size = scaled.getSize();
    for (let y = 0, n = 1; y < size.height; y += sliceH, n++) {
      fs.writeFileSync(path.join(outDir, `${name}-${String(n).padStart(2, '0')}.png`), scaled.crop({ x: 0, y, width: size.width, height: Math.min(sliceH, size.height - y) }).toPNG());
    }
    console.log(`${name}: ${w}x${fullH}${errors.length ? ' BROKEN IMAGES: ' + errors.join(', ') : ''}`);
    win.destroy();
  }
  server.close();
  app.quit();
});
