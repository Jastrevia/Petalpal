// Boot screen timing (public/index.html): loaded as a file, not inline, because the production Content-Security-Policy
// allows scripts only from this origin (script-src 'self', no 'unsafe-inline').
// Boot screen timing on the page clock (performance.now), the same clock the app's loading
// screen uses, so the sweep, turns and wingbeat continue unbroken when React takes over.
(function () {
  var boot = document.getElementById('pp-boot'); if (!boot) return;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pass = reduced ? 3.2 : 1.6, now = performance.now() / 1000;
  var delays = { '.band': now % (2 * pass), '.mover': now % (2 * pass), '.face': now % (2 * pass), '.strip': now % 5.1667, '.bob': now % 5.2 };
  for (var selector in delays) { var element = boot.querySelector(selector); if (element) element.style.animationDelay = -delays[selector] + 's'; }
})();
