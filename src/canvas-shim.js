'use strict';
// When the simulator page is embedded in the IDE's canvas (simulator.html?canvas), it has no preload of its own:
// this stands in for window.sim and talks to the IDE window through postMessage.
(() => {
  if (!new URLSearchParams(location.search).has('canvas')) return;
  document.documentElement.classList.add('canvas-mode');
  const handlers = {};
  const pending = new Map();
  let seq = 0;
  const post = (type, data) => parent.postMessage({ __canvas: true, type, data }, '*');
  const call = (type, data) => new Promise(resolve => {
    const id = ++seq;
    pending.set(id, resolve);
    parent.postMessage({ __canvas: true, type, data, id }, '*');
  });
  window.addEventListener('message', e => {
    const m = e.data;
    if (!m || !m.__canvasHost) return;
    if (m.reply) { const r = pending.get(m.reply); pending.delete(m.reply); if (r) r(m.data); return; }
    for (const fn of handlers[m.type] || []) fn(m.data);
  });
  const on = name => fn => { (handlers[name] = handlers[name] || []).push(fn); };
  const nop = () => {};
  window.sim = {
    info: () => call('info'),
    device: () => call('device'),
    event: ev => post('event', ev),
    ready: () => post('ready'),
    openLink: url => post('openLink', url),
    screenshot: () => Promise.resolve(null),
    run: nop, close: nop, minimize: nop, menu: nop, shake: nop, scene: nop,
    permissionResult: nop, setLanguage: nop, setLocation: nop, resetPermissions: nop,
    onFrame: on('frame'), onState: on('state'), onPermission: on('permission'), onShook: on('shook'), onHome: on('home'),
    onToggleAppearance: on('toggleAppearance'), onCustomLocation: on('customLocation'), onScreenshot: on('screenshot'),
    onOpenSettings: on('openSettings'), onEndEditing: on('endEditing'), onLocationInUse: on('locationInUse'), onLanguage: on('language'),
    onModel: on('model'),
  };
})();
