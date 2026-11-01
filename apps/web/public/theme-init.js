// Sets the colour scheme before first paint so there is no flash of the wrong theme.
// Loaded as an external file so the Content Security Policy never needs 'unsafe-inline'.
(function () {
  var scheme = 'dark';
  try {
    var pref = window.localStorage.getItem('twindesk.scheme');
    var fallback = window.localStorage.getItem('twindesk.scheme.default') || 'dark';
    if (pref !== 'dark' && pref !== 'light') pref = pref === 'system' ? 'system' : fallback;
    if (pref === 'system') {
      scheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } else {
      scheme = pref === 'light' ? 'light' : 'dark';
    }
  } catch (e) {
    // Storage can be blocked; the dark default still renders correctly.
  }
  document.documentElement.setAttribute('data-theme', scheme);
})();
