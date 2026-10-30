/* Online play: the connection to the game server (WebSocket for lobbies and games, plain HTTP for accounts
   and profiles). No DOM here; ui.js decides what to show.
   Which server: ?server=URL in the page address (remembered), else KConfig.server from the build,
   else the page's own address when the server is hosting the page itself. */
var KNet = (function () {
  var cfg = (typeof KConfig !== 'undefined' && KConfig) || {};
  var ws = null, listener = null, delay = 1000, base = '';

  function saved() { try { return localStorage.getItem('ks.server') || ''; } catch (e) { return ''; } }
  function server() {
    var q = /[?&]server=([^&#]*)/.exec(location.search);
    if (q) setServer(decodeURIComponent(q[1]));
    var own = /^https?:$/.test(location.protocol) && !/\.github\.io$/.test(location.hostname) ? location.origin : '';
    return (saved() || cfg.server || own).replace(/\/+$/, '');
  }
  function setServer(url) { try { if (url) localStorage.setItem('ks.server', url); else localStorage.removeItem('ks.server'); } catch (e) { } }

  // Connect and keep reconnecting (1s, 2s, 4s ... up to 15s). fn gets every server message,
  // plus { t: '_open' } and { t: '_close' } when the connection comes and goes.
  function connect(fn) { listener = fn; base = server(); if (base) open(); return base; }
  function open() {
    try { ws = new WebSocket(base.replace(/^http/, 'ws')); } catch (e) { listener({ t: '_close' }); return; }
    ws.onopen = function () { delay = 1000; listener({ t: '_open' }); };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } listener(m); };
    ws.onclose = function () { listener({ t: '_close' }); setTimeout(open, delay); delay = Math.min(delay * 2, 15000); };
  }
  function send(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; }
  // REST call. The body goes as text/plain so browsers skip the CORS preflight.
  function api(path, body) {
    return fetch(base + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}).then(function (r) { return r.json(); });
  }

  return { server: server, setServer: setServer, connect: connect, send: send, api: api };
})();
