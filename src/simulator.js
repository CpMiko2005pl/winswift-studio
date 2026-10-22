'use strict';
// iPhone simulator: draws the SwiftUI view tree sent by the running program and sends taps/input back.

const $ = s => document.querySelector(s);
const screenEl = $('#screen');
const appRoot = $('#app-root');
const overlayRoot = $('#overlay-root');

let ICONS = new Set();
let ICON_BASE = '';
let tree = null;
let running = false;
let appName = 'App';
let theme = 'light';
let forcedScheme = null;
let lastSentText = {};
let navDepth = {};
let openPopup = null;

// ------------------------------------------------------------------ device language (Settings ▸ General ▸ Language & Region)

let LANG = 'en';
let DEVICE = { languages: [['en', 'English']], perms: {} };

// ------------------------------------------------------------------ device models (Product ▸ Destination)

const MODELS = {
  'iPhone 16 Pro': { w: 402, h: 874, kind: 'island', r: 55 },
  'iPhone 16 Pro Max': { w: 440, h: 956, kind: 'island', r: 55 },
  'iPhone 16': { w: 393, h: 852, kind: 'island', r: 55 },
  'iPhone 16 Plus': { w: 430, h: 932, kind: 'island', r: 55 },
  'iPhone 16e': { w: 390, h: 844, kind: 'notch', r: 47 },
  'iPhone SE (3rd generation)': { w: 375, h: 667, kind: 'home', r: 0 },
};
let MODEL_NAME = 'iPhone 16 Pro';
let SCREEN_W = 402;
let DEV_SIZE = { w: 434, h: 906 };
// from the model, not the DOM: offsetWidth already includes the zoom fitDevice() applied
function deviceSize() { return DEV_SIZE; }
function applyModel(name) {
  const m = MODELS[name] || MODELS['iPhone 16 Pro'];
  MODEL_NAME = MODELS[name] ? name : 'iPhone 16 Pro';
  SCREEN_W = m.w;
  const d = $('#device');
  const home = m.kind === 'home';
  const padX = home ? 22 : 16, padY = home ? 96 : 16;
  DEV_SIZE = { w: m.w + padX * 2, h: m.h + padY * 2 };
  const vars = {
    '--scr-w': m.w + 'px', '--scr-h': m.h + 'px', '--scr-r': m.r + 'px',
    '--dev-w': (m.w + padX * 2) + 'px', '--dev-h': (m.h + padY * 2) + 'px',
    '--bez-px': padX + 'px', '--bez-py': padY + 'px', '--bez-r': (home ? 58 : m.r + 14) + 'px',
    '--safe-top': (home ? 20 : m.kind === 'notch' ? 47 : 54) + 'px', '--safe-bottom': (home ? 0 : 34) + 'px',
  };
  for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
  d.classList.remove('m-island', 'm-notch', 'm-home');
  d.classList.add('m-' + m.kind);
  $('#sim-device').textContent = MODEL_NAME;
  fitDevice();
}
const TR = {
  pl: {
    Back: 'Wróć', Delete: 'Usuń', Settings: 'Ustawienia', Safari: 'Safari', Photos: 'Zdjęcia', Camera: 'Aparat', Notes: 'Notatki', Maps: 'Mapy', Weather: 'Pogoda',
    General: 'Ogólne', 'Language & Region': 'Język i region', 'iPhone Language': 'Język iPhone’a', 'Preferred Languages': 'Preferowane języki',
    'Privacy & Security': 'Prywatność i ochrona', 'Location Services': 'Usługi lokalizacji', About: 'To urządzenie', Name: 'Nazwa', 'Software Version': 'Wersja oprogramowania', Model: 'Model',
    'Allow Once': 'Pozwól raz', 'Allow While Using App': 'Pozwalaj, gdy aplikacja jest używana', "Don’t Allow": 'Nie pozwalaj',
    allowLoc: 'Pozwolić aplikacji „%@” na używanie Twojej lokalizacji?', Precise: 'Dokładna: wł.',
    Never: 'Nigdy', 'Ask Next Time': 'Zapytaj następnym razem', 'While Using the App': 'Gdy aplikacja jest używana',
    changeTo: 'Zmień na %@', Cancel: 'Anuluj', Developer: 'Deweloper', 'Built with SwiftCode': 'Zbudowane w WinSwift Studio',
    days: ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'],
    months: ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'],
    langFooter: 'Aplikacje i witryny będą używać pierwszego obsługiwanego języka z tej listy.',
    'Custom Location': 'Własne położenie', Latitude: 'Szer. geogr.', Longitude: 'Dług. geogr.', OK: 'OK',
  },
};
function T(s, arg) {
  const t = (TR[LANG.split('-')[0]] || {})[s];
  const v = t !== undefined ? t : ({ allowLoc: 'Allow “%@” to use your location?', Precise: 'Precise: On', changeTo: 'Change to %@', langFooter: 'Apps and websites will use the first language in this list that they support.' }[s] || s);
  return typeof v === 'string' && arg !== undefined ? v.replace('%@', arg) : v;
}
const LANG_NAMES = { en: ['English', 'English'], pl: ['Polski', 'Polish'], de: ['Deutsch', 'German'], fr: ['Français', 'French'], es: ['Español', 'Spanish'], it: ['Italiano', 'Italian'], uk: ['Українська', 'Ukrainian'] };

// ------------------------------------------------------------------ helpers

