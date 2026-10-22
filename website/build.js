// Builds the WinSwift Studio website into website/dist.
// Run with:  node_modules\electron\dist\electron.exe website\build.js
// (Electron is used for image work: PNG → WebP screenshots and the 1200×630 share images.)
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');
const BASE = 'https://winswift.tacticalops.fun/';
const REPO = 'https://github.com/CpMiko2005pl/winswift-studio';
const SETUP = `${REPO}/releases/latest/download/WinSwift-Studio-Setup.exe`;
const ZIP = `${REPO}/releases/latest/download/WinSwift-Studio-Windows-x64.zip`;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TODAY = new Date().toISOString().slice(0, 10);
const setupFile = path.join(ROOT, 'dist', `WinSwift-Studio-Setup-${VERSION}.exe`);
const SIZE = fs.existsSync(setupFile) && fs.statSync(setupFile).size > 1048576 ? `${Math.round(fs.statSync(setupFile).size / 1048576)} MB` : '80 MB';
// IndexNow key (Bing, Yandex, Seznam, Naver…): kept stable between builds
const keyFile = path.join(__dirname, 'indexnow-key.txt');
if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(16).toString('hex'));
const INDEXNOW = fs.readFileSync(keyFile, 'utf8').trim();

const SHOTS = ['canvas', 'debugger', 'library', 'canvas-light', 'welcome'];

const FAQ = {
  pl: [
    ['Czy naprawdę mogę pisać aplikacje na iPhone\'a na Windows?', 'Tak — w Swift i SwiftUI. Kod kompiluje oficjalny kompilator Swift dla Windows, a aplikacja uruchamia się we wbudowanym symulatorze iPhone\'a dzięki otwartej implementacji SwiftUI dla Windows. To świetne rozwiązanie do nauki, prototypów i zadań z programowania iOS na studiach.'],
    ['Czy potrzebuję Maca?', 'Do pisania i testowania aplikacji — nie. Mac z Xcode jest potrzebny dopiero wtedy, gdy chcesz zbudować plik .ipa, uruchomić aplikację na prawdziwym iPhonie albo wysłać ją do App Store. Ten sam kod SwiftUI otworzysz wtedy w Xcode.'],
    ['Czy WinSwift Studio jest darmowe?', 'Tak, całkowicie darmowe i open source na licencji MIT. Cały kod źródłowy jest publiczny na GitHubie.'],
    ['Jakie są wymagania?', 'Windows 10 lub 11 w wersji 64-bitowej, ok. 1 GB miejsca na program oraz kompilator Swift i Visual Studio Build Tools — oba zainstalujesz jednym kliknięciem z poziomu programu (przycisk <b>Install Swift…</b>).'],
    ['Czy działa na Windows 7 lub 8?', 'Nie. Kompilator Swift dla Windows i Electron, na którym działa program, wymagają Windows 10 lub nowszego.'],
    ['Czy to jest Xcode na Windows?', 'Nie — to niezależny projekt inspirowany Xcode: podobny interfejs, skróty klawiszowe (Cmd zamienione na Ctrl) i sposób pracy. Nie jest powiązany z Apple ani przez nią wspierany.'],
    ['Czy obsługuje UIKit i Storyboard?', 'Nie, obsługiwany jest SwiftUI — nowoczesny sposób tworzenia interfejsów na iOS, który Apple poleca dla nowych aplikacji.'],
    ['Windows pokazuje „System Windows ochronił ten komputer” — co zrobić?', 'Kliknij „Więcej informacji”, a potem „Uruchom mimo to”. Program nie ma płatnego certyfikatu podpisu cyfrowego; jego kod jest publiczny na GitHubie, więc każdy może sprawdzić, co robi.'],
    ['Jak zaktualizować lub odinstalować program?', 'Program sam informuje o nowych wersjach (Help → Check for Updates…), a nowy instalator instaluje się na starą wersję. Odinstalujesz go w Ustawienia → Aplikacje → Zainstalowane aplikacje → WinSwift Studio. Twoje projekty zostają na dysku.'],
    ['Jak zgłosić błąd albo pomóc w rozwoju?', 'Na GitHubie są zakładki Issues (zgłoszenia błędów) i Discussions (pytania i pomysły). Pull requesty są mile widziane.'],
  ],
  en: [
    ['Can I really build iPhone apps on Windows?', 'Yes — in Swift and SwiftUI. Your code is compiled by the official Swift compiler for Windows, and the app runs in the built-in iPhone simulator thanks to an open implementation of SwiftUI for Windows. It is great for learning, prototyping and iOS programming courses.'],
    ['Do I need a Mac?', 'Not for writing and testing apps. You only need a Mac with Xcode to build an .ipa file, run the app on a real iPhone or submit it to the App Store — then you open the same SwiftUI code in Xcode.'],
    ['Is WinSwift Studio free?', 'Yes, completely free and open source under the MIT License. All of the source code is public on GitHub.'],
    ['What are the requirements?', 'Windows 10 or 11 (64-bit), about 1 GB of disk space for the app, plus the Swift toolchain and Visual Studio Build Tools — both install with one click from inside the app (<b>Install Swift…</b>).'],
    ['Does it run on Windows 7 or 8?', 'No. The Swift compiler for Windows and Electron, which the app is built on, require Windows 10 or later.'],
    ['Is this Xcode for Windows?', 'No — it is an independent project inspired by Xcode: a similar interface, keyboard shortcuts (Cmd becomes Ctrl) and workflow. It is not affiliated with or endorsed by Apple.'],
    ['Does it support UIKit and Storyboards?', 'No, it supports SwiftUI — the modern way to build iOS interfaces that Apple recommends for new apps.'],
    ['Windows says “Windows protected your PC” — what should I do?', 'Click “More info”, then “Run anyway”. The app is not signed with a paid code-signing certificate; its source code is public on GitHub, so anyone can check what it does.'],
    ['How do I update or uninstall it?', 'The app tells you about new versions (Help → Check for Updates…), and a new installer simply installs over the old version. Uninstall it from Settings → Apps → Installed apps → WinSwift Studio. Your projects stay on disk.'],
    ['How can I report a bug or contribute?', 'The GitHub repository has Issues (bug reports) and Discussions (questions and ideas). Pull requests are welcome.'],
  ],
};

