// Draws the installer artwork (24-bit BMP, what NSIS needs) with sponsor logos:
//   build/installerSidebar.bmp  164×314  welcome + finish pages
//   build/installerHeader.bmp   150×57   header of the other pages
//   build/sponsor-prozlecenie.bmp, build/sponsor-cyberscope.bmp  440×80  clickable cards on the "Sponsorzy" page
// Run with: npm run installer-art
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read64 = (rel, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, rel)).toString('base64')}`;

function bmp24(w, h, rgba) {
  const row = Math.ceil(w * 3 / 4) * 4;
  const b = Buffer.alloc(54 + row * h);
  b.write('BM', 0); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34); b.writeInt32LE(2835, 38); b.writeInt32LE(2835, 42);
  for (let y = 0; y < h; y++) {
    let o = 54 + y * row;
    const s = (h - 1 - y) * w * 4;                 // BMP rows go bottom-up
    for (let x = 0; x < w; x++) { const i = s + x * 4; b[o++] = rgba[i + 2]; b[o++] = rgba[i + 1]; b[o++] = rgba[i]; }
  }
  return b;
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const js = code => win.webContents.executeJavaScript(code);
  const fdir = 'node_modules/@fontsource/inter/files';
  const fonts = [400, 600, 800].flatMap(w => [[w, read64(`${fdir}/inter-latin-${w}-normal.woff2`, 'font/woff2'), 'U+0000-00FF'], [w, read64(`${fdir}/inter-latin-ext-${w}-normal.woff2`, 'font/woff2'), 'U+0100-02FF']]);
  await js(`(async () => {
    for (const [w, src, range] of ${JSON.stringify(fonts)}) document.fonts.add(await new FontFace('ArtInter', 'url(' + src + ')', { weight: String(w), unicodeRange: range }).load());
    window.load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    window.ICON = await load(${JSON.stringify(read64('build/web/icon-192.png', 'image/png'))});
    window.PZ = await load(${JSON.stringify(read64('build/sponsors/prozlecenie.png', 'image/png'))});
    window.CS = await load(${JSON.stringify(read64('build/sponsors/cyberscope.svg', 'image/svg+xml'))});
    window.rgba = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = ''; for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768)); return btoa(s); };
    window.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    window.csTile = (g, x, y, s) => { g.save(); g.beginPath(); g.roundRect(x, y, s, s, s * .22); g.fillStyle = '#0b1220'; g.fill(); g.drawImage(CS, x + s * .12, y + s * .12, s * .76, s * .76); g.restore(); };
    window.pzTile = (g, x, y, s) => { g.save(); g.beginPath(); g.roundRect(x, y, s, s, s * .22); g.clip(); g.drawImage(PZ, x, y, s, s); g.restore(); };
    return true; })()`);
  const save = async (file, w, h, draw) => {
    const data = await js(`(() => { const c = canvas(${w}, ${h}); const g = c.getContext('2d'); (${draw})(g, ${w}, ${h}); return rgba(c); })()`);
    fs.writeFileSync(path.join(ROOT, 'build', file), bmp24(w, h, Buffer.from(data, 'base64')));
    console.log('written build/' + file);
  };

  // welcome / finish page sidebar
  await save('installerSidebar.bmp', 164, 314, `(g, W, H) => {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#22156a'); bg.addColorStop(.55, '#2a1470'); bg.addColorStop(1, '#120c34');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, r, c) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
    glow(150, 120, 140, 'rgba(255,61,139,.35)'); glow(0, 0, 120, 'rgba(79,209,255,.25)');
    g.shadowColor = 'rgba(139,92,246,.7)'; g.shadowBlur = 16; g.drawImage(ICON, 46, 22, 72, 72); g.shadowColor = 'transparent';
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 19px ArtInter'; g.fillText('WinSwift', W / 2, 118); g.fillText('Studio', W / 2, 140);
    g.fillStyle = 'rgba(238,235,255,.75)'; g.font = '600 10.5px ArtInter'; g.fillText("Aplikacje na iPhone'a", W / 2, 162); g.fillText('na Windows 10 i 11', W / 2, 176);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(16, 192, W - 32, 1);
    g.fillStyle = '#7fe0a8'; g.font = '800 9px ArtInter'; g.fillText('S P O N S O R Z Y', W / 2, 210);
    g.textAlign = 'left';
    pzTile(g, 16, 220, 28); g.fillStyle = '#fff'; g.font = '800 11.5px ArtInter'; g.fillText('ProZlecenie.pl', 52, 233);
    g.fillStyle = 'rgba(238,235,255,.65)'; g.font = '400 9px ArtInter'; g.fillText('fachowcy z okolicy', 52, 245);
    csTile(g, 16, 256, 28); g.fillStyle = '#fff'; g.font = '800 11.5px ArtInter'; g.fillText('CyberScope.pl', 52, 269);
    g.fillStyle = 'rgba(238,235,255,.65)'; g.font = '400 9px ArtInter'; g.fillText('cyberbezpieczeństwo', 52, 281);
    g.textAlign = 'center'; g.fillStyle = 'rgba(238,235,255,.5)'; g.font = '600 8.5px ArtInter'; g.fillText('winswift.tacticalops.fun', W / 2, 304);
  }`);

  // header of the inner pages (MUI draws it on the right of a white strip)
  await save('installerHeader.bmp', 150, 57, `(g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.drawImage(ICON, W - 50, 8, 40, 40);
    g.textAlign = 'right'; g.fillStyle = '#1d1640'; g.font = '800 14px ArtInter'; g.fillText('WinSwift', W - 58, 26); g.fillText('Studio', W - 58, 43);
  }`);

  // sponsor cards for the custom page (page background is the dialog colour #F0F0F0)
  const card = (file, tile, colors, name, nameColor, lines, cta, ctaColors) => save(file, 440, 80, `(g, W, H) => {
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, W, H);
    g.beginPath(); g.roundRect(1, 1, W - 2, H - 2, 12);
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '${colors[0]}'); bg.addColorStop(1, '${colors[1]}'); g.fillStyle = bg; g.fill();
    g.strokeStyle = '${colors[2]}'; g.lineWidth = 1; g.stroke();
    ${tile}(g, 14, 12, 56);
    g.fillStyle = '${nameColor}'; g.font = '800 17px ArtInter'; g.fillText(${JSON.stringify(name)}, 84, 32);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '400 11px ArtInter';
    ${JSON.stringify(lines)}.forEach((t, i) => g.fillText(t, 84, 50 + i * 14));
    g.font = '700 11px ArtInter'; const tw = g.measureText(${JSON.stringify(cta)}).width;
    g.beginPath(); g.roundRect(W - tw - 34, 14, tw + 22, 24, 12);
    const b2 = g.createLinearGradient(W - tw - 34, 0, W - 12, 0); b2.addColorStop(0, '${ctaColors[0]}'); b2.addColorStop(1, '${ctaColors[1]}'); g.fillStyle = b2; g.fill();
    g.fillStyle = '${ctaColors[2]}'; g.fillText(${JSON.stringify(cta)}, W - tw - 23, 30);
  }`);
  await card('sponsor-prozlecenie.bmp', 'pzTile', ['#152c4f', '#17505e', '#2f7a72'], 'ProZlecenie.pl', '#ffffff',
    ['Opisz robotę budowlaną lub remontową — fachowcy z Twojej', 'okolicy sami zgłoszą się z ceną. Za darmo.'], 'Odwiedź →', ['#3ee08f', '#1fb6a6', '#062a22']);
  await card('sponsor-cyberscope.bmp', 'csTile', ['#0b1220', '#0f2a22', '#1c6b4f'], 'CyberScope.pl', '#ffffff',
    ['Portal o cyberbezpieczeństwie: aktualności, analizy i poradniki', '— jak rozpoznać oszustwo i chronić swoje dane.'], 'Odwiedź →', ['#34d399', '#10b981', '#04261b']);
  app.quit();
});