function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
function remember(id, v) { const a = lastSentText[id] || (lastSentText[id] = []); a.push(v); if (a.length > 30) a.shift(); }
function send(k, id, v) { window.sim.event(v === undefined ? { k, id } : { k, id, v }); }
function toast(msg) { const t = $('#sim-toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }

function sym(name, extra) {
  const i = document.createElement('i');
  i.className = 'sym' + (extra ? ' ' + extra : '');
  const n = sfSymbolToLucide(name, ICONS);
  i.style.setProperty('--icon', `url("${ICON_BASE}/${n}.svg")`);
  i.dataset.sf = name;
  return i;
}

// group nodes (Group, tags, Tab wrappers) are transparent containers
function flat(nodes) {
  const out = [];
  for (const n of nodes || []) {
    if (n.t === 'group' && !(n.m && n.m.some(m => m.k !== 'tag'))) out.push(...flat(n.c));
    else out.push(n);
  }
  return out;
}

function mods(n, k) { return (n.m || []).filter(m => m.k === k); }
function mod(n, k) { return (n.m || []).find(m => m.k === k); }

// depth-first search for a modifier, not crossing into nested navigation containers
function findMod(nodes, k, out = []) {
  for (const n of nodes || []) {
    for (const m of n.m || []) if (m.k === k) out.push(m);
    if (n.t !== 'nav' && n.t !== 'tabview') findMod(n.c, k, out);
  }
  return out;
}

const H_ALIGN = { leading: 'flex-start', center: 'center', trailing: 'flex-end' };
const V_ALIGN = { top: 'flex-start', center: 'center', bottom: 'flex-end', baseline: 'baseline' };
const TEXT_ALIGN = { leading: 'left', center: 'center', trailing: 'right' };

const FONT_FAMILY = {
  default: '',
  rounded: '"SF Pro Rounded", "Nunito", Inter, sans-serif',
  serif: '"New York", Georgia, "Times New Roman", serif',
  monospaced: '"SF Mono", Menlo, "Cascadia Mono", Consolas, monospace',
};

// ------------------------------------------------------------------ build

let overlays = [];

function build(n, ctx) {
  let el;
  switch (n.t) {
    case 'text': el = buildText(n); break;
    case 'symbol': {
      el = sym(n.p.name, n.p.resizable ? 'resizable' : '');
      if (n.p.size) el.style.fontSize = n.p.size + 'px';
      el._H = el._V = !!n.p.resizable;
      break;
    }
    case 'image': el = buildImage(n); break;
    case 'vstack': case 'hstack': el = buildStack(n, n.t === 'vstack' ? 'v' : 'h', ctx); break;
    case 'zstack': el = buildZStack(n, ctx); break;
    case 'grid': el = buildGrid(n, ctx); break;
    case 'spacer': {
      el = div('spacer');
      el._spacer = true;
      const min = n.p.min ?? 8;
      if (ctx.axis === 'h') { el._H = true; el.style.minWidth = min + 'px'; }
      else if (ctx.axis === 'v') { el._V = true; el.style.minHeight = min + 'px'; }
      break;
    }
    case 'divider': el = div('divider'); if (ctx.axis === 'h') el._V = true; else el._H = true; break;
    case 'color': el = div('color'); el.style.background = n.p.c; el._H = el._V = true; break;
    case 'shape': el = buildShape(n); break;
    case 'button': el = buildButton(n, ctx); break;
    case 'navlink': el = buildNavLinkInline(n, ctx); break;
    case 'textfield': el = buildTextField(n, ctx); break;
    case 'toggle': el = buildToggle(n, ctx); break;
    case 'slider': el = buildSlider(n); break;
    case 'stepper': el = buildStepper(n, ctx); break;
    case 'picker': el = buildPicker(n, ctx); break;
    case 'datepicker': el = buildDatePicker(n, ctx); break;
    case 'progress': el = buildProgress(n); break;
    case 'label': el = buildLabel(n, ctx); break;
    case 'list': el = buildList(n, ctx); break;
    case 'section': el = buildSectionLoose(n, ctx); break;
    case 'scroll': el = buildScroll(n, ctx); break;
    case 'nav': el = buildNav(n, ctx); break;
    case 'tabview': el = buildTabs(n, ctx); break;
    case 'menu': el = buildMenu(n, ctx); break;
    case 'disclosure': el = buildDisclosure(n, ctx); break;
    case 'toolbaritem': el = div('hstack'); el.style.gap = '16px'; for (const c of flat(n.c)) el.appendChild(build(c, { ...ctx, axis: 'h' })); break;
    case 'screen': el = buildContent(n.c, { safeTop: true }); break;
    case 'group': {
      el = div('group');
      for (const c of flat(n.c)) {
        const k = build(c, ctx);
        el.appendChild(k);
        el._H = el._H || k._H; el._V = el._V || k._V;
      }
      if (n.m && n.m.length) { el.className = 'x'; }
      break;
    }
    default: el = div('x');
  }
  if (n.p && n.p.unavailable) el.classList.add('unavailable');
  return applyMods(el, n, ctx);
}

function buildText(n) {
  const el = div('text');
  for (const seg of n.p.segs || []) {
    const st = seg.st || {};
    let parts = [seg.s];
    if (st.img || /⟦[^⟧]+⟧/.test(seg.s)) parts = seg.s.split(/(⟦[^⟧]+⟧)/);
    for (const part of parts) {
      if (!part) continue;
      const m = part.match(/^⟦([^⟧]+)⟧$/);
      let node;
      if (m) node = sym(m[1]);
      else if (Object.keys(st).length) { node = document.createElement('span'); node.textContent = part; }
      else { el.appendChild(document.createTextNode(part)); continue; }
      if (st.fontSize) node.style.fontSize = st.fontSize;
      if (st.fontWeight) node.style.fontWeight = st.fontWeight;
      if (st.fontStyle) node.style.fontStyle = st.fontStyle;
      if (st.color) node.style.color = st.color;
      if (st.textDecoration) node.style.textDecoration = st.textDecoration;
      if (st.letterSpacing) node.style.letterSpacing = st.letterSpacing;
      if (st.textTransform) node.style.textTransform = st.textTransform;
      if (st.design && FONT_FAMILY[st.design]) node.style.fontFamily = FONT_FAMILY[st.design];
      el.appendChild(node);
    }
  }
  return el;
}

function buildImage(n) {
  if (!n.p.src) {
    const el = div('img missing');
    el.textContent = n.p.name;
    return el;
  }
  const img = document.createElement('img');
  img.className = 'img' + (n.p.resizable ? ' resizable' : '');
  img.src = 'file:///' + n.p.src.replace(/\\/g, '/');
  img.draggable = false;
  img._H = img._V = !!n.p.resizable;
  // an image without .resizable() is drawn at its size in points (pixels ÷ the asset's 1x/2x/3x scale)
  if (!n.p.resizable) img.onload = () => { img.style.width = img.naturalWidth / (n.p.scale || 1) + 'px'; };
  return img;
}

function placeChildren(el, kids, axis) {
  let H = false, V = false;
  for (const k of kids) {
    el.appendChild(k);
    if (axis === 'v') {
      if (k._V) { k.style.flex = k._spacer ? '1 1 0' : '1 1 0'; k.style.minHeight = k.style.minHeight || '0'; V = true; }
      if (k._H) { k.style.alignSelf = 'stretch'; H = true; }
    } else {
      if (k._H) { k.style.flex = '1 1 0'; k.style.minWidth = k.style.minWidth || '0'; H = true; }
      // like SwiftUI's HStack, short labels keep their size and long text wraps instead
      else if (k.classList.contains('text') && k.textContent.length <= 24) k.style.flex = '0 0 auto';
      else if (!k._spacer) k.style.flex = '0 1 auto';
      if (k._V) { k.style.alignSelf = 'stretch'; V = true; }
    }
  }
  el._H = H; el._V = V;
}

function buildStack(n, axis, ctx) {
  const el = div(axis === 'v' ? 'vstack' : 'hstack');
  const spacing = n.p.spacing ?? 8;
  el.style.gap = spacing + 'px';
  if (axis === 'v') el.style.alignItems = H_ALIGN[n.p.align] || 'center';
  else el.style.alignItems = V_ALIGN[n.p.align] || 'center';
  if (axis === 'v') el.style.textAlign = TEXT_ALIGN[n.p.align] || 'left';
  const kids = flat(n.c).map(c => build(c, { ...ctx, axis, inList: false }));
  placeChildren(el, kids, axis);
  return el;
}

function buildZStack(n, ctx) {
  const el = div('zstack');
  const a = n.p.align || { h: 'center', v: 'center' };
  el.style.justifyItems = { leading: 'start', center: 'center', trailing: 'end' }[a.h];
  el.style.alignItems = { top: 'start', center: 'center', bottom: 'end', baseline: 'center' }[a.v];
  let H = !!n.p.fill, V = !!n.p.fill;
  for (const c of flat(n.c)) {
    const k = build(c, { ...ctx, axis: 'z', inList: false });
    if (k._H) { k.style.justifySelf = 'stretch'; H = true; }
    if (k._V) { k.style.alignSelf = 'stretch'; V = true; }
    el.appendChild(k);
  }
  el._H = H; el._V = V;
  return el;
}

function buildGrid(n, ctx) {
  const el = div('grid');
  const cols = n.p.cols || [];
  const tpl = cols.map(c => c.kind === 'fixed' ? `${c.v}px` : c.kind === 'adaptive' ? `repeat(auto-fill, minmax(${c.v}px, 1fr))` : 'minmax(0, 1fr)');
  el.style.gridTemplateColumns = tpl.join(' ') || 'minmax(0,1fr)';
  el.style.gap = (n.p.spacing ?? 8) + 'px';
  for (const c of flat(n.c)) {
    const k = build(c, { ...ctx, axis: 'z', inList: false });
    k.style.justifySelf = k._H ? 'stretch' : 'center';
    el.appendChild(k);
  }
  el._H = true;
  return el;
}

function buildShape(n) {
  const el = div('shape');
  if (n.p.fill) el.style.background = n.p.fill === 'currentColor' ? 'var(--fg-shape, currentColor)' : n.p.fill;
  if (n.p.stroke) el.style.boxShadow = `inset 0 0 0 ${n.p.lw || 1}px ${n.p.stroke}`;
  if (n.p.fill === 'currentColor' && !n.p.stroke) el.style.background = 'currentColor';
  const r = n.p.shape === 'circle' ? '50%' : n.p.shape === 'capsule' ? '9999px' : n.p.shape === 'ellipse' ? '50%' : (n.p.r ? n.p.r + 'px' : '0');
  el.style.borderRadius = r;
  if (n.p.shape === 'circle') el.style.aspectRatio = '1';
  el._H = el._V = true;
  return el;
}

function buildButton(n, ctx) {
  const style = n.p.style || 'automatic';
  const el = div('button s-' + style);
  if (n.p.role === 'destructive') el.classList.add('destructive');
  if (n.p.role === 'cancel') el.classList.add('cancel');
  if (n.p.disabled) el.classList.add('disabled');
  if (n.p.size === 'large') el.classList.add('z-large');
  if (n.p.size === 'small' || n.p.size === 'mini') el.classList.add('z-small');
  if (n.p.shape === 'capsule') el.classList.add('sh-capsule');
  const kids = flat(n.c).map(c => build(c, { ...ctx, axis: 'h', inButton: true }));
  placeChildren(el, kids, 'h');
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (n.p.link) { window.sim.openLink(n.p.link); return; }
    send('tap', n.id);
  });
  return el;
}

function buildNavLinkInline(n, ctx) {
  const el = div('button s-automatic navlink');
  if (n.p.disabled) el.classList.add('disabled');
  const kids = flat(n.c).map(c => build(c, { ...ctx, axis: 'h' }));
  placeChildren(el, kids, 'h');
  el.addEventListener('click', e => { e.stopPropagation(); send('tap', n.id); });
  return el;
}

function buildTextField(n, ctx) {
  const multi = n.p.multi || n.p.editor;
  const el = document.createElement(multi ? 'textarea' : 'input');
  if (!multi) el.type = n.p.secure ? 'password' : 'text';
  el.className = 'field' + (n.p.style === 'roundedBorder' ? ' roundedBorder' : '') + (n.p.editor ? ' editor' : '');
  el.placeholder = n.p.ph || '';
  el.value = n.p.v || '';
  el.spellcheck = false;
  if (n.p.disabled) el.disabled = true;
  if (multi && !n.p.editor) { el.rows = 1; el.style.resize = 'none'; el.oninput2 = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }; }
  el.dataset.fid = n.id;
  el.addEventListener('input', () => {
    remember(n.id, el.value);
    send('text', n.id, el.value);
    if (el.oninput2) el.oninput2();
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !(multi && e.shiftKey) && !n.p.editor) {
      e.preventDefault();
      let p = el;
      while (p && p !== document.body) { if (p.dataset && p.dataset.submit) { send('tap', p.dataset.submit); break; } p = p.parentElement; }
    }
  });
  el.addEventListener('click', e => e.stopPropagation());
  el._H = true;
  if (n.p.editor) el._V = true;
  return el;
}

function controlRow(cls, n, ctx, control) {
  const el = div(cls);
  if (!n.p.hideLabel && n.c && n.c.length) {
    const lab = div('tlabel');
    for (const c of flat(n.c)) lab.appendChild(build(c, { ...ctx, axis: 'h' }));
    el.appendChild(lab);
  }
  el.appendChild(control);
  el._H = true;
  return el;
}

function buildToggle(n, ctx) {
  if (n.p.style === 'button') {
    const b = div('button ' + (n.p.on ? 's-borderedProminent' : 's-bordered'));
    for (const c of flat(n.c)) b.appendChild(build(c, { ...ctx, axis: 'h' }));
    b.addEventListener('click', e => { e.stopPropagation(); send('bool', n.id, !n.p.on); });
    return b;
  }
  const sw = div('switch' + (n.p.on ? ' on' : ''));
  const el = controlRow('toggle', n, ctx, sw);
  if (n.p.disabled) el.classList.add('disabled');
  el.addEventListener('click', e => {
    e.stopPropagation();
    sw.classList.toggle('on');
    send('bool', n.id, !n.p.on);
  });
  return el;
}

function buildSlider(n) {
  const el = document.createElement('input');
  el.type = 'range';
  el.className = 'slider';
  el.min = n.p.min; el.max = n.p.max;
  el.step = n.p.step || 'any';
  el.value = n.p.v;
  const pct = () => el.style.setProperty('--p', ((el.value - n.p.min) / ((n.p.max - n.p.min) || 1) * 100) + '%');
  pct();
  el.dataset.fid = n.id;
  el.addEventListener('input', () => { pct(); send('num', n.id, parseFloat(el.value)); });
  el.addEventListener('click', e => e.stopPropagation());
  el._H = true;
  return el;
}

function buildStepper(n, ctx) {
  const ctl = div('stepctl');
  const minus = document.createElement('span'); minus.textContent = '−';
  const plus = document.createElement('span'); plus.textContent = '+';
  minus.addEventListener('click', e => { e.stopPropagation(); send('tap', n.id + '-'); });
  plus.addEventListener('click', e => { e.stopPropagation(); send('tap', n.id + '+'); });
  ctl.append(minus, plus);
  return controlRow('stepper', n, ctx, ctl);
}