const strip = s => s.replace(/<[^>]+>/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function faqHtml(lang) {
  return FAQ[lang].map(([q, a], i) => `      <details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n');
}

function jsonLd(lang) {
  const pl = lang === 'pl';
  const url = pl ? BASE : `${BASE}en/`;
  const title = pl ? 'WinSwift Studio – Swift i SwiftUI na Windows: aplikacje na iPhone\'a bez Maca' : 'WinSwift Studio – Swift & SwiftUI on Windows: build iPhone apps without a Mac';
  const description = pl
    ? 'Darmowe IDE w stylu Xcode dla Windows 10 i 11. Twórz aplikacje na iPhone\'a w Swift i SwiftUI, testuj w symulatorze iPhone\'a, z podglądem na żywo i debuggerem LLDB.'
    : 'Free Xcode-style IDE for Windows 10 and 11. Build iPhone apps in Swift and SwiftUI, run them in an iPhone simulator, with live previews and an LLDB debugger.';
  const features = pl
    ? ['Symulator iPhone\'a (6 modeli)', 'Podgląd SwiftUI na żywo (#Preview)', 'Debugger LLDB', 'Podpowiedzi i błędy na żywo (SourceKit-LSP)', 'Implementacja SwiftUI dla Windows', 'Interfejs i skróty jak w Xcode', 'Instalacja kompilatora Swift jednym kliknięciem', 'Motyw jasny i ciemny']
    : ['iPhone simulator (6 models)', 'Live SwiftUI previews (#Preview)', 'LLDB debugger', 'Code completion and live issues (SourceKit-LSP)', 'SwiftUI implementation for Windows', 'Xcode-like interface and shortcuts', 'One-click Swift toolchain setup', 'Light and dark themes'];
  const steps = pl
    ? [['Pobierz i zainstaluj', 'Uruchom WinSwift-Studio-Setup.exe i kliknij Dalej → Zainstaluj.'], ['Zainstaluj Swift', 'Przy pierwszym uruchomieniu kliknij Install Swift…'], ['Uruchom aplikację', 'Create New Project → iOS → App i naciśnij Ctrl+R.']]
    : [['Download and install', 'Run WinSwift-Studio-Setup.exe and click Next → Install.'], ['Install Swift', 'On first launch click Install Swift…'], ['Run your app', 'Create New Project → iOS → App and press Ctrl+R.']];
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${BASE}#website`, url: BASE, name: 'WinSwift Studio', inLanguage: ['pl', 'en'], publisher: { '@id': `${BASE}#org` } },
      { '@type': 'Organization', '@id': `${BASE}#org`, name: 'WinSwift Studio', url: BASE, logo: `${BASE}img/icon-512.png`, sameAs: [REPO] },
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description, inLanguage: lang,
        isPartOf: { '@id': `${BASE}#website` }, about: { '@id': `${BASE}#app` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${BASE}img/${pl ? 'og-image.png' : 'og-image-en.png'}`, width: 1200, height: 630 },
        datePublished: '2026-10-21', dateModified: TODAY,
      },
      {
        '@type': 'SoftwareApplication', '@id': `${BASE}#app`, name: 'WinSwift Studio', alternateName: 'WinSwift',
        description, url, applicationCategory: 'DeveloperApplication', applicationSubCategory: pl ? 'Środowisko programistyczne (IDE)' : 'Integrated development environment (IDE)',
        operatingSystem: 'Windows 10, Windows 11', softwareVersion: VERSION, fileSize: SIZE, downloadUrl: SETUP, installUrl: SETUP,
        softwareRequirements: pl ? 'Windows 10 lub 11 (64-bit), Swift dla Windows, Visual Studio Build Tools' : 'Windows 10 or 11 (64-bit), Swift for Windows, Visual Studio Build Tools',
        image: `${BASE}img/icon-512.png`, screenshot: SHOTS.map(s => `${BASE}img/${s}-1366.webp`).concat(`${BASE}img/iphone-640.webp`),
        featureList: features, isAccessibleForFree: true, license: 'https://opensource.org/licenses/MIT', inLanguage: ['pl', 'en'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: pl ? 'PLN' : 'USD', availability: 'https://schema.org/InStock', url: SETUP },
        author: { '@id': `${BASE}#org` }, publisher: { '@id': `${BASE}#org` }, sameAs: [REPO],
      },
      {
        '@type': 'SoftwareSourceCode', '@id': `${BASE}#source`, name: 'WinSwift Studio', codeRepository: REPO,
        programmingLanguage: ['Swift', 'JavaScript'], license: 'https://opensource.org/licenses/MIT', targetProduct: { '@id': `${BASE}#app` },
      },
      {
        '@type': 'HowTo', '@id': `${url}#howto`, name: pl ? 'Jak zacząć programować na iPhone\'a na Windows' : 'How to start iOS development on Windows',
        totalTime: 'PT10M', tool: [{ '@type': 'HowToTool', name: 'WinSwift Studio' }],
        step: steps.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text, url: `${url}#start` })),
      },
      {
        '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: lang,
        mainEntity: FAQ[lang].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, '\\u003c');
}

