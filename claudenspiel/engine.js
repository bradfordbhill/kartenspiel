/* Claudenspiel rules engine. Pure state + apply(); no DOM. Works in Node and the browser. */
(function (root) {
  'use strict';
  const SUITS = ['Wood', 'Stone', 'Sea', 'Ember'];
  const GLYPH = { Wood: '❦', Stone: '♜', Sea: '≈', Ember: '✹', Wild: '✦' };
  const MAX_ROUNDS = 18;
  const BOX = 4; // tableau must fit inside a 4x4 window

  const C = {};
  const add = (c) => { C[c.id] = c; return c; };
  // ---- Base cards ----
  add({ id: 'penny', name: 'Penny', type: 'coin', cost: 0, coin: 1, text: '+1 coin when you buy.' });
  add({ id: 'mark', name: 'Mark', type: 'coin', cost: 3, coin: 2, text: '+2 coins when you buy.' });
  add({ id: 'crown', name: 'Crown', type: 'coin', cost: 6, coin: 3, text: '+3 coins when you buy.' });
  add({ id: 'shard', name: 'Shard', type: 'relic', cost: 2, vp: 1, text: '1 VP. Does nothing else.' });
  add({ id: 'idol', name: 'Idol', type: 'relic', cost: 5, vp: 3, text: '3 VP.' });
  add({ id: 'monument', name: 'Monument', type: 'relic', cost: 8, vp: 6, text: '6 VP.' });
  add({ id: 'curse', name: 'Blight', type: 'curse', cost: 0, vp: -1, text: '-1 VP. Clogs your deck.' });

  // ---- House seats (start in your tableau) ----
  add({ id: 'seat-verdant', name: 'Verdant Hall', type: 'seat', suit: 'Wood', cost: 0, text: 'Each turn: +1 coin per 2 Wood tiles (rounded down).' });
  add({ id: 'seat-crypt', name: 'Crypt Gate', type: 'seat', suit: 'Stone', cost: 0, text: 'Whenever you place a tile, draw a card and gain +1 coin.' });
  add({ id: 'seat-tide', name: 'Tide Court', type: 'seat', suit: 'Sea', cost: 0, text: 'Your hand size is 6 while you have 6 or fewer tiles.' });
  add({ id: 'seat-forge', name: 'Ember Forge', type: 'seat', suit: 'Ember', cost: 0, text: 'You may place 2 tiles each turn.' });

  // ---- Tiles ----
  const T = (id, name, suit, cost, o, text) => add(Object.assign({ id, name, type: 'tile', suit, cost, vp: 0, inc: 0, text }, o));
  T('grove', 'Grove', 'Wood', 4, { inc: 1 }, 'Each turn: +1 coin.');
  T('orchard', 'Orchard', 'Wood', 5, { inc: 1, vp: 1 }, 'Each turn: +1 coin. 1 VP.');
  T('elder-oak', 'Elder Oak', 'Wood', 6, { rule: { k: 'suit', suit: 'Wood', n: 1 } }, 'Scores 1 VP per Wood tile you have (counts itself).');
  T('glade', 'Dryad Glade', 'Wood', 4, { place: [{ draw: 2 }] }, 'When placed: draw 2 cards.');
  T('quarry', 'Quarry', 'Stone', 4, { inc: 1 }, 'Each turn: +1 coin.');
  T('watchtower', 'Watchtower', 'Stone', 5, { vp: 2, ward: true }, '2 VP. Ward: Blight attacks against you fail.');
  T('cathedral', 'Cathedral', 'Stone', 7, { rule: { k: 'kinds', n: 1 } }, 'Scores 1 VP per different suit in your tableau.');
  T('catacombs', 'Catacombs', 'Stone', 4, { vp: 1, place: [{ trash: 2 }] }, '1 VP. When placed: trash up to 2 cards from your hand.');
  T('harbor', 'Harbor', 'Sea', 5, { inc: 2 }, 'Each turn: +2 coins.');
  T('lighthouse', 'Lighthouse', 'Sea', 5, { rule: { k: 'adj', n: 1 } }, 'Scores 1 VP per tile orthogonally next to it.');
  T('quay', 'Market Quay', 'Sea', 6, { inc: 1, buy: 1 }, 'Each turn: +1 coin and +1 Buy.');
  T('tidepool', 'Tidepool', 'Sea', 3, { vp: 1, place: [{ coins: 2 }] }, '1 VP. When placed: +2 coins this turn.');
  T('bellows', 'Bellows', 'Ember', 5, { draw: 1 }, 'Your hand size is +1.');
  T('volcano', 'Volcano', 'Ember', 7, { vp: 3, place: [{ curse: true }] }, '3 VP. When placed: each opponent gains a Blight.');
  T('bonfire', 'Bonfire', 'Ember', 4, { place: [{ coins: 3 }], vp: 0 }, 'When placed: +3 coins this turn.');
  T('crucible', 'Crucible', 'Ember', 6, { rule: { k: 'deck', per: 5 } }, 'Scores 1 VP per 5 cards you own (including tiles).');
  T('crossroads', 'Crossroads', 'Wild', 6, { vp: 1 }, '1 VP. Counts as every suit for linking regions.');

  // ---- Events ----
  const E = (id, name, cost, ops, text) => add({ id, name, type: 'event', cost, ops, text });
  E('harvest', 'Harvest', 3, [{ draw: 3 }], 'Draw 3 cards.');
  E('windfall', 'Windfall', 4, [{ coins: 2 }, { buys: 1 }], '+2 coins, +1 Buy.');
  E('caravan', 'Caravan', 5, [{ draw: 2 }, { coins: 2 }], 'Draw 2 cards, +2 coins.');
  E('raid', 'Raid', 5, [{ coins: 2 }, { curse: true }], '+2 coins. Each opponent gains a Blight.');
  E('scavenge', 'Scavenge', 2, [{ trash: 2, coinEach: 1 }], 'Trash up to 2 cards from your hand; +1 coin for each.');
  E('expand', 'Expand', 5, [{ places: 1 }, { draw: 1 }], '+1 Place this turn, draw a card.');
  E('tithe', 'Tithe', 4, [{ coinPerTile: 1 }], '+1 coin per tile in your tableau.');
  E('feast', 'Feast', 4, [{ gain: 4 }], 'Gain a card costing up to 4.');

  const HOUSES = {
    verdant: { id: 'verdant', name: 'House Verdant', suit: 'Wood', seat: 'seat-verdant', blurb: 'Gardeners. Their Wood tiles pay in coin.' },
    crypt: { id: 'crypt', name: 'House Crypt', suit: 'Stone', seat: 'seat-crypt', blurb: 'Keepers of the dead. Building draws cards.' },
    tide: { id: 'tide', name: 'House Tide', suit: 'Sea', seat: 'seat-tide', blurb: 'Merchants. A bigger hand every turn.' },
    forge: { id: 'forge', name: 'House Forge', suit: 'Ember', seat: 'seat-forge', blurb: 'Smiths. Two tiles a turn, thin decks.' },
  };

  const TILE_IDS = Object.keys(C).filter((k) => C[k].type === 'tile');
  const EVENT_IDS = Object.keys(C).filter((k) => C[k].type === 'event');

  function rnd(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(a, s) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function pick(arr, n, s) { return shuffle(arr.slice(), s).slice(0, n); }

  function newGame(opts) {
    opts = opts || {};
    const st = { seed: (opts.seed == null ? 12345 : opts.seed) | 0, players: [], supply: {}, kingdom: [], round: 1, active: 0, over: false, log: [], pending: null, ti: null, winner: null };
    const houses = opts.houses || ['verdant', 'tide'];
    const np = houses.length;
    // Kingdom: 6 tiles (at least one Wild/Stone ward guaranteed variety not forced) + 4 events
    const tiles = opts.tiles || pick(TILE_IDS, 6, st);
    const events = opts.events || pick(EVENT_IDS, 4, st);
    st.kingdom = tiles.concat(events);
    const pile = np <= 2 ? 8 : 10;
    for (const id of st.kingdom) st.supply[id] = pile;
    st.supply.penny = 0; // starting coins are not in the supply
    st.supply.mark = 24; st.supply.crown = 16;
    st.supply.shard = np <= 2 ? 10 : 14; st.supply.idol = pile; st.supply.monument = pile;
    st.supply.curse = (np - 1) * 10;
    delete st.supply.penny;
    houses.forEach((h, i) => {
      const p = { house: h, name: (opts.names && opts.names[i]) || HOUSES[h].name, deck: [], hand: [], discard: [], tab: [{ id: HOUSES[h].seat, x: 0, y: 0 }], trashed: 0 };
      for (let k = 0; k < 7; k++) p.deck.push('penny');
      for (let k = 0; k < 3; k++) p.deck.push('shard');
      shuffle(p.deck, st);
      st.players.push(p);
    });
    st.players.forEach((_, i) => draw(st, i, handSize(st, i)));
    startTurn(st);
    log(st, 'Round 1. ' + st.players[0].name + ' begins.');
    return st;
  }

  function log(st, m) { st.log.push(m); if (st.log.length > 200) st.log.shift(); }

  function draw(st, pi, n) {
    const p = st.players[pi];
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) { if (!p.discard.length) break; p.deck = shuffle(p.discard, st); p.discard = []; }
      p.hand.push(p.deck.pop()); got++;
    }
    return got;
  }

  const tilesOf = (p) => p.tab.map((t) => C[t.id]);
  const countSuit = (p, suit) => tilesOf(p).filter((c) => c.suit === suit).length;
  function handSize(st, pi) {
    const p = st.players[pi];
    let n = 5;
    for (const c of tilesOf(p)) n += c.draw || 0;
    if (p.house === 'tide' && p.tab.length <= 6) n += 1;
    return n;
  }
  function income(st, pi) {
    const p = st.players[pi];
    let n = 0;
    for (const c of tilesOf(p)) n += c.inc || 0;
    if (p.house === 'verdant') n += Math.floor(countSuit(p, 'Wood') / 2);
    return n;
  }
  function startTurn(st) {
    const pi = st.active, p = st.players[pi];
    let buys = 1;
    for (const c of tilesOf(p)) buys += c.buy || 0;
    st.ti = { coins: income(st, pi), spent: 0, buys, places: 1 + (p.house === 'forge' ? 1 : 0), events: 1 };
    st.pending = null;
  }
  function handCoins(p) { return p.hand.reduce((s, id) => s + (C[id].coin || 0), 0); }
  function avail(st) { return st.ti.coins + handCoins(st.players[st.active]) - st.ti.spent; }
  const warded = (p) => tilesOf(p).some((c) => c.ward);

  function cells(p) {
    const occ = new Set(p.tab.map((t) => t.x + ',' + t.y));
    const cand = new Map();
    for (const t of p.tab) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = t.x + dx, y = t.y + dy, k = x + ',' + y;
      if (!occ.has(k)) cand.set(k, { x, y });
    }
    const out = [];
    for (const c of cand.values()) {
      let x0 = c.x, x1 = c.x, y0 = c.y, y1 = c.y;
      for (const t of p.tab) { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
      if (x1 - x0 < BOX && y1 - y0 < BOX) out.push(c);
    }
    return out;
  }

  // ---- Scoring ----
  const REGION = Array.from({ length: 17 }, (_, n) => (n < 2 ? 0 : Math.ceil((n * n) / 6)));
  function regions(p) {
    const res = [];
    for (const suit of SUITS) {
      const mem = p.tab.filter((t) => C[t.id].suit === suit || C[t.id].suit === 'Wild');
      const seen = new Set();
      for (const t of mem) {
        const k = t.x + ',' + t.y;
        if (seen.has(k)) continue;
        const comp = []; const q = [t]; seen.add(k);
        while (q.length) {
          const a = q.pop(); comp.push(a);
          for (const b of mem) {
            const kb = b.x + ',' + b.y;
            if (!seen.has(kb) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1) { seen.add(kb); q.push(b); }
          }
        }
        if (comp.length > 1) res.push({ suit, size: comp.length, vp: REGION[Math.min(comp.length, 16)], cells: comp.map((c) => c.x + ',' + c.y) });
      }
    }
    return res;
  }
  function score(st, pi) {
    const p = st.players[pi];
    const owned = p.deck.concat(p.hand, p.discard);
    const b = { relics: 0, curses: 0, tiles: 0, rules: 0, regions: 0, total: 0, groups: [] };
    for (const id of owned) { const c = C[id]; if (c.type === 'relic') b.relics += c.vp; else if (c.type === 'curse') b.curses += c.vp; }
    const total = owned.length + p.tab.length;
    const tiles = p.tab;
    for (const t of tiles) {
      const c = C[t.id];
      b.tiles += c.vp || 0;
      if (c.rule) {
        const r = c.rule;
        if (r.k === 'suit') b.rules += r.n * tilesOf(p).filter((x) => x.suit === r.suit || x.suit === 'Wild').length;
        else if (r.k === 'kinds') b.rules += r.n * new Set(tilesOf(p).map((x) => x.suit).filter((s) => s !== 'Wild')).size;
        else if (r.k === 'adj') b.rules += r.n * tiles.filter((o) => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1).length;
        else if (r.k === 'deck') b.rules += Math.floor(total / r.per);
      }
    }
    b.groups = regions(p);
    b.regions = b.groups.reduce((s, g) => s + g.vp, 0);
    b.total = b.relics + b.curses + b.tiles + b.rules + b.regions;
    return b;
  }

  // ---- Effects ----
  function runOps(st, pi, ops) {
    const p = st.players[pi];
    for (const op of ops) {
      if (op.draw) { const n = draw(st, pi, op.draw); log(st, p.name + ' draws ' + n + '.'); }
      if (op.coins) { st.ti.coins += op.coins; log(st, p.name + ' gains +' + op.coins + ' coins.'); }
      if (op.buys) st.ti.buys += op.buys;
      if (op.places) st.ti.places += op.places;
      if (op.coinPerTile) { st.ti.coins += op.coinPerTile * p.tab.length; log(st, p.name + ' gains +' + op.coinPerTile * p.tab.length + ' coins.'); }
      if (op.curse) {
        st.players.forEach((q, qi) => {
          if (qi === pi) return;
          if (warded(q)) { log(st, q.name + "'s Watchtower wards off the Blight."); return; }
          if (st.supply.curse > 0) { st.supply.curse--; q.discard.push('curse'); log(st, q.name + ' gains a Blight.'); }
        });
      }
      if (op.trash) st.pending = { kind: 'trash', max: op.trash, coinEach: op.coinEach || 0 };
      if (op.gain) st.pending = { kind: 'gain', max: op.gain };
    }
  }

  function legalPlace(st, hi, x, y) {
    const p = st.players[st.active];
    const id = p.hand[hi];
    if (id == null || C[id].type !== 'tile') return false;
    return cells(p).some((c) => c.x === x && c.y === y);
  }

  // Returns null on success or an error string.
  function apply(st, a) {
    if (st.over) return 'Game over';
    const pi = st.active, p = st.players[pi], ti = st.ti;
    if (st.pending) {
      const pd = st.pending;
      if (pd.kind === 'trash' && a.t === 'trash') {
        const idxs = Array.from(new Set(a.idxs || [])).sort((x, y) => y - x);
        if (idxs.length > pd.max) return 'Too many';
        if (idxs.some((i) => i < 0 || i >= p.hand.length)) return 'Bad card';
        const lost = idxs.reduce((s, i) => s + (C[p.hand[i]].coin || 0), 0);
        if (avail(st) - lost < 0) return 'You have already spent those coins';
        for (const i of idxs) { log(st, p.name + ' trashes ' + C[p.hand[i]].name + '.'); p.hand.splice(i, 1); p.trashed++; }
        ti.coins += pd.coinEach * idxs.length;
        st.pending = null; return null;
      }
      if (pd.kind === 'gain' && a.t === 'gain') {
        if (a.id == null) { st.pending = null; return null; }
        if (!st.supply[a.id] || C[a.id].cost > pd.max || C[a.id].type === 'curse') return 'Cannot gain that';
        st.supply[a.id]--; p.discard.push(a.id); log(st, p.name + ' gains ' + C[a.id].name + '.');
        st.pending = null; return null;
      }
      return 'Resolve the pending choice first';
    }
    if (a.t === 'place') {
      if (ti.places < 1) return 'No placements left';
      if (!legalPlace(st, a.i, a.x, a.y)) return 'Illegal placement';
      const id = p.hand.splice(a.i, 1)[0];
      p.tab.push({ id, x: a.x, y: a.y }); ti.places--;
      log(st, p.name + ' places ' + C[id].name + '.');
      if (p.house === 'crypt') { draw(st, pi, 1); ti.coins++; }
      if (C[id].place) runOps(st, pi, C[id].place);
      return null;
    }
    if (a.t === 'event') {
      const id = p.hand[a.i];
      if (id == null || C[id].type !== 'event') return 'Not an event';
      if (ti.events < 1) return 'One event per turn';
      p.hand.splice(a.i, 1); p.discard.push(id); ti.events--;
      log(st, p.name + ' plays ' + C[id].name + '.');
      runOps(st, pi, C[id].ops);
      return null;
    }
    if (a.t === 'buy') {
      const c = C[a.id];
      if (!c || !st.supply[a.id]) return 'Pile empty';
      if (c.type === 'curse') return 'Cannot buy that';
      if (ti.buys < 1) return 'No buys left';
      if (avail(st) < c.cost) return 'Not enough coins';
      ti.spent += c.cost; ti.buys--; st.supply[a.id]--; p.discard.push(a.id);
      log(st, p.name + ' buys ' + c.name + '.');
      return null;
    }
    if (a.t === 'end') { endTurn(st); return null; }
    return 'Unknown action';
  }

  function emptyPiles(st) { return st.kingdom.filter((id) => st.supply[id] === 0).length; }

  function endTurn(st) {
    const pi = st.active, p = st.players[pi];
    p.discard.push(...p.hand); p.hand = [];
    draw(st, pi, handSize(st, pi));
    if (pi === st.players.length - 1) {
      if (emptyPiles(st) >= 3 || st.supply.monument === 0 || st.round >= MAX_ROUNDS) return finish(st);
      st.round++;
    }
    st.active = (pi + 1) % st.players.length;
    startTurn(st);
    if (st.active === 0) log(st, 'Round ' + st.round + '.');
  }

  function finish(st) {
    st.over = true;
    const sc = st.players.map((_, i) => score(st, i).total);
    const best = Math.max(...sc);
    const top = sc.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    // Tiebreak: more tiles in tableau, then shared
    let w = top;
    const mt = Math.max(...top.map((i) => st.players[i].tab.length));
    w = top.filter((i) => st.players[i].tab.length === mt);
    st.winner = w.length === 1 ? w[0] : -1;
    log(st, 'Game over. ' + (st.winner >= 0 ? st.players[st.winner].name + ' wins' : 'A shared victory') + ' ' + sc.join(' – ') + '.');
  }

  function legalActions(st) {
    const out = [], p = st.players[st.active];
    if (st.over) return out;
    if (st.pending) {
      if (st.pending.kind === 'trash') {
        out.push({ t: 'trash', idxs: [] });
        const idx = p.hand.map((_, i) => i);
        for (const i of idx) out.push({ t: 'trash', idxs: [i] });
      } else {
        out.push({ t: 'gain', id: null });
        for (const id of st.kingdom.concat(['mark', 'shard'])) if (st.supply[id] > 0 && C[id].cost <= st.pending.max) out.push({ t: 'gain', id });
      }
      return out;
    }
    if (st.ti.places > 0) {
      const cs = cells(p);
      p.hand.forEach((id, i) => { if (C[id].type === 'tile') for (const c of cs) out.push({ t: 'place', i, x: c.x, y: c.y }); });
    }
    if (st.ti.events > 0) p.hand.forEach((id, i) => { if (C[id].type === 'event') out.push({ t: 'event', i }); });
    if (st.ti.buys > 0) {
      const av = avail(st);
      for (const id of Object.keys(st.supply)) if (st.supply[id] > 0 && C[id].type !== 'curse' && C[id].cost <= av) out.push({ t: 'buy', id });
    }
    out.push({ t: 'end' });
    return out;
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const api = { C, SUITS, GLYPH, HOUSES, TILE_IDS, EVENT_IDS, MAX_ROUNDS, BOX, newGame, apply, legalActions, legalPlace, cells, score, regions, avail, handCoins, handSize, income, emptyPiles, clone, draw, tilesOf, REGION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Claudenspiel = api;
})(typeof window !== 'undefined' ? window : globalThis);