function buildPicker(n, ctx) {
  const opts = n.p.opts || [];
  const style = n.p.style;
  if (style === 'segmented') {
    const seg = div('segmented');
    opts.forEach((o, i) => {
      const s = document.createElement('span');
      s.textContent = o;
      if (i === n.p.sel) s.className = 'sel';
      s.addEventListener('click', e => { e.stopPropagation(); send('index', n.id, i); });
      seg.appendChild(s);
    });
    seg._H = true;
    return seg;
  }
  if (style === 'wheel') {
    const w = div('wheel');
    opts.forEach((o, i) => {
      const s = document.createElement('span');
      s.textContent = o;
      if (i === n.p.sel) s.className = 'sel';
      s.addEventListener('click', e => { e.stopPropagation(); send('index', n.id, i); });
      w.appendChild(s);
    });
    w._H = true;
    return w;
  }
  const val = div('picker-value' + (ctx.inList ? '' : ' inline'));
  val.append(document.createTextNode(opts[n.p.sel] ?? ''), sym('chevron.up.chevron.down', 'small'));
  val.querySelector('.sym').style.setProperty('--icon', `url("${ICON_BASE}/chevrons-up-down.svg")`);
  const el = ctx.inList ? controlRow('picker-row', n, ctx, val) : val;
  el.addEventListener('click', e => {
    e.stopPropagation();
    showPopMenu(el, opts.map((o, i) => ({ label: o, checked: i === n.p.sel, act: () => send('index', n.id, i) })));
  });
  return el;
}

function buildDatePicker(n, ctx) {
  const input = document.createElement('input');
  input.type = n.p.kind === 'date' ? 'date' : n.p.kind === 'time' ? 'time' : 'datetime-local';
  const v = n.p.v || '';
  const cut = s => n.p.kind === 'date' ? s.slice(0, 10) : n.p.kind === 'time' ? s.slice(11, 16) : s.slice(0, 16);
  input.value = cut(v);
  if (n.p.min) input.min = cut(n.p.min);
  if (n.p.max) input.max = cut(n.p.max);
  if (n.p.disabled) input.disabled = true;
  input.lang = LANG;
  input.addEventListener('change', () => {
    let iso;
    if (n.p.kind === 'date') iso = input.value + v.slice(10);
    else if (n.p.kind === 'time') iso = v.slice(0, 11) + input.value + ':00';
    else iso = input.value + ':00';
    send('text', n.id, iso);
  });
  input.addEventListener('click', e => e.stopPropagation());
  return controlRow('datepicker', n, ctx, input);
}

function buildProgress(n) {
  if (n.p.v == null || n.p.style === 'circular') {
    const w = div('spinner-wrap');
    w.appendChild(div('spinner'));
    if (n.p.title) { const t = div('text'); t.textContent = n.p.title; w.appendChild(t); }
    return w;
  }
  const el = div('progress-lin');
  if (n.p.title) { const t = div('text'); t.textContent = n.p.title; el.appendChild(t); }
  const bar = div('bar'); const fill = div();
  fill.style.width = Math.max(0, Math.min(1, n.p.v)) * 100 + '%';
  bar.appendChild(fill); el.appendChild(bar);
  el._H = true;
  return el;
}

function buildLabel(n, ctx) {
  const el = div('label ' + (n.p.style || ''));
  for (const c of n.c) el.appendChild(build(c, { ...ctx, axis: 'h' }));
  return el;
}

function buildMenu(n, ctx) {
  const el = div('button s-automatic');
  for (const c of flat(n.c)) el.appendChild(build(c, { ...ctx, axis: 'h' }));
  el.addEventListener('click', e => {
    e.stopPropagation();
    showPopMenu(el, menuItems(n.p.items));
  });
  return el;
}

function menuItems(nodes) {
  const items = [];
  for (const it of flat(nodes)) {
    if (it.t === 'button' || it.t === 'navlink') {
      const label = textOf(it);
      const icon = findSym(it);
      items.push({ label, icon, destructive: it.p && it.p.role === 'destructive', act: () => send('tap', it.id) });
    } else if (it.t === 'picker') {
      (it.p.opts || []).forEach((o, i) => items.push({ label: o, checked: i === it.p.sel, act: () => send('index', it.id, i) }));
    } else if (it.t === 'menu') {
      items.push({ label: textOf({ c: it.c }), act: null, sub: it });
    }
  }
  return items;
}

function textOf(n) {
  if (!n) return '';
  if (n.t === 'text') return (n.p.segs || []).map(s => s.s.replace(/⟦[^⟧]+⟧/g, '')).join('');
  return (n.c || []).map(textOf).filter(Boolean).join(' ');
}
function findSym(n) {
  if (!n) return null;
  if (n.t === 'symbol') return n.p.name;
  for (const c of n.c || []) { const s = findSym(c); if (s) return s; }
  return null;
}

function buildDisclosure(n, ctx) {
  const el = div('vstack');
  el.style.alignItems = 'stretch';
  const head = div('hstack');
  head.style.gap = '8px';
  for (const c of flat(n.p.label)) head.appendChild(build(c, { ...ctx, axis: 'h' }));
  const sp = div('spacer'); head.appendChild(sp);
  const ch = sym('chevron.right', 'disclosure-chev' + (n.p.open ? ' open' : ''));
  ch.style.color = 'var(--accent)';
  head.appendChild(ch);
  head.addEventListener('click', e => { e.stopPropagation(); send('tap', n.id); });
  el.appendChild(head);
  if (n.p.open) for (const c of flat(n.c)) el.appendChild(build(c, { ...ctx, axis: 'v' }));
  el._H = true;
  return el;
}

function buildScroll(n, ctx) {
  const h = n.p.axis === 'h';
  const el = div('scroll' + (h ? ' h' : ''));
  el.dataset.sid = n.id;
  const content = div('scroll-content');
  const kids = flat(n.c).map(c => build(c, { ...ctx, axis: h ? 'h' : 'v', inList: false }));
  for (const k of kids) {
    content.appendChild(k);
    if (!h && k._H) k.style.alignSelf = 'stretch';
  }
  if (!h) content.style.gap = '8px';
  else content.style.gap = '8px';
  // a vertical scroll view's content is as wide as the screen
  if (!h) content.style.alignSelf = 'stretch';
  el.appendChild(content);
  el._H = true; el._V = !h;
  return el;
}

// ------------------------------------------------------------------ lists

function buildList(n, ctx) {
  const style = n.p.style || 'insetGrouped';
  const el = div('list ' + style + (n.p.editing ? ' editing' : ''));
  el.dataset.sid = n.id;
  ctx = { ...ctx, editing: !!n.p.editing };
  if (findMod([n], 'scrollBg').some(m => m.v === 'hidden')) el.classList.add('nobg');
  const sections = [];
  let loose = null;
  for (const c of flat(n.c)) {
    if (c.t === 'section') { loose = null; sections.push({ node: c, header: c.p.header, footer: c.p.footer, rows: flat(c.c) }); }
    else { if (!loose) { loose = { rows: [] }; sections.push(loose); } loose.rows.push(c); }
  }
  sections.forEach((s, i) => {
    const sec = div('sec' + (i === 0 ? ' first-sec' : ''));
    if (i === 0 && (!s.header || !s.header.length)) sec.style.marginTop = ctx.underLargeTitle ? '8px' : '18px';
    if (s.header && s.header.length) {
      const h = div('sec-h');
      for (const hn of s.header) h.appendChild(build(hn, { axis: 'h' }));
      sec.appendChild(h);
    }
    const cells = div('cells');
    for (const r of s.rows) {
      const inlinePicker = r.t === 'picker' && r.p.style === 'inline';
      if (inlinePicker) { for (const c of inlinePickerCells(r)) cells.appendChild(c); continue; }
      cells.appendChild(buildCell(r, ctx));
    }
    if (s.rows.length) sec.appendChild(cells);
    if (s.footer && s.footer.length) {
      const f = div('sec-f');
      for (const fn of s.footer) f.appendChild(build(fn, { axis: 'h' }));
      sec.appendChild(f);
    }
    el.appendChild(sec);
  });
  el._H = el._V = true;
  return el;
}

function inlinePickerCells(n) {
  return (n.p.opts || []).map((o, i) => {
    const cell = div('cell tappable');
    const t = div('text'); t.textContent = o; t.style.flex = '1';
    cell.appendChild(t);
    if (i === n.p.sel) { const c = sym('checkmark'); c.style.color = 'var(--accent)'; cell.appendChild(c); }
    cell.addEventListener('click', () => send('index', n.id, i));
    return cell;
  });
}