function hashName(file, name, ext) {
  const data = fs.readFileSync(file);
  const h = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
  const out = `${name}.${h}.${ext}`;
  fs.writeFileSync(path.join(OUT, 'assets', out), data);
  return out;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const d of ['assets', 'img', 'fonts', 'en']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

  const CSS = hashName(path.join(SRC, 'assets', 'site.css'), 'site', 'css');
  const JS = hashName(path.join(SRC, 'assets', 'site.js'), 'site', 'js');
  const LICZNIK = hashName(path.join(SRC, 'assets', 'licznik.js'), 'licznik', 'js');

  // fonts (Latin + Latin Extended for Polish)
  const fdir = path.join(ROOT, 'node_modules', '@fontsource', 'inter', 'files');
  for (const w of [400, 600, 800]) for (const sub of ['latin', 'latin-ext']) {
    fs.copyFileSync(path.join(fdir, `inter-${sub}-${w}-normal.woff2`), path.join(OUT, 'fonts', `inter-${sub}-${w}.woff2`));
  }

  // icons
  for (const s of [32, 64, 180, 192, 512]) fs.copyFileSync(path.join(ROOT, 'build', 'web', `icon-${s}.png`), path.join(OUT, 'img', `icon-${s}.png`));
  fs.copyFileSync(path.join(ROOT, 'build', 'web', 'icon-180.png'), path.join(OUT, 'apple-touch-icon.png'));
  fs.copyFileSync(path.join(ROOT, 'build', 'web', 'favicon.ico'), path.join(OUT, 'favicon.ico'));
  fs.copyFileSync(path.join(ROOT, 'build', 'icon-source.svg'), path.join(OUT, 'icon.svg'));
  fs.copyFileSync(path.join(ROOT, 'src', 'img', 'prozlecenie.png'), path.join(OUT, 'img', 'prozlecenie.png'));

  // image work in an offscreen Chromium page (canvas): WebP screenshots and share images
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { offscreen: true, webSecurity: false } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const dataUrl = f => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const js = code => win.webContents.executeJavaScript(code);
  const saveDataUrl = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  await js(`window.load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); true`);
  for (const s of SHOTS) {
    const src = dataUrl(path.join(ROOT, 'docs', 'screenshots', `${s}.png`));
    for (const w of [1366, 820]) {
      const url = await js(`load(${JSON.stringify(src)}).then(i => { const c = document.createElement('canvas'); c.width = ${w}; c.height = Math.round(i.height * ${w} / i.width);
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(i, 0, 0, c.width, c.height); return c.toDataURL('image/webp', 0.86); })`);
      saveDataUrl(url, path.join(OUT, 'img', `${s}-${w}.webp`));
    }
  }
  // the iPhone alone (docs/screenshots/simulator-device.png), corners cut to the bezel's radius → transparent WebP
  const deviceSrc = dataUrl(path.join(ROOT, 'docs', 'screenshots', 'simulator-device.png'));
  for (const w of [640, 320]) {
    const url = await js(`load(${JSON.stringify(deviceSrc)}).then(i => { const c = document.createElement('canvas'); c.width = ${w}; c.height = Math.round(i.height * ${w} / i.width);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, c.width * 0.159); g.clip();
      g.drawImage(i, 0, 0, c.width, c.height); return c.toDataURL('image/webp', 0.9); })`);
    saveDataUrl(url, path.join(OUT, 'img', `iphone-${w}.webp`));
  }

  // share images 1200×630 (Open Graph / Twitter / Discord / Messenger)
  const fontUrl = w => `data:font/woff2;base64,${fs.readFileSync(path.join(fdir, `inter-latin-ext-${w}-normal.woff2`)).toString('base64')}`;
  const fontUrlL = w => `data:font/woff2;base64,${fs.readFileSync(path.join(fdir, `inter-latin-${w}-normal.woff2`)).toString('base64')}`;
  await js(`(async () => {
    for (const [w, a, b] of [[800, ${JSON.stringify(fontUrlL(800))}, ${JSON.stringify(fontUrl(800))}], [600, ${JSON.stringify(fontUrlL(600))}, ${JSON.stringify(fontUrl(600))}]]) {
      document.fonts.add(await new FontFace('OGInter', 'url(' + a + ')', { weight: String(w), unicodeRange: 'U+0000-00FF' }).load());
      document.fonts.add(await new FontFace('OGInter', 'url(' + b + ')', { weight: String(w), unicodeRange: 'U+0100-02FF' }).load());
    }
    return true; })()`);
  const og = async (lines, sub, file) => {
    const url = await js(`(async () => {
      const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#120c34'); bg.addColorStop(.6, '#2a1470'); bg.addColorStop(1, '#0a0720');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const blob = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
      blob(1060, 600, 520, 'rgba(255,61,139,.55)'); blob(1180, 640, 300, 'rgba(255,138,61,.6)'); blob(80, 0, 480, 'rgba(79,209,255,.22)');
      g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
      for (let y = 0; y < H; y += 48) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
      // screenshot card on the right
      const shot = await load(${JSON.stringify(dataUrl(path.join(ROOT, 'docs', 'screenshots', 'canvas.png')))});
      g.save(); g.translate(640, 150); g.rotate(-0.05);
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
      const sw = 680, sh = Math.round(shot.height * sw / shot.width);
      g.beginPath(); g.roundRect(0, 0, sw, sh, 18); g.fillStyle = '#1f1f24'; g.fill(); g.shadowColor = 'transparent';
      g.clip(); g.drawImage(shot, 0, 0, sw, sh); g.restore();
      const phone = await load(${JSON.stringify(deviceSrc)});
      const pw = 190, ph = Math.round(phone.height * pw / phone.width);
      g.save(); g.translate(990, 255); g.rotate(0.06); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
      g.beginPath(); g.roundRect(0, 0, pw, ph, pw * 0.159); g.fillStyle = '#111'; g.fill(); g.shadowColor = 'transparent'; g.clip();
      g.drawImage(phone, 0, 0, pw, ph); g.restore();
      // icon + text
      const icon = await load(${JSON.stringify(dataUrl(path.join(ROOT, 'build', 'web', 'icon-512.png')))});
      g.shadowColor = 'rgba(139,92,246,.6)'; g.shadowBlur = 40; g.drawImage(icon, 64, 70, 128, 128); g.shadowColor = 'transparent';
      g.fillStyle = '#ffffff'; g.font = '800 40px OGInter'; g.fillText('WinSwift Studio', 212, 150);
      g.font = '600 20px OGInter'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('winswift.tacticalops.fun', 214, 182);
      const lines = ${JSON.stringify(lines)};
      let y = 300;
      lines.forEach((t, i) => {
        g.font = '800 62px OGInter';
        if (i === lines.length - 1) { const tw = g.measureText(t).width; const gr = g.createLinearGradient(64, 0, 64 + tw, 0); gr.addColorStop(0, '#ffb04a'); gr.addColorStop(.45, '#ff3d8b'); gr.addColorStop(1, '#b07bff'); g.fillStyle = gr; }
        else g.fillStyle = '#ffffff';
        g.fillText(t, 64, y); y += 74;
      });
      g.font = '600 24px OGInter'; g.fillStyle = 'rgba(238,235,255,.82)';
      ${JSON.stringify(sub)}.forEach((t, i) => g.fillText(t, 66, y + 10 + i * 34));
      return c.toDataURL('image/png');
    })()`);
    saveDataUrl(url, path.join(OUT, 'img', file));
  };
  await og(['Aplikacje na iPhone\'a', 'na Windows'], ['Swift i SwiftUI · symulator iPhone\'a', 'podgląd na żywo · debugger · za darmo'], 'og-image.png');
  await og(['Build iPhone apps', 'on Windows'], ['Swift & SwiftUI · iPhone simulator', 'live previews · debugger · free'], 'og-image-en.png');
  // 4:3 card thumbnail for tacticalops.fun/files (not part of this site)
  {
    const url = await js(`(async () => {
      const W = 800, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#120c34'); bg.addColorStop(.6, '#2a1470'); bg.addColorStop(1, '#0a0720');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const blob = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
      blob(700, 560, 420, 'rgba(255,61,139,.55)'); blob(780, 600, 240, 'rgba(255,138,61,.6)'); blob(60, 0, 380, 'rgba(79,209,255,.22)');
      const phone = await load(${JSON.stringify(deviceSrc)});
      const pw = 250, ph = Math.round(phone.height * pw / phone.width);
      g.save(); g.translate(500, 70); g.rotate(0.07); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 40; g.shadowOffsetY = 18;
      g.beginPath(); g.roundRect(0, 0, pw, ph, pw * 0.159); g.fillStyle = '#111'; g.fill(); g.shadowColor = 'transparent'; g.clip(); g.drawImage(phone, 0, 0, pw, ph); g.restore();
      const icon = await load(${JSON.stringify(dataUrl(path.join(ROOT, 'build', 'web', 'icon-512.png')))});
      g.shadowColor = 'rgba(139,92,246,.6)'; g.shadowBlur = 40; g.drawImage(icon, 56, 70, 150, 150); g.shadowColor = 'transparent';
      g.fillStyle = '#fff'; g.font = '800 50px OGInter'; g.fillText('WinSwift', 56, 300); g.fillText('Studio', 56, 356);
      const t = 'na Windows'; g.font = '800 34px OGInter';
      g.fillStyle = 'rgba(238,235,255,.85)'; g.fillText('Aplikacje na iPhone\\'a', 56, 430);
      const gr = g.createLinearGradient(56, 0, 56 + g.measureText(t).width, 0); gr.addColorStop(0, '#ffb04a'); gr.addColorStop(.5, '#ff3d8b'); gr.addColorStop(1, '#b07bff');
      g.fillStyle = gr; g.fillText(t, 56, 474);
      g.font = '600 20px OGInter'; g.fillStyle = 'rgba(238,235,255,.7)'; g.fillText('Swift · SwiftUI · symulator', 58, 530);
      return c.toDataURL('image/jpeg', 0.88);
    })()`);
    saveDataUrl(url, path.join(__dirname, 'files-thumb.jpg'));
  }
  win.destroy();

  // pages
  const page = (file, lang) => {
    let html = fs.readFileSync(path.join(SRC, file), 'utf8');
    const rep = { CSS, JS, LICZNIK, VERSION, SIZE, YEAR: String(new Date().getFullYear()), FAQ_HTML: faqHtml(lang), JSONLD: jsonLd(lang) };
    html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in rep ? rep[k] : m));
    fs.writeFileSync(path.join(OUT, file), html);
  };
  page('index.html', 'pl');
  page(path.join('en', 'index.html'), 'en');
  let nf = fs.readFileSync(path.join(SRC, '404.html'), 'utf8').replace(/\{\{CSS\}\}/g, CSS);
  fs.writeFileSync(path.join(OUT, '404.html'), nf);

  // crawler files
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
  const alt = `<xhtml:link rel="alternate" hreflang="pl" href="${BASE}"/><xhtml:link rel="alternate" hreflang="en" href="${BASE}en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${BASE}en/"/>`;
  const imgs = SHOTS.map(s => `<image:image><image:loc>${BASE}img/${s}-1366.webp</image:loc></image:image>`).join('') + `<image:image><image:loc>${BASE}img/iphone-640.webp</image:loc></image:image>`;
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>${BASE}</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority>${alt}${imgs}</url>
  <url><loc>${BASE}en/</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority>${alt}${imgs}</url>
