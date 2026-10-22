const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getState: () => invoke('state:get'),
  setState: patch => invoke('state:set', patch),

  openFolderDialog: () => invoke('dialog:openFolder'),
  openFileDialog: () => invoke('dialog:openFile'),
  chooseLocation: name => invoke('dialog:chooseLocation', name),
  confirm: (message, detail, buttons) => invoke('dialog:confirm', { message, detail, buttons }),

  createProject: opts => invoke('project:create', opts),
  tree: root => invoke('project:tree', root),
  watch: root => invoke('project:watch', root),
  projectFiles: root => invoke('project:files', root),
  exists: p => invoke('project:exists', p),

  read: p => invoke('fs:read', p),
  write: (p, content) => invoke('fs:write', p, content),
  newFile: (dir, name, projectName, kind) => invoke('fs:newFile', dir, name, projectName, kind),
  newFolder: (dir, name) => invoke('fs:newFolder', dir, name),
  rename: (from, toName) => invoke('fs:rename', from, toName),
  trash: p => invoke('fs:trash', p),
  reveal: p => invoke('fs:reveal', p),
  openPath: p => invoke('fs:openPath', p),
  cleanBuild: root => invoke('fs:cleanBuild', root),
  search: (root, q, opts) => invoke('search', root, q, opts),
  importFiles: (dir, files) => invoke('fs:import', dir, files),
  openImagesDialog: () => invoke('dialog:openImages'),
  openFilesDialog: () => invoke('dialog:openFiles'),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch { return f.path || ''; } },

  settings: root => invoke('project:settings', root),
  setSettings: (root, patch) => invoke('project:setSettings', root, patch),
  localizations: root => invoke('project:localizations', root),
  localize: (root, file, lang) => invoke('project:localize', root, file, lang),
  copyLocalization: (root, file, lang) => invoke('project:copyLocalization', root, file, lang),
  addLanguage: (root, lang, files) => invoke('project:addLanguage', root, lang, files),
  removeLanguage: (root, lang) => invoke('project:removeLanguage', root, lang),

  assets: dir => invoke('assets:list', dir),
  importAssets: (dir, files) => invoke('assets:import', dir, files),
  setAssetImage: (set, scale, file) => invoke('assets:setImage', set, scale, file),
  newColorSet: (dir, name) => invoke('assets:newColor', dir, name),
  newImageSet: (dir, name) => invoke('assets:newImageSet', dir, name),
  setColor: (set, rgba, appearance) => invoke('assets:setColor', set, rgba, appearance),
  renameAsset: (set, name) => invoke('assets:rename', set, name),

  toolchain: refresh => invoke('toolchain:info', refresh),
  build: opts => invoke('build:start', opts),
  stop: () => invoke('build:stop'),
  stdin: text => invoke('build:stdin', text),
  eof: () => invoke('build:eof'),
  installSdk: () => invoke('sdk:install'),
  installToolchain: () => invoke('toolchain:install'),
  checkUpdate: () => invoke('update:check'),
  downloadUpdate: info => invoke('update:download', info),
  cancelUpdate: () => invoke('update:cancel'),
  installUpdate: file => invoke('update:install', file),
  licenseState: () => invoke('license:state'),
  activate: input => invoke('license:activate', input),
  deactivate: () => invoke('license:deactivate'),
  checkLicense: () => invoke('license:check'),
  showSimulator: () => invoke('sim:show'),

  debugRequest: (command, args) => invoke('debug:request', command, args),
  debugSetBreakpoints: list => invoke('debug:setBreakpoints', list),
  debugActive: () => invoke('debug:active'),

  previewStart: opts => invoke('preview:start', opts),
  previewStop: () => invoke('preview:stop'),
  previewInput: ev => invoke('preview:input', ev),
  previewInfo: () => invoke('preview:info'),
  simDevice: () => invoke('sim:device'),
  setSimModel: name => invoke('sim:setModel', name),

  lspStart: root => invoke('lsp:start', root),
  lspStop: () => invoke('lsp:stop'),
  lspRequest: (method, params) => invoke('lsp:request', method, params),
  lspNotify: (method, params) => invoke('lsp:notify', method, params),

  popupMenu: (items, x, y) => invoke('menu:popup', { items, x, y }),
  openExternal: url => invoke('app:openExternal', url),
  devtools: () => invoke('app:devtools'),
  toggleFullScreen: () => invoke('app:fullscreen'),
  version: () => invoke('app:version'),
  initialPath: () => invoke('app:initialPath'),
  debugScript: () => invoke('app:eval', process.env.SWIFTCODE_SCRIPT || null),
  testShot: (file, which) => invoke('app:testShot', file, which),
  testQuit: () => invoke('app:testQuit'),
  quit: () => invoke('app:quit'),
  closeConfirmed: () => invoke('app:close-confirmed'),

  on: (channel, fn) => {
    const allowed = ['build:event', 'project:changed', 'app:before-close', 'app:command', 'lsp:notification', 'preview:event', 'debug:event', 'sim:modelChanged', 'license:changed', 'update:progress'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