function buildCell(r, ctx) {
  const cell = div('cell');
  const inner = div('cell-inner');
  const cctx = { ...ctx, axis: 'h', inList: true };
  let tapId = null;

  if (r.t === 'navlink' || (r.t === 'button' && (r.p.style || 'automatic') === 'automatic')) {
    // whole row is the control
    tapId = r.id;
    const content = div('hstack');
    content.style.flex = '1 1 auto';
    content.style.gap = '12px';
    if (r.t === 'button' && !r.p.disabled) content.style.color = r.p.role === 'destructive' ? 'var(--red)' : 'var(--btn-fg, var(--tint, var(--accent)))';
    if (r.p.disabled) { content.style.color = 'var(--label3)'; tapId = null; }
    const kids = flat(r.c).map(c => build(c, cctx));
    placeChildren(content, kids, 'h');
    content.style.flex = '1 1 auto';
    inner.appendChild(applyMods(content, r, cctx));
    if (r.t === 'navlink') {
      const ch = sym('chevron.right', 'chev');
      inner.appendChild(ch);
    }
    cell.classList.add('tappable');
  } else {
    const content = build(r, cctx);
    content.style.flex = content.style.flex || '1 1 auto';
    if (content.classList.contains('button')) content.style.flex = '0 0 auto';
    inner.appendChild(content);
  }
  if (r.c && r.c[0] && r.c[0].t === 'label') cell.classList.add('with-icon');
  if (r.t === 'label') cell.classList.add('with-icon');
  const badge = mod(r, 'badge');
  if (badge && badge.v != null) { const b = div('badge-r'); b.textContent = badge.v; inner.appendChild(b); }
  cell.appendChild(inner);

  const rowBg = mod(r, 'rowBg');
  if (rowBg) cell.style.background = rowBg.v;
  if ((mod(r, 'rowSeparator') || {}).v === 'hidden') cell.classList.add('nosep');
  const ins = mod(r, 'rowInsets');
  if (ins && ins.t != null) cell.style.padding = `${ins.t}px ${ins.r}px ${ins.b}px ${ins.l}px`;

  // swipe-to-delete / swipe actions: drag left or right-click
  const del = mod(r, 'deletable');
  const swipe = mod(r, 'swipe');
  if (del && ctx.editing) {
    // EditButton: a red minus reveals the Delete button
    cell.classList.add('deletable');
    tapId = null;
    const c = div('del-circle');
    c.addEventListener('click', e => { e.stopPropagation(); cell.classList.toggle('swiped'); });
    inner.prepend(c);
  }
  if (del || swipe) {
    const acts = div('cell-actions');
    if (swipe) for (const b of flat(swipe.v)) {
      const s = document.createElement('span');
      s.textContent = textOf(b) || '•';
      const bg = (b.m || []).find(m => m.k === 'tint');
      s.style.background = b.p.role === 'destructive' ? 'var(--red)' : (bg ? bg.v : 'var(--gray)');
      s.addEventListener('click', e => { e.stopPropagation(); send('tap', b.id); });
      acts.appendChild(s);
    }
    if (del && !(swipe && flat(swipe.v).some(b => b.p.role === 'destructive'))) {
      const s = document.createElement('span');
      s.textContent = T('Delete');
      s.addEventListener('click', e => { e.stopPropagation(); send('tap', del.id); });
      acts.appendChild(s);
    }
    cell.appendChild(acts);
    let startX = null;
    cell.addEventListener('pointerdown', e => { startX = e.clientX; });
    cell.addEventListener('pointerup', e => {
      if (startX == null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (dx < -30) { cell.classList.add('swiped'); cell._justSwiped = true; }
      else if (dx > 30) cell.classList.remove('swiped');
    });
    cell.addEventListener('contextmenu', e => { e.preventDefault(); cell.classList.toggle('swiped'); });
  }

  if (tapId) {
    cell.addEventListener('click', () => {
      if (cell._justSwiped) { cell._justSwiped = false; return; }
      if (cell.classList.contains('swiped')) { cell.classList.remove('swiped'); return; }
      send('tap', tapId);
    });
  } else {
    cell.addEventListener('click', e => {
      if (cell.classList.contains('swiped') && !cell._justSwiped) cell.classList.remove('swiped');
      cell._justSwiped = false;
      // tapping a row with a single toggle / picker activates it like on iOS
    });
  }
  return cell;
}

function buildSectionLoose(n, ctx) {
  // Section outside a List behaves like a VStack with header/footer
  const el = div('vstack');
  el.style.gap = '8px';
  el.style.alignItems = 'stretch';
  for (const h of n.p.header || []) { const k = build(h, ctx); k.style.color = 'var(--label2)'; k.style.fontSize = '13px'; el.appendChild(k); }
  for (const c of flat(n.c)) el.appendChild(build(c, { ...ctx, axis: 'v' }));
  for (const f of n.p.footer || []) el.appendChild(build(f, ctx));
  el._H = true;
  return el;
}

// ------------------------------------------------------------------ containers that fill the screen

function buildContent(nodes, opts = {}) {
  const items = flat(nodes);
  if (items.length === 1 && (items[0].t === 'nav' || items[0].t === 'tabview')) {
    const el = build(items[0], { axis: 'v' });
    el.style.flex = '1 1 auto';
    return el;
  }
  const area = div('fill-area');
  area.dataset.sid = (items[0] && items[0].id || 'root') + '#area';
  if (opts.safeTop) area.style.paddingTop = 'var(--safe-top)';
  if (opts.safeBottom !== false) area.style.paddingBottom = 'var(--safe-bottom)';
  if (opts.padTop != null) area.style.paddingTop = typeof opts.padTop === 'number' ? opts.padTop + 'px' : opts.padTop;
  let fills = false;
  for (const n of items) {
    const k = build(n, { axis: 'v', underLargeTitle: opts.underLargeTitle });
    // `.background(Color)` on a full-screen view also paints the safe areas, like iOS
    if (items.length === 1 && k._V && k._H) { const bg = fillBackground(n); if (bg) area.style.background = bg; }
    if (k._V) { k.style.flex = '1 1 auto'; k.style.minHeight = '0'; fills = true; }
    if (k._H) k.style.alignSelf = 'stretch';
    if (!k.classList.contains('isa')) { k.style.position = k.style.position || 'relative'; k.style.zIndex = k.style.zIndex || '1'; }
    area.appendChild(k);
  }
  // lists and scroll views manage their own scrolling and safe area
  if (fills && items.length === 1 && (items[0].t === 'list' || items[0].t === 'scroll')) {
    area.style.paddingBottom = '0';
    area.style.overflow = 'hidden';
    if (opts.safeTop && items[0].t === 'list') { area.style.paddingTop = '0'; area.firstChild.style.paddingTop = 'var(--safe-top)'; }
  }
  area._H = area._V = true;
  return area;
}

/** The background of a view that fills its container: a bg modifier applied after it was made to fill. */
function fillBackground(n) {
  let fill = false, bg = null;
  for (const m of n.m || []) {
    if (m.k === 'frame' && (m.maxW === 'inf' || m.maxH === 'inf')) fill = true;
    if (m.k === 'bg' && typeof m.v === 'string' && !m.shape && (fill || ['list', 'color', 'nav'].includes(n.t))) bg = m.v;
    if ((m.k === 'padding' || m.k === 'frame') && bg && !(m.maxW === 'inf' || m.maxH === 'inf')) bg = null;
  }
  return bg;
}

function screenMeta(screen) {
  const nodes = screen.c || [];
  const titleMod = findMod(nodes, 'navigationTitle')[0];
  const modeMod = findMod(nodes, 'titleMode')[0];
  const vis = findMod(nodes, 'toolbarVisibility')[0];
  const toolbar = findMod(nodes, 'toolbar').flatMap(m => m.v || []);
  return {
    title: screen.p.title || (titleMod && titleMod.v) || '',
    mode: modeMod ? modeMod.v : 'large',
    hidden: vis && vis.v === 'hidden',
    backHidden: findMod(nodes, 'backHidden').length > 0,
    toolbar,
    search: findMod(nodes, 'searchable')[0],
  };
}

function buildToolbarItems(items, place) {
  const out = [];
  for (const it of items) {
    const p = it.t === 'toolbaritem' ? it.p.place : 'trailing';
    if (p !== place) continue;
    const children = it.t === 'toolbaritem' ? flat(it.c) : [it];
    for (const c of children) out.push(build(c, { axis: 'h', inToolbar: true }));
  }
  return out;
}

function buildNav(n, ctx) {
  const el = div('nav');
  el._H = el._V = true;
  const screens = n.c || [];
  const depth = screens.length - 1;
  const top = screens[depth];
  if (!top) return el;
  const meta = screenMeta(top);
  const scr = div('screen');
  if (navDepth[n.id] !== undefined && depth > navDepth[n.id]) scr.classList.add('pushing');
  navDepth[n.id] = depth;
  const body = flat(top.c);
  const isList = body.length === 1 && body[0].t === 'list' && (body[0].p.style || 'insetGrouped') !== 'plain' && !findMod(body, 'scrollBg').some(m => m.v === 'hidden');
  if (isList) scr.classList.add('grouped-bg');
  if (body.length === 1) { const bg = fillBackground(body[0]); if (bg) scr.style.background = bg; }

  if (!meta.hidden) {
    const nb = div('navbar');
    const bar = div('bar');
    const left = div('left'), right = div('right');
    if (depth > 0 && !meta.backHidden) {
      const back = div('back');
      back.appendChild(sym('chevron.left'));
      const prev = screenMeta(screens[depth - 1]).title;
      back.appendChild(document.createTextNode(prev && prev.length < 14 ? prev : T('Back')));
      back.addEventListener('click', () => send('tap', n.id + '~back'));
      left.appendChild(back);
    }
    for (const k of buildToolbarItems(meta.toolbar, 'leading')) left.appendChild(k);
    for (const k of buildToolbarItems(meta.toolbar, 'trailing')) right.appendChild(k);
    bar.appendChild(left);
    const principal = buildToolbarItems(meta.toolbar, 'principal');
    const center = div('center');
    if (principal.length) principal.forEach(p => center.appendChild(p));
    else if (meta.mode === 'inline' || !meta.title) center.textContent = meta.title;
    bar.appendChild(center);
    bar.appendChild(right);
    nb.appendChild(bar);
    if (meta.mode !== 'inline' && meta.title && !principal.length) {
      const large = div('large');
      large.textContent = meta.title;
      nb.appendChild(large);
    }
    if (meta.search) {
      const s = div('search');
      s.appendChild(sym('magnifyingglass'));
      const inp = document.createElement('input');
      inp.placeholder = meta.search.ph || 'Search';
      inp.value = meta.search.v || '';
      inp.dataset.fid = meta.search.id;
      inp.addEventListener('input', () => { remember(meta.search.id, inp.value); send('text', meta.search.id, inp.value); });
      s.appendChild(inp);
      nb.appendChild(s);
    }
    scr.appendChild(nb);
  }
  const bodyWrap = div('screen-body');
  const content = buildContent(top.c, { safeTop: !!meta.hidden, underLargeTitle: true });
  content.style.flex = '1 1 auto';
  bodyWrap.appendChild(content);
  scr.appendChild(bodyWrap);

  const bottomItems = buildToolbarItems(meta.toolbar, 'bottom');
  if (bottomItems.length) {
    const tb = div('tabbar');
    tb.style.height = '83px'; tb.style.justifyContent = 'space-around'; tb.style.alignItems = 'flex-start'; tb.style.paddingTop = '12px';
    bottomItems.forEach(b => tb.appendChild(b));
    scr.appendChild(tb);
  }
  el.appendChild(scr);
  return el;
}

function buildTabs(n, ctx) {
  const el = div('tabview');
  el._H = el._V = true;
  const tabs = flat(n.c).length ? (n.c || []) : [];
  const sel = Math.max(0, Math.min(n.p.sel || 0, tabs.length - 1));
  const content = div('tab-content');
  const current = tabs[sel];
  if (current) {
    const c = buildContent([current], { safeTop: current.t !== 'nav', safeBottom: false });
    c.style.flex = '1 1 auto';
    content.appendChild(c);
  }
  el.appendChild(content);
  if (n.p.style === 'page') {
    const dots = div('page-dots');
    tabs.forEach((t, i) => {
      const d = document.createElement('span');
      if (i === sel) d.className = 'sel';
      d.addEventListener('click', () => send('index', n.id, i));
      dots.appendChild(d);
    });
    el.appendChild(dots);
    let sx = null;
    content.addEventListener('pointerdown', e => { sx = e.clientX; });
    content.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (dx < -40 && sel < tabs.length - 1) send('index', n.id, sel + 1);
      if (dx > 40 && sel > 0) send('index', n.id, sel - 1);
    });
    return el;
  }
  const bar = div('tabbar');
  tabs.forEach((t, i) => {
    const item = div('ti' + (i === sel ? ' sel' : ''));
    const ti = mod(t, 'tabItem');
    if (ti) for (const c of flat(ti.v)) {
      if (c.t === 'label') {
        for (const part of c.c) for (const x of flat(part.c)) item.appendChild(build(x, { axis: 'v' }));
      } else item.appendChild(build(c, { axis: 'v' }));
    }
    const badge = mod(t, 'badge');
    if (badge && badge.v != null) { const b = div('tbadge'); b.textContent = badge.v; item.appendChild(b); }
    item.addEventListener('click', () => send('index', n.id, i));
    bar.appendChild(item);
  });
  el.appendChild(bar);
  return el;
}

