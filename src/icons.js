// SF-Symbols-like line icons (16x16, currentColor)
const ICONS = {
  sidebarLeft: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M6 2.5v11M3 5h1.5M3 7h1.5M3 9h1.5"/>',
  sidebarRight: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11M11.5 5H13M11.5 7H13M11.5 9H13"/>',
  play: '<path d="M4.5 2.8v10.4c0 .5.5.8.9.5l8-5.2a.6.6 0 0 0 0-1L5.4 2.3c-.4-.3-.9 0-.9.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.2" fill="currentColor" stroke="none"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  plusSquare: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M8 5v6M5 8h6"/>',
  folder: '<path d="M1.5 4.5v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3.5h-4a1 1 0 0 0-1 1z"/>',
  folderOpen: '<path d="M1.5 12.5V4.5a1 1 0 0 1 1-1h4L8 5h5a1 1 0 0 1 1 1v1.5"/><path d="M1.5 12.5 3.3 7.7a1 1 0 0 1 .9-.7h10.3a.6.6 0 0 1 .6.8l-1.7 4.5a1 1 0 0 1-.9.7H2.5"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.3 10.3 3.7 3.7"/>',
  warning: '<path d="M8 2 1.8 13h12.4z"/><path d="M8 6.5v3M8 11.3v.2"/>',
  report: '<path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 2.5V11.5h-.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/><path d="M5 6.5h6M5 8.5h4"/>',
  symbols: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  filter: '<path d="M2 3.5h12M4.5 8h7M7 12.5h2"/>',
  chevronLeft: '<path d="M10 3 5 8l5 5"/>',
  chevronRight: '<path d="m6 3 5 5-5 5"/>',
  chevronDown: '<path d="m3.5 6 4.5 4.5L12.5 6"/>',
  panelDown: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 9.5h13"/>',
  breakpoint: '<path d="M2 4h9l3 4-3 4H2z"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  stepOver: '<path d="M2.5 9a5.5 5.5 0 0 1 10.5-2.3"/><path d="m13.5 3.5-.4 3.4-3.3-.6"/><circle cx="8" cy="12.5" r="1.2" fill="currentColor"/>',
  stepIn: '<path d="M8 2v7M5 6.5 8 9.5l3-3"/><circle cx="8" cy="13" r="1.2" fill="currentColor"/>',
  stepOut: '<path d="M8 10V3M5 5.5 8 2.5l3 3"/><circle cx="8" cy="13" r="1.2" fill="currentColor"/>',
  trash: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/>',
  doc: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/>',
  help: '<circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.5M8 11.6v.2"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  sparkles: '<path d="M6 2.5 7.2 6 10.5 7 7.2 8.2 6 11.5 4.8 8.2 1.5 7l3.3-1z"/><path d="M12 9.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  terminalApp: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="m4.5 6.5 2 1.5-2 1.5M8 10h3.5"/>',
  pc: '<rect x="1.5" y="2.5" width="13" height="8.5" rx="1"/><path d="M5.5 13.5h5M8 11v2.5"/>',
  iphone: '<rect x="4.5" y="1.5" width="7" height="13" rx="1.8"/><path d="M7 3.2h2"/>',
  appIcon: '<rect x="2" y="2" width="12" height="12" rx="3.2"/><path d="M5.5 8h5M8 5.5v5"/>',
  simulator: '<rect x="4.5" y="1.5" width="7" height="13" rx="1.8"/><path d="M7 3.2h2M6.5 12.5h3"/>',
  hammer: '<path d="m9 5 2.5 2.5L5 14l-2.5-2.5z"/><path d="M8 4 10 2c1.5-.5 3 0 4 1l-1 1 1 1-1.5 1.5L10 4"/>',
  clock: '<circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/>',
  xmarkCircle: '<circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none"/><path d="m5.5 5.5 5 5M10.5 5.5l-5 5" stroke="#fff"/>',
  checkCircle: '<circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none"/><path d="m5 8.3 2 2 4-4.3" stroke="#fff"/>',
  editorOptions: '<path d="M2 4h12M2 8h12M2 12h7"/><circle cx="12" cy="12" r="1.6"/>',
  pin: '<path d="M6 2h4l-.5 4 2 2v1.5h-7V8l2-2z"/><path d="M8 9.5V14"/>',
  appearance: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor"/>',
  refresh: '<path d="M13 7.5A5 5 0 1 0 11.5 11"/><path d="M13.5 3.5V7.5H9.5"/>',
  splitAdd: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M8 2.5v11M10.5 8h2.5M11.75 6.75v2.5"/>',
  canvas: '<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M9 2.5v11"/><rect x="10.5" y="5" width="2.5" height="5" rx=".7"/>',
  bookmark: '<path d="M4 2h8v12l-4-3-4 3z"/>',
  continueBtn: '<path d="M3 3v10"/><path d="M6 3.2v9.6c0 .4.4.6.7.4l6.6-4.8a.5.5 0 0 0 0-.8L6.7 2.8c-.3-.2-.7 0-.7.4z" fill="currentColor" stroke="none"/>',
  debugNav: '<path d="M5 5.5a3 3 0 0 1 6 0v4a3 3 0 0 1-6 0z"/><path d="M8 5.5v7M2.5 8H5M11 8h2.5M3 4.5l2 1.5M13 4.5l-2 1.5M3 12.5 5 11M13 12.5 11 11"/>',
  breakpointsNav: '<path d="M1.5 5h9.5l3.5 3-3.5 3H1.5z"/>',
  testDiamond: '<path d="M8 1.8 14.2 8 8 14.2 1.8 8z"/><path d="m5.6 8.2 1.7 1.7 3.2-3.6"/>',
  sourceControl: '<circle cx="4.5" cy="3.5" r="1.6"/><circle cx="4.5" cy="12.5" r="1.6"/><circle cx="11.5" cy="5.5" r="1.6"/><path d="M4.5 5.1v5.8M11.5 7.1c0 2.4-2.5 3-7 3.8"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  related: '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  rotate: '<rect x="3.5" y="5.5" width="9" height="6" rx="1.2"/><path d="M6 2.5a5 5 0 0 1 6.5 2.5M12.5 2.5V5H10"/>',
  minus: '<path d="M3 8h10"/>',
  keyboard: '<rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><path d="M4 6.5h.5M6.5 6.5H7M9 6.5h.5M11.5 6.5h.5M4 8.5h.5M11.5 8.5h.5M6.5 8.5h3M5 10.5h6"/>',
  replace: '<path d="M2.5 5.5h8M8 3l2.5 2.5L8 8M13.5 10.5h-8M8 8l-2.5 2.5L8 13"/>',
  thread: '<path d="M2.5 4h11M2.5 8h11M2.5 12h7"/>',
  frame: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 6h5M5.5 9h3"/>',
};

