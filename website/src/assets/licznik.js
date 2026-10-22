/**
 * Licznik odwiedzin Tactical Ops (v2) dla winswift.tacticalops.fun.
 * Ten sam mechanizm co /odwiedziny.js na tacticalops.fun; strony tej subdomeny liczą się jako /winswift/…
 * Wejście liczy się po 2 s oglądania widocznej strony. ?nie-licz wyłącza liczenie na urządzeniu, ?licz włącza.
 */
(function () {
  if (window.__TO_TRACKED) return;
  window.__TO_TRACKED = true;

  var ls = null;
  try { ls = window.localStorage; } catch (e) {}
  function czytaj(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function pisz(k, v) { try { if (ls) { if (v === null) ls.removeItem(k); else ls.setItem(k, v); } } catch (e) {} }

  var q = window.location.search || '';
  if (/[?&]nie-licz(=|&|$)/.test(q)) pisz('to_nie_licz', '1');
  if (/[?&]licz(=|&|$)/.test(q)) pisz('to_nie_licz', null);
  if (czytaj('to_nie_licz') === '1' || navigator.webdriver) return;

  var vid = czytaj('to_vid');
  if (!vid || !/^[a-f0-9]{32}$/.test(vid)) {
    vid = '';
    try {
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      for (var i = 0; i < 16; i++) vid += (b[i] + 256).toString(16).slice(1);
      pisz('to_vid', vid);
      if (czytaj('to_vid') !== vid) vid = '';
    } catch (e) { vid = ''; }
  }

  var wyslane = false, timer = null;
  function wyslij() {
    if (wyslane) return;
    wyslane = true;
    var ref = '';
    try { if (document.referrer) ref = new URL(document.referrer).origin; } catch (e) {}
    var url = '/odwiedziny.php?p=' + encodeURIComponent('/winswift' + (window.location.pathname || '/')) +
              '&v=' + vid + '&r=' + encodeURIComponent(ref);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url)) return; } catch (e) {}
    try { fetch(url, { method: 'POST', keepalive: true, credentials: 'same-origin' }).catch(function () {}); } catch (e) {}
  }
  function zmiana() {
    if (wyslane) return;
    if (document.visibilityState === 'visible') { if (!timer) timer = setTimeout(wyslij, 2000); }
    else if (timer) { clearTimeout(timer); timer = null; }
  }
  document.addEventListener('visibilitychange', zmiana);
  zmiana();
})();