// ------------------------------------------------------------------ modifiers

function wrap(inner) {
  const w = div('x');
  w.appendChild(inner);
  w._H = inner._H; w._V = inner._V; w._isa = inner._isa;
  if (inner._V) { inner.style.flex = '1 1 auto'; inner.style.minHeight = '0'; }
  if (inner._H) inner.style.alignSelf = 'stretch';
  return w;
}

function applyMods(el, n, ctx) {
  let cur = el;
  const transforms = [];
  for (const m of n.m || []) {
    switch (m.k) {
      case 'padding': {
        cur = wrap(cur);
        const v = m.v ?? 16;
        const [t, l, b, r] = m.edges || [true, true, true, true];
        cur.style.padding = `${t ? v : 0}px ${r ? v : 0}px ${b ? v : 0}px ${l ? v : 0}px`;
        break;
      }
      case 'paddingInsets': cur = wrap(cur); cur.style.padding = `${m.t}px ${m.r}px ${m.b}px ${m.l}px`; break;
      case 'frame': {
        cur = wrap(cur);
        const a = m.align || { h: 'center', v: 'center' };
        cur.style.alignItems = H_ALIGN[a.h] || 'center';
        cur.style.justifyContent = V_ALIGN[a.v] === 'baseline' ? 'center' : (V_ALIGN[a.v] || 'center');
        cur.style.textAlign = TEXT_ALIGN[a.h] || '';
        if (m.w != null) { cur.style.width = m.w + 'px'; cur._H = false; cur.style.flexShrink = '0'; }
        if (m.h != null) { cur.style.height = m.h + 'px'; cur._V = false; cur.style.flexShrink = '0'; }
        if (m.minW != null) cur.style.minWidth = m.minW + 'px';
        if (m.minH != null) cur.style.minHeight = m.minH + 'px';
        if (m.maxW === 'inf') cur._H = true;
        else if (m.maxW != null) { cur.style.maxWidth = m.maxW + 'px'; cur.style.width = '100%'; cur._H = true; }
        if (m.maxH === 'inf') cur._V = true;
        else if (m.maxH != null) { cur.style.maxHeight = m.maxH + 'px'; cur._V = true; }
        // a child that wants to grow fills the fixed frame
        const inner = cur.firstChild;
        if (inner && inner._H && (m.w != null || m.maxW != null)) inner.style.alignSelf = 'stretch';
        if (inner && inner._V && (m.h != null || m.maxH != null)) inner.style.flex = '1 1 auto';
        break;
      }
      case 'fg': if (m.v) { cur.style.color = m.v; cur.style.setProperty('--btn-fg', m.v); cur.style.setProperty('--icon-color', m.v); } break;
      case 'tint': if (m.v) { cur.style.setProperty('--tint', m.v); } break;
      case 'bg': {
        if (cur.style.background || cur.classList.contains('color') || cur.classList.contains('shape')) cur = wrap(cur);
        cur.style.background = m.v;
        if (m.shape) cur.style.borderRadius = m.shape === 'circle' ? '50%' : m.shape === 'capsule' ? '9999px' : (m.r ? m.r + 'px' : '0');
        break;
      }
      case 'bgView': case 'overlay': case 'safeAreaInset': {
        if (m.k === 'safeAreaInset') break;
        cur = wrap(cur);
        cur.style.position = 'relative';
        const layer = div('zstack');
        layer.style.position = 'absolute';
        layer.style.inset = '0';
        layer.style.pointerEvents = m.k === 'overlay' ? 'none' : 'auto';
        const a = m.align || { h: 'center', v: 'center' };
        layer.style.justifyItems = { leading: 'start', center: 'center', trailing: 'end' }[a.h];
        layer.style.alignItems = { top: 'start', center: 'center', bottom: 'end', baseline: 'center' }[a.v];
        for (const c of flat(m.v)) {
          const k = build(c, { axis: 'z' });
          if (k._H) k.style.justifySelf = 'stretch';
          if (k._V) k.style.alignSelf = 'stretch';
          k.style.pointerEvents = 'auto';
          layer.appendChild(k);
        }
        const content = cur.firstChild;
        content.style.position = content.style.position || 'relative';
        if (m.k === 'bgView') { layer.style.zIndex = '0'; content.style.zIndex = '1'; cur.insertBefore(layer, content); }
        else { layer.style.zIndex = '2'; cur.appendChild(layer); }
        break;
      }
      case 'clip': {
        cur.style.overflow = 'hidden';
        cur.style.borderRadius = m.shape === 'circle' || m.shape === 'ellipse' ? '50%' : m.shape === 'capsule' ? '9999px' : (m.r ? m.r + 'px' : '0');
        break;
      }
      case 'opacity': cur.style.opacity = String((parseFloat(cur.style.opacity || 1)) * m.v); break;
      case 'shadow': cur.style.filter = `${cur.style.filter || ''} drop-shadow(${m.x}px ${m.y}px ${m.r}px ${m.c})`.trim(); break;
      case 'filter': cur.style.filter = `${cur.style.filter || ''} ${m.v}`.trim(); break;
      case 'border': cur.style.boxShadow = `${cur.style.boxShadow ? cur.style.boxShadow + ', ' : ''}inset 0 0 0 ${m.w}px ${m.v}`; break;
      case 'rotate': transforms.push(`rotate(${m.v}deg)`); cur.style.transform = transforms.join(' '); break;
      case 'rotate3d': transforms.push(`perspective(600px) rotate3d(${m.x},${m.y},${m.z},${m.v}deg)`); cur.style.transform = transforms.join(' '); break;
      case 'scale': transforms.push(`scale(${m.x},${m.y})`); cur.style.transform = transforms.join(' '); break;
      case 'offset': transforms.push(`translate(${m.x}px,${m.y}px)`); cur.style.transform = transforms.join(' '); break;
      case 'position': cur.style.position = 'absolute'; cur.style.left = m.x + 'px'; cur.style.top = m.y + 'px'; transforms.push('translate(-50%,-50%)'); cur.style.transform = transforms.join(' '); break;
      case 'font': if (m.v) {
        cur.style.fontSize = m.v.size + 'px';
        cur.style.fontWeight = m.v.weight;
        if (m.v.italic) cur.style.fontStyle = 'italic';
        if (m.v.family) cur.style.fontFamily = `"${m.v.family}", Inter, sans-serif`;
        else if (FONT_FAMILY[m.v.design]) cur.style.fontFamily = FONT_FAMILY[m.v.design];
        cur.style.lineHeight = m.v.size >= 28 ? '1.2' : '';
      } break;
      case 'fontWeight': if (m.v) cur.style.fontWeight = m.v; break;
      case 'italic': cur.style.fontStyle = m.v ? 'italic' : 'normal'; break;
      case 'fontDesign': if (FONT_FAMILY[m.v]) cur.style.fontFamily = FONT_FAMILY[m.v]; break;
      case 'decoration': cur.style.textDecoration = m.v; break;
      case 'kerning': cur.style.letterSpacing = m.v + 'px'; break;
      case 'textAlign': cur.style.textAlign = m.v; break;
      case 'lineSpacing': cur.style.lineHeight = `calc(1.29em + ${m.v}px)`; break;
      case 'textCase': cur.style.textTransform = m.v; break;
      case 'lineLimit': if (m.v) {
        const t = cur.classList.contains('text') ? cur : cur.querySelector('.text');
        if (t) { t.style.display = '-webkit-box'; t.style.webkitBoxOrient = 'vertical'; t.style.webkitLineClamp = String(m.v); t.style.overflow = 'hidden'; }
      } break;
      case 'hidden': cur.style.visibility = 'hidden'; break;
      case 'disabled': cur.style.pointerEvents = 'none'; break;
      case 'hitTesting': if (!m.v) cur.style.pointerEvents = 'none'; break;
      case 'tap': gestures(cur).taps.push({ count: m.count || 1, fire: () => send('tap', m.id) }); break;
      case 'longpress': gestures(cur).longs.push({ dur: m.dur ?? 0.5, dist: m.dist ?? 10, fire: () => send('tap', m.id), pressing: m.pressing }); break;
      case 'gesture': {
        if (m.prio === 'off') break;
        const g = gestures(cur);
        for (const s of m.g || []) {
          const ev = v => send('gesture', s.id, v);
          if (s.kind === 'tap') g.taps.push({ count: s.count || 1, fire: p => ev({ ph: 'ended', ...(p || {}) }), loc: !!s.loc });
          else if (s.kind === 'longpress') g.longs.push({ dur: s.dur ?? 0.5, dist: s.dist ?? 10, fire: () => ev({ ph: 'ended', fin: true }), gid: s.id });
          else g.parts.push({ ...s, ev });
        }
        break;
      }
      case 'contentShape': break;
      case 'contextMenu': {
        const items = m.v;
        const target = cur;
        cur.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); showPopMenu(target, menuItems(items)); });
        break;
      }
      case 'ignoresSafeArea': cur.classList.add('isa'); cur._isa = true; cur.style.position = 'fixed'; cur.style.inset = '0'; cur.style.zIndex = '0'; break;
      case 'keyboard': {
        const inp = cur.matches('input,textarea') ? cur : cur.querySelector('input,textarea');
        if (inp) inp.inputMode = m.v;
        break;
      }
      case 'onSubmit': cur.dataset.submit = m.id; break;
      case 'aspect': {
        const img = cur.matches('img') ? cur : null;
        if (img) img.style.objectFit = m.mode === 'fit' ? 'contain' : 'cover';
        if (m.r) cur.style.aspectRatio = String(m.r);
        else if (img && img.naturalWidth) cur.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        else if (img) img.addEventListener('load', () => { img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; });
        if (m.mode === 'fill') { cur.style.overflow = 'hidden'; }
        break;
      }
      case 'zIndex': cur.style.zIndex = String(m.v); cur.style.position = cur.style.position || 'relative'; break;
      case 'imageScale': cur.querySelectorAll('.sym').forEach(s => s.classList.add(m.v)); if (cur.classList.contains('sym')) cur.classList.add(m.v); break;
      case 'scheme': break;
      case 'sheet': overlays.push({ type: 'sheet', m, full: !!mod(n, 'fullScreen') }); break;
      case 'alert': overlays.push({ type: 'alert', m }); break;
      default: break;
    }
  }
  return cur;
}

// ------------------------------------------------------------------ gestures (the mouse is a finger)
// click = tap (counts resolve after a short pause), hold = long press, drag = DragGesture,
// Alt+drag = pinch/rotate around the view's centre (Option in Apple's Simulator), Ctrl+wheel = pinch.

const INTERACTIVE = '.button,.navlink,input,textarea,select,.switch,.slider,.stepctl,.segmented,.picker-value,.cell.tappable';