function icon(name, cls = '') {
  const body = ICONS[name] || '';
  return `<svg class="ico ${cls}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconDone) return;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.iconDone = '1';
  });
}

// Navigator file-type badges
const FILE_BADGES = {
  swift: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="3.2" fill="#F05138"/><path d="M10.6 5.2c-.5-.6-1.4-.9-2.4-.9-1.5 0-2.6.8-2.6 2 0 2.4 4.9 1.5 4.9 3.7 0 1-.9 1.7-2.4 1.7-1.1 0-2-.4-2.6-1.1" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
  folder: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M1 4.2c0-.7.5-1.2 1.2-1.2h3.6l1.5 1.5h6.5c.7 0 1.2.5 1.2 1.2v6.9c0 .7-.5 1.2-1.2 1.2H2.2c-.7 0-1.2-.5-1.2-1.2z" fill="#3B9BEF"/><path d="M1 6h14v6.6c0 .7-.5 1.2-1.2 1.2H2.2c-.7 0-1.2-.5-1.2-1.2z" fill="#56ADF5"/></svg>',
  project: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="3" fill="#2F7CF6"/><path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>',
  package: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.3 14 4.5v7L8 14.7 2 11.5v-7z" fill="#C7924D"/><path d="M2 4.5 8 7.7l6-3.2M8 7.7v7" stroke="#8E6431" stroke-width="1" fill="none"/></svg>',
  doc: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 1.5h6.5L13 5v9.5H3z" fill="#E8E8EA"/><path d="M9.5 1.5V5H13" fill="#B9B9BD"/><path d="M5 8h6M5 10h6M5 12h4" stroke="#9A9AA0" stroke-width=".9"/></svg>',
  json: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 1.5h6.5L13 5v9.5H3z" fill="#E8E8EA"/><text x="8" y="12" font-size="5.5" text-anchor="middle" fill="#8C6BC8" font-family="Segoe UI" font-weight="700">{ }</text></svg>',
  md: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 1.5h6.5L13 5v9.5H3z" fill="#E8E8EA"/><text x="8" y="12" font-size="5.5" text-anchor="middle" fill="#4C77C7" font-family="Segoe UI" font-weight="700">MD</text></svg>',
  app: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="1" width="14" height="14" rx="3.2" fill="#5E5E63"/><path d="M5.6 11.6 8 4.4l2.4 7.2M6.4 9.4h3.2" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>',
  strings: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 2h10M3 5h10" stroke="#F0513C" stroke-width="1.6" stroke-linecap="round"/><path d="M3 8.5h10M3 11.5h7M3 14h9" stroke="#F0513C" stroke-width="1.2" stroke-linecap="round" opacity=".75"/></svg>',
  catalog: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="#3E7BF0"/><path d="M4.5 5h7M4.5 8h7M4.5 11h4.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" fill="#3B9BEF"/><circle cx="5.5" cy="6" r="1.4" fill="#fff"/><path d="M2.5 12 6.5 8.5l2.5 2 2-1.6 2.5 3.1z" fill="#fff"/></svg>',
  assets: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="2" width="14" height="12" rx="2" fill="#3B9BEF"/><rect x="3" y="4.5" width="5" height="4" rx=".8" fill="#fff"/><path d="M9.5 5.5h3.5M9.5 7.5h3.5M3 11h10" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></svg>',
  plist: '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="1.5" width="12" height="13" rx="1.5" fill="#E8E8EA"/><path d="M4.5 4.5h1.5M7.5 4.5h4M4.5 7.5h1.5M7.5 7.5h4M4.5 10.5h1.5M7.5 10.5h4" stroke="#7A7A80" stroke-width="1.1" stroke-linecap="round"/></svg>',
};

function fileBadge(name, type) {
  if (type === 'assets') return FILE_BADGES.assets;
  if (type === 'vgroup') return /\.xcstrings$/i.test(name) ? FILE_BADGES.catalog : FILE_BADGES.strings;
  if (type === 'dir') return FILE_BADGES.folder;
  if (/^Package\.swift$/.test(name)) return FILE_BADGES.package;
  if (/\.swift$/i.test(name)) return FILE_BADGES.swift;
  if (/\.(strings|stringsdict)$/i.test(name)) return FILE_BADGES.strings;
  if (/\.xcstrings$/i.test(name)) return FILE_BADGES.catalog;
  if (/\.(png|jpe?g|gif|webp|svg|bmp|heic|ico)$/i.test(name)) return FILE_BADGES.image;
  if (/\.xcassets$/i.test(name)) return FILE_BADGES.assets;
  if (/\.plist$/i.test(name)) return FILE_BADGES.plist;
  if (/\.json$/i.test(name)) return FILE_BADGES.json;
  if (/\.md$/i.test(name)) return FILE_BADGES.md;
  return FILE_BADGES.doc;
}

// Symbol kind badges (letters in colored squares like Xcode)
function symbolBadge(kind) {
  const map = {
    func: ['M', '#4DA05F'], method: ['M', '#4DA05F'], struct: ['S', '#A367D9'], class: ['C', '#C9A13B'],
    enum: ['E', '#C9783B'], protocol: ['Pr', '#C64B7A'], extension: ['Ex', '#E7745E'], var: ['V', '#4F86C6'],
    let: ['L', '#4F86C6'], actor: ['A', '#3A9FAC'], typealias: ['T', '#9E6BC9'], case: ['E', '#C9783B'], init: ['M', '#4DA05F'],
  };
  const [letter, color] = map[kind] || ['#', '#777'];
  return `<span class="sym-badge" style="background:${color}">${letter}</span>`;
}
