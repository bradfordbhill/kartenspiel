/* Player accounts and stats, kept in one JSON file (DATA_DIR/db.json, default server/data/).
   Writes are batched and atomic (write a temp file, then rename), so a crash never leaves a half-written file. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const HISTORY_KEEP = 30;

function open(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let db = { users: {}, tokens: {} };
  if (fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
  let timer = null;

  function save() {
    if (timer) return;
    timer = setTimeout(flush, 200);
  }
  function flush() {
    clearTimeout(timer); timer = null;
    fs.writeFileSync(file + '.tmp', JSON.stringify(db));
    fs.renameSync(file + '.tmp', file);
  }

  function hash(password, salt) {
    return new Promise((res, rej) => crypto.scrypt(password, salt, 32, (e, k) => e ? rej(e) : res(k.toString('hex'))));
  }
  const TOKENS_KEEP = 20;   // sessions per account; signing in again past this ends the oldest
  function newToken(name) {
    const t = crypto.randomBytes(24).toString('hex');
    db.tokens[t] = { name, at: Date.now() };
    const mine = Object.keys(db.tokens).filter(k => db.tokens[k].name === name).sort((a, b) => db.tokens[a].at - db.tokens[b].at);
    mine.slice(0, Math.max(0, mine.length - TOKENS_KEEP)).forEach(k => { delete db.tokens[k]; });
    save(); return t;
  }
  function blankStats() { return { games: 0, wins: 0, losses: 0, arch: {}, cards: {}, history: [] }; }

  return {
    flush,
    // Usernames are unique ignoring case; the account keeps the spelling it was created with.
    async register(name, password) {
      const key = name.toLowerCase();
      if (db.users[key]) throw new Error('That name is taken.');
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[key] = { name, salt, hash: await hash(password, salt), created: Date.now(), stats: blankStats() };
      return { name, token: newToken(name) };
    },
    async login(name, password) {
      const u = db.users[String(name).toLowerCase()];
      const h = u ? await hash(password, u.salt) : null;
      if (!u || !crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) throw new Error('Wrong name or password.');
      return { name: u.name, token: newToken(u.name) };
    },
    logout(token) { delete db.tokens[token]; save(); },
    // The account name for a session token, or null.
    who(token) { const t = token && db.tokens[token]; return t && db.users[t.name.toLowerCase()] ? t.name : null; },
    user(name) { return db.users[String(name).toLowerCase()] || null; },

    // Add one finished game to every player's stats. `game` is { id, date, room, rounds, players: [{ name, arch, score, won, plays: {cardId: n} }] }.
    recordGame(game) {
      const summary = { id: game.id, date: game.date, room: game.room, rounds: game.rounds,
        players: game.players.map(p => ({ name: p.name, arch: p.arch, score: p.score, won: p.won })) };
      game.players.forEach(p => {
        const u = db.users[p.name.toLowerCase()]; if (!u) return;
        const s = u.stats;
        s.games++; if (p.won) s.wins++; else s.losses++;
        const a = s.arch[p.arch] = s.arch[p.arch] || { played: 0, won: 0 };
        a.played++; if (p.won) a.won++;
        Object.keys(p.plays || {}).forEach(id => { s.cards[id] = (s.cards[id] || 0) + p.plays[id]; });
        s.history.unshift(summary); s.history.length = Math.min(s.history.length, HISTORY_KEEP);
      });
      save();
    }
  };
}

module.exports = { open };