function gestures(el) {
  if (el._g) return el._g;
  const g = el._g = { taps: [], longs: [], parts: [] };
  const scale = () => screenEl.getBoundingClientRect().width / SCREEN_W;
  const local = e => { const r = el.getBoundingClientRect(), s = scale(); return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
  let seq = null;
  let tapCount = 0, tapTimer = null;
  let suppressClick = false;

  const kinds = () => new Set([...g.parts.map(p => p.kind), ...(g.taps.length ? ['tap'] : []), ...(g.longs.length ? ['longpress'] : [])]);
  // a Button inside the view keeps its own taps; inner gesture views win over outer ones
  const fromControl = e => { const c = e.target.closest && e.target.closest(INTERACTIVE); return c && c !== el && el.contains(c); };

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || fromControl(e)) return;
    const claimed = e._claimed || (e._claimed = new Set());
    const mine = [...kinds()].filter(k => !claimed.has(k) || g.parts.some(p => p.kind === k && p.prio === 's'));
    if (!mine.length) return;
    mine.forEach(k => claimed.add(k));
    const p = local(e);
    seq = { id: e.pointerId, cx: e.clientX, cy: e.clientY, start: p, last: p, lastT: performance.now(), vx: 0, vy: 0, mode: null, long: false, kinds: new Set(mine), alt: e.altKey };
    for (const l of g.longs) if (l.pressing) send('bool', l.pressing, true);
    const longs = g.longs.filter(() => seq.kinds.has('longpress'));
    if (longs.length) {
      const dur = Math.min(...longs.map(l => l.dur));
      seq.timer = setTimeout(() => {
        if (!seq || seq.mode) return;
        seq.long = true;
        for (const l of longs) l.fire();
      }, dur * 1000);
    }
  });

  el.addEventListener('pointermove', e => {
    if (!seq || e.pointerId !== seq.id) return;
    const p = local(e);
    const now = performance.now();
    const dt = Math.max(1, now - seq.lastT) / 1000;
    seq.vx = (p.x - seq.last.x) / dt; seq.vy = (p.y - seq.last.y) / dt;
    seq.last = p; seq.lastT = now;
    const dist = Math.hypot(p.x - seq.start.x, p.y - seq.start.y);
    if (!seq.mode) {
      const twoFinger = (e.altKey || seq.alt) && g.parts.some(q => q.kind === 'magnify' || q.kind === 'rotate');
      const drag = g.parts.find(q => q.kind === 'drag' && dist >= (q.min ?? 10));
      if (twoFinger && dist > 2) seq.mode = 'pinch';
      else if (drag && !e.altKey) seq.mode = 'drag';
      else if (dist > 10 && seq.timer) { clearTimeout(seq.timer); seq.timer = null; }
      if (seq.mode) {
        clearTimeout(seq.timer); seq.timer = null;
        try { el.setPointerCapture(e.pointerId); } catch {}
        if (seq.mode === 'pinch') {
          const r = el.getBoundingClientRect();
          seq.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          seq.d0 = Math.max(20, Math.hypot(seq.cx - seq.center.x, seq.cy - seq.center.y));
          seq.a0 = Math.atan2(seq.cy - seq.center.y, seq.cx - seq.center.x);
        }
      }
    }
    if (seq.mode === 'drag') {
      for (const q of g.parts) if (q.kind === 'drag') q.ev({ ph: 'changed', x: p.x, y: p.y, sx: seq.start.x, sy: seq.start.y, vx: seq.vx, vy: seq.vy });
    } else if (seq.mode === 'pinch') {
      const d = Math.hypot(e.clientX - seq.center.x, e.clientY - seq.center.y);
      seq.mag = d / seq.d0;
      seq.rot = (Math.atan2(e.clientY - seq.center.y, e.clientX - seq.center.x) - seq.a0) * 180 / Math.PI;
      showTouchDots(e.clientX, e.clientY, seq.center);
      for (const q of g.parts) {
        if (q.kind === 'magnify') q.ev({ ph: 'changed', mag: seq.mag, sx: seq.start.x, sy: seq.start.y, x: p.x, y: p.y });
        if (q.kind === 'rotate') q.ev({ ph: 'changed', rot: seq.rot, sx: seq.start.x, sy: seq.start.y });
      }
    }
  });

  const finish = (e, cancelled) => {
    if (!seq || e.pointerId !== seq.id) return;
    clearTimeout(seq.timer);
    for (const l of g.longs) if (l.pressing) send('bool', l.pressing, false);
    const p = seq.last;
    if (seq.mode === 'drag') {
      for (const q of g.parts) if (q.kind === 'drag') q.ev({ ph: cancelled ? 'cancelled' : 'ended', x: p.x, y: p.y, sx: seq.start.x, sy: seq.start.y, vx: seq.vx, vy: seq.vy });
    } else if (seq.mode === 'pinch') {
      hideTouchDots();
      for (const q of g.parts) {
        if (q.kind === 'magnify') q.ev({ ph: 'ended', mag: seq.mag ?? 1 });
        if (q.kind === 'rotate') q.ev({ ph: 'ended', rot: seq.rot ?? 0 });
      }
    }
    suppressClick = !!(seq.mode || seq.long);
    seq = null;
  };
  el.addEventListener('pointerup', e => finish(e, false));
  el.addEventListener('pointercancel', e => finish(e, true));

  el.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); return; }
    if (!g.taps.length || fromControl(e) || e._tapped) return;
    e._tapped = true;
    e.stopPropagation();
    const where = local(e);
    const max = Math.max(...g.taps.map(t => t.count));
    const fire = n => {
      const exact = g.taps.find(t => t.count === n) || g.taps.filter(t => t.count < n).sort((a, b) => b.count - a.count)[0];
      if (exact) exact.fire(exact.loc ? { x: where.x, y: where.y, sx: where.x, sy: where.y } : undefined);
    };
    if (max === 1) { fire(1); return; }
    tapCount++;
    clearTimeout(tapTimer);
    if (tapCount >= max) { const n = tapCount; tapCount = 0; fire(n); return; }
    tapTimer = setTimeout(() => { const n = tapCount; tapCount = 0; fire(n); }, 300);
  });

  // right-click is a quick long press; Ctrl+wheel (or a touchpad pinch) magnifies
  el.addEventListener('contextmenu', e => {
    if (!g.longs.length) return;
    e.preventDefault(); e.stopPropagation();
    for (const l of g.longs) l.fire();
  });
  let wheel = null;
  el.addEventListener('wheel', e => {
    if (!e.ctrlKey || !g.parts.some(q => q.kind === 'magnify')) return;
    e.preventDefault(); e.stopPropagation();
    wheel = wheel || { mag: 1 };
    wheel.mag *= Math.exp(-e.deltaY / 300);
    for (const q of g.parts) if (q.kind === 'magnify') q.ev({ ph: 'changed', mag: wheel.mag });
    clearTimeout(wheel.t);
    wheel.t = setTimeout(() => { for (const q of g.parts) if (q.kind === 'magnify') q.ev({ ph: 'ended', mag: wheel.mag }); wheel = null; }, 250);
  }, { passive: false });
  return g;
}

let touchDots = null;
function showTouchDots(x, y, c) {
  const sr = screenEl.getBoundingClientRect(), s = sr.width / SCREEN_W;
  if (!touchDots) { touchDots = [div('touch-dot'), div('touch-dot')]; touchDots.forEach(d => screenEl.appendChild(d)); }
  const pts = [[x, y], [2 * c.x - x, 2 * c.y - y]];
  touchDots.forEach((d, i) => { d.style.left = (pts[i][0] - sr.left) / s + 'px'; d.style.top = (pts[i][1] - sr.top) / s + 'px'; });
}
function hideTouchDots() { if (touchDots) { touchDots.forEach(d => d.remove()); touchDots = null; } }

// ------------------------------------------------------------------ overlays (sheets, alerts, menus)

function renderOverlays() {
  overlayRoot.innerHTML = '';
  let sheetOpen = false;
  for (const o of overlays) {
    if (o.type === 'sheet') {
      sheetOpen = sheetOpen || !o.full;
      const dim = div('dim');
      dim.addEventListener('click', () => send('tap', o.m.dismiss));
      const card = div('sheet-card' + (o.full ? ' full' : ''));
      if (!o.full) card.appendChild(div('grabber'));
      const root = div('root');
      const content = buildContent(o.m.v, { safeTop: !!o.full, padTop: o.full ? 'var(--safe-top)' : 20 });
      content.style.flex = '1 1 auto';
      root.appendChild(content);
      card.appendChild(root);
      // drag the grabber down to dismiss
      let sy = null;
      card.addEventListener('pointerdown', e => { if (e.offsetY < 40) sy = e.clientY; });
      card.addEventListener('pointerup', e => { if (sy != null && e.clientY - sy > 80) send('tap', o.m.dismiss); sy = null; });
      overlayRoot.append(dim, card);
    }
  }
  for (const o of overlays) {
    if (o.type !== 'alert') continue;
    const m = o.m;
    const dim = div('dim');
    overlayRoot.appendChild(dim);
    const buttons = flat(m.buttons);
    if (m.style === 'sheet') {
      const sheet = div('asheet');
      const g = div('group1');
      if (m.title || m.msg) { const t = div('atitle'); t.textContent = m.title + (m.msg ? '\n' + m.msg : ''); g.appendChild(t); }
      const cancelG = div('cancelg');
      for (const b of buttons) {
        const opt = div('opt' + (b.p.role === 'destructive' ? ' destructive' : ''));
        opt.textContent = textOf(b);
        opt.addEventListener('click', () => send('tap', b.id));
        (b.p.role === 'cancel' ? cancelG : g).appendChild(opt);
      }
      sheet.appendChild(g);
      if (cancelG.childNodes.length) sheet.appendChild(cancelG);
      dim.addEventListener('click', () => { const c = buttons.find(b => b.p.role === 'cancel'); if (c) send('tap', c.id); });
      overlayRoot.appendChild(sheet);
      continue;
    }
    const box = div('alert');
    const h = div('ah');
    const t = div('at'); t.textContent = m.title; h.appendChild(t);
    if (m.msg) { const mm = div('am'); mm.textContent = m.msg; h.appendChild(mm); }
    box.appendChild(h);
    const ab = div('ab' + (buttons.length > 2 ? ' col' : ''));
    const ordered = buttons.length === 2 ? [...buttons].sort((a, b) => (b.p.role === 'cancel') - (a.p.role === 'cancel')) : buttons;
    for (const b of ordered) {
      if (b.t === 'textfield') continue;
      const btn = div(b.p.role || '');
      btn.textContent = textOf(b);
      btn.addEventListener('click', () => send('tap', b.id));
      ab.appendChild(btn);
    }
    box.appendChild(ab);
    overlayRoot.appendChild(box);
  }
  screenEl.classList.toggle('sheet-open', sheetOpen);
}

