// Builds the app icon from build/app-logo.png (the ProZlecenie logo): build/icon.png, build/icon.ico and src/img/app-icon.png
// Run with: npm run icon
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map(p => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const root = path.join(__dirname, '..');
  const src = nativeImage.createFromPath(path.join(root, 'build', 'app-logo.png'));
  if (src.isEmpty()) { console.error('build/app-logo.png not found'); app.exit(1); return; }
  const base = src.resize({ width: 256, height: 256, quality: 'best' });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), base.toPNG());
  fs.mkdirSync(path.join(root, 'src', 'img'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'img', 'app-icon.png'), base.toPNG());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map(size => ({ size, data: (size === 256 ? base : src.resize({ width: size, height: size, quality: 'best' })).toPNG() }));
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(pngs));
  console.log('icon written');
  app.quit();
});
