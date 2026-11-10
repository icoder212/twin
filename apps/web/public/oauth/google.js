// Runs in the Google sign-in window and hands Google's reply to the app tab.
// The access token arrives in the URL fragment, which is never sent to any server. It is wiped
// from the address bar and history at once, passed on over a same-origin BroadcastChannel (the
// window has no usable opener once Google's page has loaded) and never stored.
// Loaded as an external file so the Content Security Policy never needs 'unsafe-inline'.
(function () {
  var fragment = new URLSearchParams(window.location.hash.slice(1));
  var query = new URLSearchParams(window.location.search);
  var read = function (name) {
    return fragment.get(name) || query.get(name) || '';
  };
  var token = fragment.get('access_token') || '';
  var message = {
    type: 'google-oauth',
    state: read('state'),
    accessToken: token,
    expiresIn: Number(fragment.get('expires_in')) || 0,
    scope: fragment.get('scope') || '',
    error: read('error') || (token ? '' : 'no_token'),
  };
  window.history.replaceState(null, '', window.location.pathname);
  try {
    var channel = new BroadcastChannel('twindesk-google-oauth');
    channel.postMessage(message);
    channel.close();
  } catch (e) {
    // Without BroadcastChannel the app tab times out and explains how to try again.
  }
  window.close();
})();