function showPopMenu(anchor, items) {
  closePopMenu();
  const menu = div('popmenu');
  for (const it of items) {
    const mi = div('mi' + (it.destructive ? ' destructive' : ''));
    if (items.some(i => i.checked !== undefined)) {
      const c = div('check');
      if (it.checked) c.appendChild(sym('checkmark'));
      mi.appendChild(c);
    }
    mi.appendChild(document.createTextNode(it.label || ''));
    if (it.icon) mi.appendChild(sym(it.icon));
    mi.addEventListener('click', e => { e.stopPropagation(); closePopMenu(); if (it.act) it.act(); });
    menu.appendChild(mi);
  }
  overlayRoot.appendChild(menu);
  const sr = screenEl.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  const scale = sr.width / SCREEN_W;
  let left = (ar.right - sr.left) / scale - 230;
  let top = (ar.bottom - sr.top) / scale + 6;
  left = Math.max(10, Math.min(left, SCREEN_W - 240));
  if (top + items.length * 45 > 800) top = Math.max(60, (ar.top - sr.top) / scale - items.length * 45 - 6);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  openPopup = menu;
  setTimeout(() => document.addEventListener('click', closePopMenu, { once: true }), 0);
}
function closePopMenu() { if (openPopup) { openPopup.remove(); openPopup = null; } }

// ------------------------------------------------------------------ frame rendering

function render() {
  if (!tree) return;
  // remember focus, caret and scroll positions so re-renders feel seamless
  const ae = document.activeElement;
  let focus = null;
  if (ae && ae.dataset && ae.dataset.fid) focus = { id: ae.dataset.fid, s: ae.selectionStart, e: ae.selectionEnd, value: ae.value };
  const scrolls = {};
  document.querySelectorAll('[data-sid]').forEach(el => { if (el.scrollTop || el.scrollLeft) scrolls[el.dataset.sid] = [el.scrollTop, el.scrollLeft]; });

  overlays = [];
  const schemeMod = findMod(tree, 'scheme')[0];
  const wanted = schemeMod && schemeMod.v ? schemeMod.v : (forcedScheme || theme);
  setScheme(wanted);

  const content = buildContent(tree, { safeTop: true });
  content.style.flex = '1 1 auto';
  const root = div('root');
  root.appendChild(content);
  appRoot.replaceChildren(root);
  closePopMenu();
  renderOverlays();

  document.querySelectorAll('[data-sid]').forEach(el => {
    const s = scrolls[el.dataset.sid];
    if (s) { el.scrollTop = s[0]; el.scrollLeft = s[1]; }
  });
  if (focus) {
    const el = document.querySelector(`[data-fid="${CSS.escape(focus.id)}"]`);
    if (el) {
      // a frame echoing something we typed earlier is stale: keep the newer text in the field.
      // Anything else came from the program itself (e.g. clearing the field) and wins.
      const recent = lastSentText[focus.id] || [];
      const newest = recent[recent.length - 1];
      if (el.value !== focus.value && focus.value === newest && recent.includes(el.value)) el.value = focus.value;
      el.focus();
      try { if (focus.s != null) el.setSelectionRange(focus.s, focus.e); } catch {}
    }
  }
  updateStatusBarTone();
}

function setScheme(s) {
  if (theme === s && screenEl.classList.contains(s)) return;
  theme = s;
  screenEl.classList.remove('light', 'dark');
  screenEl.classList.add(s);
}

function updateStatusBarTone() {
  // light status bar text over dark full-bleed backgrounds
  const isa = appRoot.querySelector('.isa');
  let dark = theme === 'dark';
  if (isa) {
    const bg = getComputedStyle(isa).backgroundColor;
    const m = bg.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) {
      const [r, g, b] = m.map(Number);
      dark = (0.299 * r + 0.587 * g + 0.114 * b) < 140;
    }
  }
  $('#statusbar').classList.toggle('on-dark', dark && !screenEl.classList.contains('show-home'));
  $('#statusbar').style.color = dark ? '#fff' : '';
}

// ------------------------------------------------------------------ home screen & device chrome

function renderHome() {
  const now = new Date();
  const pl = TR[LANG.split('-')[0]];
  const days = pl ? pl.days : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = pl ? pl.months : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const home = $('#home-screen');
  home.innerHTML = '';
  const w = div('widget');
  w.innerHTML = `<div class="wday">${days[now.getDay()]}</div><div class="wdate">${now.getDate()}</div><div class="wtext">${months[now.getMonth()]} · ${T('Built with SwiftCode').replace('SwiftCode', 'WinSwift Studio')}</div>`;
  home.appendChild(w);
  const icons = div('icons');
  const mine = div('app-icon mine');
  const tile = div('tile');
  tile.textContent = (appName || 'A').trim()[0].toUpperCase();
  const lab = document.createElement('span');
  lab.textContent = appName;
  mine.append(tile, lab);
  mine.addEventListener('click', () => { if (!running) window.sim.run(); else showApp(); });
  icons.appendChild(mine);
  // sponsor: ProZlecenie opens its website in the browser
  const pz = div('app-icon');
  const pzTile = div('tile');
  pzTile.style.background = '#152C4F url("img/prozlecenie.png") center / cover';
  const pzLab = document.createElement('span');
  pzLab.textContent = 'ProZlecenie';
  pz.append(pzTile, pzLab);
  pz.title = 'prozlecenie.pl';
  pz.addEventListener('click', () => window.sim.openLink('https://prozlecenie.pl/?utm_source=winswift-studio&utm_medium=simulator'));
  icons.appendChild(pz);
  const cs = div('app-icon');
  const csTile = div('tile');
  csTile.style.background = '#0b1220 url("img/cyberscope.png") center / cover';
  const csLab = document.createElement('span');
  csLab.textContent = 'CyberScope';
  cs.append(csTile, csLab);
  cs.title = 'cyberscope.pl';
  cs.addEventListener('click', () => window.sim.openLink('https://cyberscope.pl/?utm_source=winswift-studio&utm_medium=simulator'));
  icons.appendChild(cs);
  const sys = [['Settings', 'gear', '#8e8e93'], ['Safari', 'safari', '#0a84ff'], ['Photos', 'photo', '#ff9f0a'], ['Camera', 'camera', '#3a3a3c'], ['Notes', 'note.text', '#ffcc00'], ['Maps', 'map', '#34c759'], ['Weather', 'cloud.sun', '#32ade6']];
  for (const [name, icon, color] of sys) {
    const a = div('app-icon');
    const t = div('tile');
    t.style.background = color;
    const i = document.createElement('i');
    i.style.setProperty('--icon', `url("${ICON_BASE}/${sfSymbolToLucide(icon, ICONS)}.svg")`);
    t.appendChild(i);
    const l = document.createElement('span'); l.textContent = T(name);
    a.append(t, l);
    if (name === 'Settings') a.addEventListener('click', () => openSettings());
    icons.appendChild(a);
  }
  home.appendChild(icons);
  const dock = div('dock');
  for (const [icon, color] of [['phone', '#34c759'], ['message', '#34c759'], ['envelope', '#0a84ff'], ['music.note', '#ff2d55']]) {
    const a = div('app-icon');
    const t = div('tile'); t.style.background = color;
    const i = document.createElement('i');
    i.style.setProperty('--icon', `url("${ICON_BASE}/${sfSymbolToLucide(icon, ICONS)}.svg")`);
    t.appendChild(i); a.appendChild(t); dock.appendChild(a);
  }
  home.appendChild(dock);
}

function showHome() {
  if (!screenEl.classList.contains('show-home') && running) window.sim.scene('background');
  screenEl.classList.add('show-home'); screenEl.classList.remove('show-settings'); updateStatusBarTone();
}
function showApp() {
  if (screenEl.classList.contains('show-home') && running) window.sim.scene('active');
  screenEl.classList.remove('show-home', 'show-settings'); updateStatusBarTone();
}

// ------------------------------------------------------------------ Settings app

let settingsStack = [];
function openSettings(page) {
  settingsStack = page ? ['root', page] : ['root'];
  screenEl.classList.add('show-settings');
  renderSettings();
}
function settingsPush(p) { settingsStack.push(p); renderSettings(); }
function settingsPop() { settingsStack.pop(); if (!settingsStack.length) { screenEl.classList.remove('show-settings'); return; } renderSettings(); }