</urlset>
`);
  fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({
    name: 'WinSwift Studio', short_name: 'WinSwift', description: 'Swift & SwiftUI on Windows — build iPhone apps without a Mac',
    start_url: '/', scope: '/', display: 'browser', background_color: '#0a0720', theme_color: '#120c34', lang: 'pl',
    icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
  }, null, 2));
  fs.writeFileSync(path.join(OUT, `${INDEXNOW}.txt`), INDEXNOW);
  fs.writeFileSync(path.join(OUT, 'llms.txt'), `# WinSwift Studio

> Free, open-source, Xcode-style IDE for Windows 10 and 11 for building iPhone apps in Swift and SwiftUI — with an iPhone simulator, live SwiftUI previews (#Preview canvas), an LLDB debugger and SourceKit-LSP code completion. No Mac needed for writing and testing; building .ipa files or publishing to the App Store still requires a Mac with Xcode.

- Version: ${VERSION} (Windows 10/11, 64-bit), license: MIT, price: free
- Download (installer): ${SETUP}
- Portable ZIP: ${ZIP}
- Source code: ${REPO}
- Website: ${BASE} (Polish), ${BASE}en/ (English)

## Key facts
- Uses the official Swift 6 compiler for Windows (swift.org) plus an open reimplementation of the SwiftUI API that renders in a built-in iPhone simulator window (iPhone 16 Pro, 16 Pro Max, 16, 16 Plus, 16e, SE).
- Supports SwiftUI (NavigationStack, List, Form, TabView, @State, @Binding, @Observable, @AppStorage, alerts, sheets, gestures, localization, asset catalogs). UIKit and Storyboards are not supported.
- One-click setup: per-user installer without admin rights; the app installs the Swift toolchain and Visual Studio Build Tools via winget.
- Not affiliated with Apple Inc. Sponsor: ProZlecenie.pl (https://prozlecenie.pl/).
`);
  console.log(`site built: ${OUT} (v${VERSION}, ${SIZE}, css ${CSS}, js ${JS}, IndexNow key ${INDEXNOW})`);
}

app.disableHardwareAcceleration();
app.whenReady().then(() => main().then(() => app.quit(), e => { console.error(e); app.exit(1); }));
