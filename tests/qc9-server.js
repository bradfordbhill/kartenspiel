// Online server: accounts, lobbies, first-come archetypes, hidden hands, turn checks, resigning and stats.
// Starts a real server on a free port with a throwaway data folder. Run: node tests/qc9-server.js
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const { createServer } = require('../server/server.js');
const R = []; const chk = (n, c, m) => R.push([n, c ? 'PASS' : 'FAIL', m]);
let base;

async function post(p, body) { const r = await fetch(base + p, { method: 'POST', body: JSON.stringify(body) }); return r.json(); }
// A test client: keeps the latest message of each type, and lets a test wait for a condition.
function client(token) {
  const ws = new WebSocket(base.replace('http', 'ws')), c = { ws, last: {}, errors: [], waiters: [] };
  ws.on('message', d => { const m = JSON.parse(d); c.last[m.t] = m.t === 'room' ? m.room : m.t === 'state' ? m.state : m.t === 'defs' ? m.defs : m; if (m.t === 'error') c.errors.push(m.msg); c.waiters = c.waiters.filter(w => !w()); });
  c.send = m => ws.send(JSON.stringify(m));
  c.until = (f, ms) => new Promise((ok, fail) => { if (f()) return ok(); const at = (new Error().stack.split('\n')[2] || '').trim(); const t = setTimeout(() => fail(new Error('timed out ' + at + ' errors: ' + c.errors.join('; '))), ms || 3000); c.waiters.push(() => { if (f()) { clearTimeout(t); ok(); return true; } }); });
  c.ready = new Promise(ok => ws.on('open', () => { c.send({ t: 'hello', token }); ok(); })).then(() => c.until(() => c.last.welcome));
  return c;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-')), app = createServer({ dataDir: dir, gameGrace: 300, lobbyGrace: 300 });
  base = 'http://localhost:' + await app.listen(0);
  try {
    // accounts
    const ann = await post('/api/register', { name: 'Ann', password: 'secret1' });
    const bob = await post('/api/register', { name: 'Bob', password: 'secret2' });
    chk('Accounts', ann.token && bob.token, 'register returns a token');
    chk('Accounts', (await post('/api/register', { name: 'ann', password: 'whatever' })).error, 'names are unique ignoring case');
    chk('Accounts', (await post('/api/login', { name: 'Ann', password: 'nope' })).error && (await post('/api/login', { name: 'ANN', password: 'secret1' })).token, 'login checks the password');

    // lobby: Ann creates a public room, Bob finds it in the list and joins
    const a = client(ann.token), b = client(bob.token); await a.ready; await b.ready;
    chk('Lobby', a.last.welcome.user === 'Ann' && a.last.welcome.archetypes.length === 6, 'hello signs the socket in');
    a.send({ t: 'create', name: 'Test table', private: false, max: 3 }); await a.until(() => a.last.room);
    await b.until(() => b.last.lobbies && b.last.lobbies.list.length === 1);
    chk('Lobby', b.last.lobbies.list[0].name === 'Test table', 'public room is listed');
    b.send({ t: 'join', id: b.last.lobbies.list[0].id }); await a.until(() => a.last.room.players.length === 2);

    // private rooms are joined by code and never listed
    const cc = client((await post('/api/register', { name: 'Cyd', password: 'secret3' })).token); await cc.ready;
    cc.send({ t: 'create', name: 'Secret', private: true }); await cc.until(() => cc.last.room);
    chk('Lobby', cc.last.room.code && cc.last.room.code.length === 6, 'private room has a join code');
    b.send({ t: 'list' }); await new Promise(r => setTimeout(r, 100));
    chk('Lobby', a.last.room && !(b.last.lobbies.list || []).some(x => x.name === 'Secret'), 'private room not listed');
    cc.send({ t: 'leave' }); await cc.until(() => cc.last.left);

    // archetypes: first come, first served
    a.send({ t: 'pick', arch: 'Warmonger' }); await a.until(() => a.last.room.players[0].arch === 'Warmonger');
    b.send({ t: 'pick', arch: 'Warmonger' }); await b.until(() => b.errors.length);
    chk('Archetypes', /already took/.test(b.errors.pop()), 'a taken archetype is refused');
    b.send({ t: 'start' }); await new Promise(r => setTimeout(r, 100));
    chk('Archetypes', a.last.room.status === 'lobby', 'only the host can start');
    a.send({ t: 'start' }); await a.until(() => a.errors.length);
    chk('Archetypes', /Everyone needs/.test(a.errors.pop()), 'everyone must pick before starting');
    b.send({ t: 'pick', arch: 'Gardener' }); await a.until(() => a.last.room.players[1].arch === 'Gardener');
    a.send({ t: 'opts', opts: { target: 5000, handSize: 99 } }); await a.until(() => a.last.room.opts.handSize === 10);
    chk('Lobby', a.last.room.opts.target === 999 && a.last.room.opts.handSize === 10, 'host options are clamped');
    a.send({ t: 'start' }); await a.until(() => a.last.state); await b.until(() => b.last.state && b.last.defs);

    // hidden information
    const sa = a.last.state, sb = b.last.state;
    chk('Hidden info', sa.players[1].hand.every(u => sa.cards[u].def === '__hidden' || u === sa.players[1].foundationUid), 'Ann can’t see Bob’s hand');
    chk('Hidden info', sb.players[1].hand.every(u => sb.cards[u].def !== '__hidden') && sb.deck.every(x => x === null) && !sb.defs, 'Bob sees his own hand; no deck order; defs sent separately');

    // turn checks
    b.send({ t: 'act', a: { t: 'startTurn' } }); await b.until(() => b.errors.length);
    chk('Turns', /isn’t your turn/.test(b.errors.pop()), 'acting out of turn is refused');
    b.send({ t: 'act', a: { t: 'sbGive', i: 1, id: 'eureka' } }); await b.until(() => b.errors.length);
    chk('Turns', /can’t do that/.test(b.errors.pop()), 'referee actions are refused');
    a.send({ t: 'act', a: { t: 'startTurn' } }); await a.until(() => a.last.state.turn.started);
    const fu = a.last.state.players[0].foundationUid;
    a.send({ t: 'act', a: { t: 'play', uid: fu, k: '0,0' } }); await b.until(() => b.last.state.board['0,0']);
    chk('Turns', b.last.state.cards[b.last.state.board['0,0'][0]].def === 'warcamp', 'Bob sees Ann’s Foundation placed');
    a.send({ t: 'act', a: { t: 'endTurn' } }); await b.until(() => b.last.state.cur === 1);

    // Bob closes his tab mid-game and doesn't come back: he resigns, Ann wins, stats are saved
    b.ws.close(); await a.until(() => a.last.room.status === 'over', 3000);
    chk('Resign', a.last.state.winner === 0 && a.last.state.log.some(l => /Bob leaves the game/.test(l)), 'a player gone too long resigns');
    const pa = await (await fetch(base + '/api/profile/ann')).json(), pb = await (await fetch(base + '/api/profile/Bob')).json();
    chk('Stats', pa.wins === 1 && pa.losses === 0 && pb.losses === 1 && pb.games === 1, 'win/loss records');
    chk('Stats', pa.archetypes[0].name === 'Warmonger' && pa.archetypes[0].won === 1 && pb.archetypes[0].name === 'Gardener', 'most played archetypes');
    chk('Stats', pa.cards[0] && pa.cards[0].id === 'warcamp' && pa.cards[0].count === 1, 'most played cards');
    chk('Stats', pa.history.length === 1 && pa.history[0].players.length === 2 && pa.history[0].room === 'Test table', 'game history');
    a.send({ t: 'again' }); await a.until(() => a.last.room.status === 'lobby');
    chk('Lobby', a.last.room.players.length === 1, 'host can reopen the room after the game');
    a.ws.close(); cc.ws.close();
  } catch (e) { R.push(['Server', 'FAIL', 'threw ' + e.message + ' ' + (e.stack.split('\n')[1] || '')]); }
  await app.close();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
  chk('Storage', saved.users.ann.stats.games === 1 && !JSON.stringify(saved).includes('secret1'), 'stats saved to disk; no plain-text passwords');
  R.forEach(r => console.log(r[1], '|', r[0], '|', r[2]));
  process.exit(0);
})();