async function renderSettings() {
  DEVICE = await window.sim.device();
  const page = settingsStack[settingsStack.length - 1];
  const host = $('#settings-app');
  host.innerHTML = '';
  const titles = { root: T('Settings'), general: T('General'), language: T('Language & Region'), langlist: T('iPhone Language'), privacy: T('Privacy & Security'), location: T('Location Services'), about: T('About') };
  const nav = div('set-nav');
  const bar = div('bar');
  if (settingsStack.length > 1) {
    const back = div('back');
    back.append(sym('chevron.left'), document.createTextNode(titles[settingsStack[settingsStack.length - 2]] || T('Back')));
    back.onclick = settingsPop;
    bar.appendChild(back);
  }
  const big = page === 'root';
  if (!big && !page.startsWith('app:')) { const c = div('center'); c.textContent = titles[page] || ''; bar.appendChild(c); }
  if (page.startsWith('app:')) { const c = div('center'); c.textContent = page.slice(4); bar.appendChild(c); }
  nav.appendChild(bar);
  if (big) { const l = div('large'); l.textContent = titles.root; nav.appendChild(l); }
  const body = div('set-body');
  const section = (rows, h, f) => {
    const s = div('set-sec');
    if (h) { const x = div('h'); x.textContent = h; s.appendChild(x); }
    const cells = div('set-cells');
    for (const r of rows) {
      const c = div('set-cell' + (r.icon ? ' ico' : ''));
      if (r.icon) { const t = div('tile'); t.style.background = r.color; const i = document.createElement('i'); i.style.setProperty('--icon', `url("${ICON_BASE}/${sfSymbolToLucide(r.icon, ICONS)}.svg")`); t.appendChild(i); c.appendChild(t); }
      const t = div('t'); t.textContent = r.title; c.appendChild(t);
      if (r.value) { const v = div('v'); v.textContent = r.value; c.appendChild(v); }
      if (r.check) { const k = sym('checkmark', 'check'); c.appendChild(k); }
      if (r.go) c.appendChild(sym('chevron.right', 'chev'));
      if (r.act) c.onclick = r.act;
      cells.appendChild(c);
    }
    s.appendChild(cells);
    if (f) { const x = div('f'); x.textContent = f; s.appendChild(x); }
    body.appendChild(s);
  };
  const langName = l => (LANG_NAMES[l] || [l])[0];
  if (page === 'root') {
    section([
      { title: T('General'), icon: 'gear', color: '#8e8e93', go: true, act: () => settingsPush('general') },
      { title: T('Privacy & Security'), icon: 'hand.raised.fill', color: '#0a84ff', go: true, act: () => settingsPush('privacy') },
    ]);
  } else if (page === 'general') {
    section([{ title: T('About'), go: true, act: () => settingsPush('about') }]);
    section([{ title: T('Language & Region'), go: true, act: () => settingsPush('language') }]);
  } else if (page === 'about') {
    section([{ title: T('Name'), value: 'iPhone' }, { title: T('Software Version'), value: '18.0' }, { title: T('Model'), value: MODEL_NAME }]);
  } else if (page === 'language') {
    section([{ title: T('iPhone Language'), value: langName(LANG), go: true, act: () => settingsPush('langlist') }], T('Preferred Languages'), T('langFooter'));
  } else if (page === 'langlist') {
    section((DEVICE.languages || []).map(([id, name]) => ({
      title: name, check: id === LANG,
      act: () => { if (id !== LANG) confirmLanguage(id, name); },
    })));
  } else if (page === 'privacy') {
    section([{ title: T('Location Services'), icon: 'location.fill', color: '#0a84ff', go: true, act: () => settingsPush('location') }]);
  } else if (page === 'location') {
    const apps = new Set([...Object.keys(DEVICE.perms || {}), appName]);
    const label = v => v === 'whenInUse' ? T('While Using the App') : v === 'always' ? 'Always' : v === 'denied' ? T('Never') : T('Ask Next Time');
    section([...apps].map(a => ({ title: a, value: label(DEVICE.perms?.[a]?.location), go: true, act: () => settingsPush('app:' + a) })));
  } else if (page.startsWith('app:')) {
    const a = page.slice(4);
    const cur = DEVICE.perms?.[a]?.location;
    const set = v => {
      if (v === 'ask') window.sim.resetPermissions(a);
      else window.sim.permissionResult({ rid: '', kind: 'location', v, app: a });
      setTimeout(renderSettings, 100);
    };
    section([
      { title: T('Never'), check: cur === 'denied', act: () => set('denied') },
      { title: T('Ask Next Time'), check: !cur, act: () => set('ask') },
      { title: T('While Using the App'), check: cur === 'whenInUse' || cur === 'always', act: () => set('whenInUse') },
    ], T('Location Services'));
  }
  host.append(nav, body);
}

function confirmLanguage(id, name) {
  const root = $('#system-root');
  const dim = div('dim');
  const sheet = div('asheet');
  const g = div('group1');
  const opt = div('opt');
  opt.textContent = T('changeTo', name);
  opt.onclick = () => { close(); window.sim.setLanguage(id); };
  g.appendChild(opt);
  const cg = div('cancelg');
  const c = div('opt'); c.textContent = T('Cancel'); c.onclick = () => close();
  cg.appendChild(c);
  sheet.append(g, cg);
  const close = () => { dim.remove(); sheet.remove(); };
  dim.onclick = close;
  root.append(dim, sheet);
}

// ------------------------------------------------------------------ system prompts

function showPermission(rq) {
  const root = $('#system-root');
  const dim = div('dim');
  const box = div('alert sys');
  const h = div('ah');
  const t = div('at'); t.textContent = T('allowLoc', rq.app); h.appendChild(t);
  const m = div('am'); m.textContent = rq.message || ''; h.appendChild(m);
  const map = div('map'); const pr = div('precise'); pr.textContent = T('Precise'); map.appendChild(pr); h.appendChild(map);
  box.appendChild(h);
  const ab = div('ab col');
  const answer = v => { dim.remove(); box.remove(); window.sim.permissionResult({ rid: rq.rid, kind: rq.kind, v, app: rq.app }); };
  for (const [label, v] of [[T('Allow Once'), 'once'], [T('Allow While Using App'), 'whenInUse'], [T("Don’t Allow"), 'denied']]) {
    const b = div(''); b.textContent = label; b.onclick = () => answer(v); ab.appendChild(b);
  }
  box.appendChild(ab);
  root.append(dim, box);
}

function showCustomLocation(cur) {
  const root = $('#system-root');
  const dim = div('dim');
  const d = div('loc-dialog');
  d.innerHTML = `<h4>${T('Custom Location')}</h4><label>${T('Latitude')}<input id="cl-lat"></label><label>${T('Longitude')}<input id="cl-lon"></label><div class="row"><div id="cl-cancel">${T('Cancel')}</div><div id="cl-ok">${T('OK')}</div></div>`;
  root.append(dim, d);
  d.querySelector('#cl-lat').value = cur?.lat ?? '';
  d.querySelector('#cl-lon').value = cur?.lon ?? '';
  const close = () => { dim.remove(); d.remove(); };
  d.querySelector('#cl-cancel').onclick = close;
  d.querySelector('#cl-ok').onclick = () => {
    const lat = parseFloat(d.querySelector('#cl-lat').value.replace(',', '.')), lon = parseFloat(d.querySelector('#cl-lon').value.replace(',', '.'));
    if (isFinite(lat) && isFinite(lon)) { window.sim.setLocation({ lat, lon }); close(); toast(`${lat.toFixed(5)}, ${lon.toFixed(5)}`); }
  };
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fitDevice() {
  const stage = $('#stage');
  if (!stage.clientHeight || !stage.clientWidth) return;
  const { w, h } = deviceSize();
  const s = Math.min((stage.clientHeight - 28) / h, (stage.clientWidth - 28) / w);
  // zoom (unlike transform) also shrinks the layout box, so the device stays centred
  $('#device').style.zoom = String(Math.max(0.25, s));
}
new ResizeObserver(fitDevice).observe($('#stage'));

async function screenshot() {
  const r = screenEl.getBoundingClientRect();
  const file = await window.sim.screenshot({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
  if (file) toast('Screenshot saved to Desktop');
}

$('#sim-close').onclick = () => window.sim.close();
$('#sim-min').onclick = () => window.sim.minimize();
$('#sim-home').onclick = () => { showHome(); renderHome(); };
$('#home-btn').onclick = () => $('#sim-home').click();
$('#sim-shot').onclick = screenshot;
$('#sim-theme').onclick = toggleAppearance;
$('#sim-shake').onclick = () => window.sim.shake();
$('#sim-menu').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); window.sim.menu(r.left, r.bottom + 2); };
$('#chrome').addEventListener('contextmenu', e => { e.preventDefault(); window.sim.menu(e.clientX, e.clientY); });
function shakeDevice() {
  const d = $('#device');
  d.classList.remove('shaking'); void d.offsetWidth; d.classList.add('shaking');
}
function toggleAppearance() {
  forcedScheme = (forcedScheme || theme) === 'dark' ? 'light' : 'dark';
  send('scheme', '', forcedScheme);
  setScheme(forcedScheme);
  render();
  toast(forcedScheme === 'dark' ? 'Dark Appearance' : 'Light Appearance');
}
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyH') { e.preventDefault(); $('#sim-home').click(); }
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') { e.preventDefault(); toggleAppearance(); }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyS') { e.preventDefault(); screenshot(); }
  // ⌃⌘Z in Apple's Simulator
  if (e.ctrlKey && e.altKey && e.code === 'KeyZ') { e.preventDefault(); window.sim.shake(); }
});
window.addEventListener('resize', fitDevice);
document.addEventListener('click', e => {
  // tapping outside a swiped cell closes it
  if (!e.target.closest('.cell')) document.querySelectorAll('.cell.swiped').forEach(c => c.classList.remove('swiped'));
});

// ------------------------------------------------------------------ wiring

// the program omits empty fields; give every node p/c/m so the builders can rely on them
function normalize(nodes) {
  if (!Array.isArray(nodes)) return nodes;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    n.p = n.p || {};
    n.c = normalize(n.c || []);
    n.m = n.m || [];
    for (const k of ['header', 'footer', 'items', 'label']) if (Array.isArray(n.p[k])) normalize(n.p[k]);
    for (const m of n.m) for (const k of ['v', 'buttons']) if (Array.isArray(m[k]) && m[k].length && typeof m[k][0] === 'object' && m[k][0] && 't' in m[k][0]) normalize(m[k]);
  }
  return nodes;
}

window.sim.onFrame(json => {
  try { tree = normalize(JSON.parse(json)); } catch (e) { console.error('bad frame', e); return; }
  // the first frame of a launch brings the app to the front; later ones don't undo going Home
  if (screenEl.classList.contains('launching')) { screenEl.classList.remove('launching'); showApp(); }
  render();
});

window.sim.onPermission(showPermission);
window.sim.onShook(shakeDevice);
window.sim.onHome(() => { showHome(); renderHome(); });
window.sim.onToggleAppearance(toggleAppearance);
window.sim.onCustomLocation(showCustomLocation);
window.sim.onScreenshot(screenshot);
window.sim.onOpenSettings(a => openSettings('app:' + a));
window.sim.onEndEditing(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
window.sim.onLocationInUse(on => screenEl.classList.toggle('loc-on', !!on));
window.sim.onLanguage(l => {
  LANG = l;
  renderHome();
  if (screenEl.classList.contains('show-settings')) renderSettings();
  toast((LANG_NAMES[l] || [l])[0]);
});

window.sim.onState(st => {
  if (st.app) appName = st.app;
  if (st.language) LANG = st.language;
  if (st.state === 'launching') {
    running = true;
    tree = null;
    navDepth = {};
    lastSentText = {};
    appRoot.replaceChildren();
    overlayRoot.replaceChildren();
    $('#system-root').replaceChildren();
    screenEl.classList.add('launching');
    showApp();
  } else if (st.state === 'running') {
    running = true;
  } else if (st.state === 'exited') {
    running = false;
    screenEl.classList.remove('launching', 'sheet-open');
    renderHome();
    showHome();
    if (st.code && st.code !== 0 && !st.stopped) toast(`${appName} quit unexpectedly (code ${st.code})`);
  } else if (st.state === 'building') {
    renderHome();
  }
  if (st.device && st.device !== MODEL_NAME) applyModel(st.device);
});

(async () => {
  const info = await window.sim.info();
  ICONS = new Set(info.icons);
  ICON_BASE = info.iconBase;
  appName = info.app || appName;
  DEVICE = await window.sim.device();
  LANG = DEVICE.language || 'en';
  applyModel(DEVICE.model);
  if (window.sim.onModel) window.sim.onModel(name => { applyModel(name); render(); });
  tickClock();
  setInterval(tickClock, 15000);
  renderHome();
  showHome();
  window.sim.ready();
})();
