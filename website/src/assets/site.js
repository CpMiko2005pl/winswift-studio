// WinSwift Studio — strona: menu, zakładki zrzutów, powiększanie, animacje, wersja z GitHuba
(function () {
  'use strict';
  var d = document;
  d.documentElement.classList.remove('no-js');

  // mobile menu
  var btn = d.querySelector('.menu-btn'), nav = d.querySelector('.nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  }

  // screenshot tabs
  var tabs = d.querySelectorAll('.tab'), shots = d.querySelectorAll('.shot');
  function show(id) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t.dataset.shot === id ? 'true' : 'false'); t.tabIndex = t.dataset.shot === id ? 0 : -1; });
    shots.forEach(function (s) { s.classList.toggle('on', s.id === id); });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.dataset.shot); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return;
      var next = tabs[(i + n + tabs.length) % tabs.length];
      next.focus(); show(next.dataset.shot);
    });
  });
  if (tabs.length) show(tabs[0].dataset.shot);

  // lightbox
  var lb = d.createElement('div');
  lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Zrzut ekranu');
  lb.innerHTML = '<img alt="">';
  d.body.appendChild(lb);
  d.addEventListener('click', function (e) {
    var f = e.target.closest('.frame');
    if (f) {
      var img = f.querySelector('img');
      lb.firstChild.src = img.currentSrc || img.src; lb.firstChild.alt = img.alt;
      lb.classList.add('on');
    } else if (e.target.closest('.lb')) lb.classList.remove('on');
  });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('on'); });

  // reveal on scroll
  var rv = d.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  // footer year
  d.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // newest release from GitHub (version + installer size), cached for an hour
  function apply(r) {
    if (!r || !r.v) return;
    d.querySelectorAll('[data-version]').forEach(function (el) { el.textContent = r.v; });
    if (r.mb) d.querySelectorAll('[data-size]').forEach(function (el) { el.textContent = r.mb; });
  }
  var KEY = 'wss-release', cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (cached && Date.now() - cached.t < 3600e3) apply(cached);
  else if (window.fetch) {
    fetch('https://api.github.com/repos/CpMiko2005pl/winswift-studio/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) {
        if (!j || !j.tag_name) return;
        var setup = (j.assets || []).filter(function (a) { return /setup.*\.exe$/i.test(a.name); })[0];
        var r = { t: Date.now(), v: String(j.tag_name).replace(/^v/i, ''), mb: setup ? Math.round(setup.size / 1048576) + ' MB' : '' };
        try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {}
        apply(r);
      }).catch(function () {});
  }
})();
