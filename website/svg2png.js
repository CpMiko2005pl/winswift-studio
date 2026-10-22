// electron website/svg2png.js <in.svg> <out.png> <size> — renders an SVG on a canvas (independent of display scaling)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const [input, output, size = '256'] = process.argv.slice(2);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const svg = fs.readFileSync(input, 'utf8');
  const url = await win.webContents.executeJavaScript(`new Promise((ok, no) => { const i = new Image();
    i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${+size}; c.getContext('2d').drawImage(i, 0, 0, ${+size}, ${+size}); ok(c.toDataURL('image/png')); };
    i.onerror = no; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)}); })`);
  fs.writeFileSync(output, nativeImage.createFromDataURL(url).toPNG());
  console.log('written', output);
  app.quit();
});
