/* Kartenspiel online server.
   - Serves the built site (site/index.html) and a small REST API for accounts and profiles.
   - Runs lobbies and games over one WebSocket per browser tab. The server owns every game's state:
     players send actions, the server checks it's their move, runs KEngine.apply, and sends each
     player the version of the new state they're allowed to see (KEngine.redact).
   Settings (environment variables): PORT (default 8080), DATA_DIR (default server/data). */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const D = require('../src/data.js'), E = require('../src/engine.js');
const store = require('./store.js');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const COLORS = ['#d42020', '#1f4fd1', '#138a36', '#d39a00', '#8a2be2'];
const ARCHETYPES = D.STARTER.filter(c => c.type === 'Foundation' && c.archetype).map(c => c.archetype);
const CARD_NAMES = {}; D.STARTER.forEach(c => { CARD_NAMES[c.id] = c.name; });
const GAME_ACTIONS = ['startTurn', 'reclaim', 'play', 'cast', 'answer', 'claim', 'ability', 'swap', 'endTurn', 'closeReveal'];

function createServer(opts) {
  opts = opts || {};
  const LOBBY_GRACE = opts.lobbyGrace || 20 * 1000;   // a player who drops out of a lobby keeps their seat this long (page reloads)
  const GAME_GRACE = opts.gameGrace || 120 * 1000;    // ... and in a running game, after which they resign
  const db = store.open(opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data'));
  const rooms = new Map();          // id -> room
  const clients = new Set();        // open sockets; each has .user (name or null) and .alive
  const memberOf = new Map();       // user name -> room id

  /* ---------- HTTP: static site + REST ---------- */
  const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
  function send(res, code, body, type) {
    res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
    res.end(type ? body : JSON.stringify(body));
  }
  function readJSON(req) {
    return new Promise((ok, fail) => {
      let b = ''; req.on('data', c => { b += c; if (b.length > 10000) req.destroy(); });
      req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { fail(new Error('Bad request.')); } });
    });
  }
  function profile(name) {
    const u = db.user(name); if (!u) return null;
    const s = u.stats;
    return {
      name: u.name, created: u.created, games: s.games, wins: s.wins, losses: s.losses,
      archetypes: Object.keys(s.arch).map(a => ({ name: a, played: s.arch[a].played, won: s.arch[a].won })).sort((a, b) => b.played - a.played || b.won - a.won),
      cards: Object.keys(s.cards).map(id => ({ id, name: CARD_NAMES[id] || id, count: s.cards[id] })).sort((a, b) => b.count - a.count).slice(0, 15),
      history: s.history
    };
  }
  // Sign-up and sign-in attempts per address: at most AUTH_LIMIT a minute (slows password guessing and account spam).
  const AUTH_LIMIT = opts.authLimit || 10, attempts = new Map();
  // Guests: a one-tap session with a made-up name (Guest-K7QX), no password, no profile or stats. Kept in memory
  // for a day; names starting with "Guest" can't be registered, so a guest can't be mistaken for an account.
  const GUEST_TTL = 24 * 3600 * 1000, guests = new Map();   // token -> { name, at }
  const GUEST_RE = /^guest/i;
  function newGuest() {
    const now = Date.now(); guests.forEach((g, t) => { if (now - g.at > GUEST_TTL) guests.delete(t); });
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', taken = new Set([...guests.values()].map(g => g.name));
    let name; do { name = 'Guest-' + Array.from(crypto.randomBytes(4), x => ABC[x % ABC.length]).join(''); } while (taken.has(name));
    const token = 'g' + crypto.randomBytes(24).toString('hex'); guests.set(token, { name, at: now });
    return { name, token, guest: true };
  }
  function guestName(token) { const g = token && guests.get(token); if (!g || Date.now() - g.at > GUEST_TTL) return null; return g.name; }
  function clientIp(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'; }
  function limited(ip) {
    const now = Date.now(), a = (attempts.get(ip) || []).filter(t => now - t < 60000);
    a.push(now); attempts.set(ip, a);
    if (attempts.size > 5000) attempts.clear();   // never let the table grow without bound
    return a.length > AUTH_LIMIT;
  }
  async function api(req, res, url) {
    if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
    try {
      if (url.pathname === '/api/health') return send(res, 200, { ok: true, rooms: rooms.size, online: clients.size });
      if (req.method === 'POST' && url.pathname === '/api/guest') {
        if (limited(clientIp(req))) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
        return send(res, 200, newGuest());
      }
      if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        if (limited(clientIp(req))) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
        const b = await readJSON(req), name = String(b.name || '').trim(), pw = String(b.password || '');
        if (url.pathname === '/api/register') {
          if (!NAME_RE.test(name)) return send(res, 400, { error: 'Names are 3–16 letters, digits, _ or -.' });
          if (GUEST_RE.test(name)) return send(res, 400, { error: 'Names starting with “Guest” are kept for guests.' });
          if (pw.length < 6 || pw.length > 200) return send(res, 400, { error: 'Passwords need at least 6 characters.' });
          return send(res, 200, await db.register(name, pw));
        }
        return send(res, 200, await db.login(name, pw));
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') { const b = await readJSON(req); db.logout(b.token); guests.delete(b.token); return send(res, 200, { ok: true }); }
      const m = url.pathname.match(/^\/api\/profile\/([^/]+)$/);
      if (m && GUEST_RE.test(decodeURIComponent(m[1])) && !db.user(decodeURIComponent(m[1]))) return send(res, 404, { error: 'Guests play without a profile.' });
      if (m) { const p = profile(decodeURIComponent(m[1])); return p ? send(res, 200, p) : send(res, 404, { error: 'No such player.' }); }
      return send(res, 404, { error: 'Not found.' });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const full = path.join(SITE, file);
    if (!full.startsWith(SITE) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }[path.extname(full)] || 'application/octet-stream';
    send(res, 200, fs.readFileSync(full), type);
  });

  /* ---------- sockets ---------- */
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
  function tell(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function socketsOf(name) { return [...clients].filter(c => c.user === name); }
  function online(name) { return socketsOf(name).length > 0; }

  // What the server list shows about a room. Private rooms are never listed.
  function listing(r) { return { id: r.id, name: r.name, host: r.host, players: r.players.length, max: r.max, status: r.status }; }
  function broadcastList() {
    const list = [...rooms.values()].filter(r => !r.private).map(listing);
    clients.forEach(c => { if (!c.user || !memberOf.has(c.user)) tell(c, { t: 'lobbies', list }); });
  }
  // The room as its members see it.
  function roomView(r) {
    return { id: r.id, name: r.name, private: r.private, code: r.code, host: r.host, max: r.max, opts: r.opts, status: r.status,
      players: r.players.map(p => ({ name: p.name, arch: p.arch, connected: online(p.name) })) };
  }
  function seatOf(r, name) { return r.game ? r.game.seats.indexOf(name) : -1; }
  function sendRoom(r) { r.players.forEach(p => socketsOf(p.name).forEach(ws => tell(ws, { t: 'room', room: roomView(r) }))); }
  function sendState(r, only) {
    if (!r.game) return;
    r.players.forEach(p => {
      if (only && p.name !== only) return;
      const seat = seatOf(r, p.name); if (seat < 0) return;
      const st = E.redact(r.game.state, seat); delete st.defs;
      socketsOf(p.name).forEach(ws => tell(ws, { t: 'state', seat, state: st }));
    });
  }
  // Card definitions are large and never change during a game, so they're sent once, apart from the state.
  function sendDefs(r, name) {
    const defs = Object.assign({}, r.game.state.defs, { __hidden: E.redact(r.game.state, 0).defs.__hidden });
    socketsOf(name).forEach(ws => tell(ws, { t: 'defs', defs }));
  }

  function newId() { return crypto.randomBytes(4).toString('hex'); }
  function newCode() { let c; do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while ([...rooms.values()].some(r => r.code === c)); return c; }
  const DEFAULT_OPTS = { handSize: 4, drawPerTurn: 2, meeples: 8, target: 48, foundationBy: 3, enforceWeak: true, autoEnd: true, seatStart: true, burySuitOW: true, defense: true, adjDiscount: true, noWander: true, ascension: true };
  // Keep only known options, with numbers clamped to the ranges the New game page allows.
  function cleanOpts(o) {
    const out = Object.assign({}, DEFAULT_OPTS), n = (k, lo, hi) => { if (o[k] != null && o[k] !== '' && isFinite(+o[k])) out[k] = Math.max(lo, Math.min(hi, Math.round(+o[k]))); };
    n('handSize', 1, 10); n('drawPerTurn', 0, 5); n('meeples', 1, 30); n('target', 1, 999); n('foundationBy', 0, 10);
    ['enforceWeak', 'autoEnd', 'seatStart', 'burySuitOW', 'defense', 'adjDiscount', 'noWander', 'ascension'].forEach(k => { if (typeof o[k] === 'boolean') out[k] = o[k]; });
    return out;
  }

  function joinRoom(ws, r) {
    const name = ws.user;
    if (memberOf.get(name) === r.id) { sendRoom(r); if (r.game) { sendDefs(r, name); sendState(r, name); } return; }
    if (memberOf.has(name)) return tell(ws, { t: 'error', msg: 'Leave your current room first.' });
    if (r.status !== 'lobby') return tell(ws, { t: 'error', msg: 'That game has already started.' });
    if (r.players.length >= r.max) return tell(ws, { t: 'error', msg: 'That room is full.' });
    r.players.push({ name, arch: null });
    memberOf.set(name, r.id);
    sendRoom(r); broadcastList();
  }
  // Remove a player from a room. In a running game they resign first.
  function leaveRoom(name) {
    const r = rooms.get(memberOf.get(name)); memberOf.delete(name);
    socketsOf(name).forEach(ws => tell(ws, { t: 'left' }));
    if (!r) return;
    const p = r.players.find(q => q.name === name); if (p && p.timer) clearTimeout(p.timer);
    r.players = r.players.filter(q => q.name !== name);
    if (r.status === 'playing') { const seat = seatOf(r, name); if (seat >= 0 && !r.game.state.players[seat].out) applyAction(r, seat, { t: 'resign', p: seat }, true); }
    if (!r.players.length) { rooms.delete(r.id); broadcastList(); return; }
    if (r.host === name) r.host = r.players[0].name;
    sendRoom(r); broadcastList();
  }

  function startGame(r) {
    const players = r.players.map((p, i) => ({ name: p.name, arch: p.arch, color: COLORS[i] }));
    const st = E.newGame(D.STARTER, Object.assign({ players, seed: crypto.randomInt(1, 2147483646) }, r.opts));
    r.game = { id: newId(), state: st, seats: r.players.map(p => p.name), plays: r.players.map(() => ({})), started: Date.now() };
    r.status = 'playing';
    sendRoom(r); r.players.forEach(p => sendDefs(r, p.name)); sendState(r); broadcastList();
  }
  // Run one game action for `seat`. `system` actions (resign) skip the turn checks.
  function applyAction(r, seat, a, system) {
    const st = r.game.state;
    if (!system) {
      if (GAME_ACTIONS.indexOf(a.t) < 0) return 'You can’t do that in an online game.';
      if (a.t === 'answer') { if (!st.pending || st.pending.player !== seat) return 'It isn’t your decision.'; }
      else if (a.t === 'closeReveal') { if (!st.reveal || st.reveal.to !== seat) return 'Nothing to close.'; }
      else if (st.cur !== seat) return 'It isn’t your turn.';
      a = Object.assign({}, a); delete a.p;          // the engine acts for st.cur
    }
    const next = E.apply(st, a);
    if (next.error) return next.error;
    if ((a.t === 'play' || a.t === 'cast') && st.cards[a.uid]) { const id = st.cards[a.uid].def, pc = r.game.plays[seat]; pc[id] = (pc[id] || 0) + 1; }
    r.game.state = next;
    if (next.winner != null && r.status === 'playing') finishGame(r);
    sendState(r);
    return null;
  }
  function finishGame(r) {
    const st = r.game.state, sc = E.scores(st);
    r.status = 'over';
    db.recordGame({ id: r.game.id, date: Date.now(), room: r.name, rounds: st.round,
      players: r.game.seats.map((name, i) => ({ name, arch: st.players[i].arch, score: sc[i].total, won: st.winner === i, plays: r.game.plays[i] })) });
    sendRoom(r); broadcastList();
  }

  // A player's last tab closed: hold their seat for a while, then let them go.
  function dropped(name) {
    const r = rooms.get(memberOf.get(name)); if (!r) return;
    const p = r.players.find(q => q.name === name); if (!p) return;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => { if (!online(name) && memberOf.get(name) === r.id) leaveRoom(name); }, r.status === 'playing' ? GAME_GRACE : LOBBY_GRACE);
    sendRoom(r);
  }

  function handle(ws, m) {
    if (m.t === 'hello') {
      const before = ws.user;
      ws.user = db.who(m.token) || guestName(m.token); ws.guest = !!ws.user && !db.who(m.token);
      if (before && before !== ws.user && !online(before)) dropped(before);   // signed out in this tab
      tell(ws, { t: 'welcome', user: ws.user, guest: ws.guest, archetypes: ARCHETYPES });
      const r = ws.user && rooms.get(memberOf.get(ws.user));
      if (r) { const p = r.players.find(q => q.name === ws.user); if (p) clearTimeout(p.timer); joinRoom(ws, r); }
      else tell(ws, { t: 'lobbies', list: [...rooms.values()].filter(x => !x.private).map(listing) });
      return;
    }
    if (m.t === 'list') return tell(ws, { t: 'lobbies', list: [...rooms.values()].filter(x => !x.private).map(listing) });
    if (!ws.user) return tell(ws, { t: 'error', msg: 'Sign in to play online.' });
    const name = ws.user, r = rooms.get(memberOf.get(name));
    switch (m.t) {
      case 'create': {
        if (r) return tell(ws, { t: 'error', msg: 'Leave your current room first.' });
        const room = { id: newId(), name: String(m.name || '').trim().slice(0, 40) || name + '’s table', private: !!m.private, code: null, host: name,
          max: Math.max(2, Math.min(5, +m.max || 4)), opts: cleanOpts({}), status: 'lobby', players: [], game: null };
        if (room.private) room.code = newCode();
        rooms.set(room.id, room); joinRoom(ws, room); return;
      }
      case 'join': {
        const target = m.code ? [...rooms.values()].find(x => x.code && x.code === String(m.code).trim().toUpperCase()) : rooms.get(m.id);
        if (!target || (target.private && !m.code)) return tell(ws, { t: 'error', msg: m.code ? 'No room has that code.' : 'That room is gone.' });
        return joinRoom(ws, target);
      }
      case 'leave': return leaveRoom(name);
    }
    if (!r) return tell(ws, { t: 'error', msg: 'You aren’t in a room.' });
    const isHost = r.host === name;
    switch (m.t) {
      case 'pick': {          // first come, first served
        if (r.status !== 'lobby') return;
        const me = r.players.find(q => q.name === name);
        if (m.arch == null) { me.arch = null; return sendRoom(r); }
        if (ARCHETYPES.indexOf(m.arch) < 0) return;
        const holder = r.players.find(q => q.arch === m.arch);
        if (holder && holder !== me) return tell(ws, { t: 'error', msg: holder.name + ' already took the ' + m.arch + '.' });
        me.arch = m.arch; return sendRoom(r);
      }
      case 'opts': if (isHost && r.status === 'lobby') { r.opts = cleanOpts(m.opts || {}); if (m.max) r.max = Math.max(r.players.length, 2, Math.min(5, +m.max)); sendRoom(r); broadcastList(); } return;
      case 'start': {
        if (!isHost || r.status !== 'lobby') return;
        if (r.players.length < 2) return tell(ws, { t: 'error', msg: 'You need at least 2 players.' });
        if (r.players.some(q => !q.arch)) return tell(ws, { t: 'error', msg: 'Everyone needs an archetype first.' });
        return startGame(r);
      }
      case 'again': if (isHost && r.status === 'over') { r.status = 'lobby'; r.game = null; sendRoom(r); broadcastList(); } return;
      case 'act': {
        if (r.status !== 'playing') return;
        const seat = seatOf(r, name); if (seat < 0 || !m.a || typeof m.a !== 'object') return;
        const e = applyAction(r, seat, m.a, false);
        if (e) tell(ws, { t: 'error', msg: e });
        return;
      }
    }
  }

  // Per-socket message budget: MSG_RATE a second on average, bursts up to MSG_BURST; over that, messages are dropped.
  const MSG_RATE = 20, MSG_BURST = 60;
  wss.on('connection', ws => {
    ws.user = null; ws.alive = true; clients.add(ws); ws.budget = MSG_BURST; ws.budgetAt = Date.now();
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', data => {
      const now = Date.now(); ws.budget = Math.min(MSG_BURST, ws.budget + (now - ws.budgetAt) / 1000 * MSG_RATE); ws.budgetAt = now;
      if (ws.budget < 1) return; ws.budget--;
      let m; try { m = JSON.parse(data); } catch (e) { return; } if (m && typeof m.t === 'string') { try { handle(ws, m); } catch (e) { console.error(e); tell(ws, { t: 'error', msg: 'Server error.' }); } } });
    ws.on('close', () => { clients.delete(ws); if (ws.user && !online(ws.user)) dropped(ws.user); });
  });
  // Drop sockets that stop answering pings (closed laptops, lost Wi-Fi).
  const beat = setInterval(() => clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); }), 30000);

  return {
    server,
    listen(port) { return new Promise(ok => server.listen(port, () => ok(server.address().port))); },
    close() { clearInterval(beat); wss.clients.forEach(c => c.terminate()); db.flush(); return new Promise(ok => server.close(ok)); }
  };
}

if (require.main === module) {
  const app = createServer();
  app.listen(+process.env.PORT || 8080).then(port => console.log('Kartenspiel server on http://localhost:' + port));
}
module.exports = { createServer };
