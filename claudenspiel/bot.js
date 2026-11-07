/* Claudenspiel bots. 'builder' weighs tableau; 'money' is a Big-Money baseline; 'balanced' mixes. */
(function (root) {
  'use strict';
  const K = typeof require !== 'undefined' ? require('./engine.js') : root.Claudenspiel;
  const C = K.C;

  function progress(st) {
    return Math.min(1, Math.max(st.round / K.MAX_ROUNDS, K.emptyPiles(st) / 3, 1 - st.supply.monument / (st.players.length <= 2 ? 8 : 10) > 0.6 ? 0.8 : 0));
  }
  const ownedCount = (p, id) => p.deck.concat(p.hand, p.discard).filter((x) => x === id).length + p.tab.filter((t) => t.id === id).length;

  function bestPlace(st, pi, id, extra) {
    const p = st.players[pi];
    const base = K.score(st, pi).total;
    let best = null;
    for (const c of K.cells(p)) {
      p.tab.push({ id, x: c.x, y: c.y });
      const d = K.score(st, pi).total - base;
      p.tab.pop();
      if (!best || d > best.d) best = { d, x: c.x, y: c.y };
    }
    return best;
  }
  function tileWorth(st, pi, id, prof, prog) {
    const c = C[id], best = bestPlace(st, pi, id);
    if (!best) return { v: -9 };
    const left = Math.max(1, K.MAX_ROUNDS - st.round);
    const eff = Math.min(left, 8);
    let v = best.d;
    v += (c.inc || 0) * eff * 0.3 + (c.buy || 0) * 0.5 + (c.draw || 0) * eff * 0.35;
    if (c.place) for (const op of c.place) { if (op.draw) v += op.draw * 0.6; if (op.coins) v += op.coins * 0.3; if (op.curse) v += 1.2; if (op.trash) v += 0.8 * (1 - prog); }
    if (c.ward) v += 0.8;
    v *= prof.tile;
    // tiles leave the deck: mild penalty late when they can't be placed in time
    return { v, best };
  }
  function eventWorth(id, p, prog) {
    const n = ownedCount(p, id);
    const base = { harvest: 1.6, windfall: 1.2, caravan: 2.2, raid: 2.2, scavenge: 1.2, expand: 1.4, tithe: 1.6, feast: 1.2 }[id] || 1;
    return (base * (1 - prog * 0.6)) / (1 + n * 1.1);
  }
  function buyValue(st, pi, id, prof, prog) {
    const c = C[id], p = st.players[pi];
    if (c.type === 'coin') return id === 'mark' ? 2.0 - prog * 1.6 : 3.3 - prog * 2.0;
    if (c.type === 'relic') {
      if (id === 'monument') return 6.5 * (0.4 + 0.6 * prog) * prof.vp;
      if (id === 'idol') return 3.2 * prog * 1.1 * prof.vp - 0.2;
      return prog > 0.8 ? 1.0 * prof.vp * (prog - 0.6) * 3 : -1;
    }
    if (c.type === 'event') return eventWorth(id, p, prog) * prof.event;
    if (c.type === 'tile') {
      // diminishing returns for a stacked tableau
      if (p.tab.length + p.hand.filter((h) => C[h].type === 'tile').length >= 14) return -1;
      return tileWorth(st, pi, id, prof, prog).v;
    }
    return -1;
  }
  const PROFS = {
    builder: { tile: 1.25, vp: 1.0, event: 1.0 },
    balanced: { tile: 1.0, vp: 1.0, event: 1.0 },
    money: { tile: 0.0, vp: 1.0, event: 0.0 },
  };

  function choose(st, kind) {
    const prof = PROFS[kind || 'balanced'], pi = st.active, p = st.players[pi];
    const prog = progress(st);
    if (st.pending) {
      if (st.pending.kind === 'trash') {
        const idxs = [];
        p.hand.forEach((id, i) => {
          const c = C[id];
          if (id === 'curse' || (id === 'shard' && prog < 0.7 && false)) idxs.push(i);
          else if (id === 'penny' && prog < 0.6 && p.deck.length + p.discard.length > 8) idxs.push(i);
        });
        // never trash coins we still want to spend: keep at least what we need for our best affordable buy
        const out = [];
        let av = K.avail(st);
        for (const i of idxs.slice(0, st.pending.max)) {
          const c = C[p.hand[i]].coin || 0;
          if (av - c >= 5 || p.hand[i] === 'curse' || st.pending.coinEach) { out.push(i); av -= c; }
        }
        return { t: 'trash', idxs: out };
      }
      let bestId = null, bv = 0;
      for (const id of st.kingdom.concat(['mark'])) {
        if (!st.supply[id] || C[id].cost > st.pending.max) continue;
        const v = buyValue(st, pi, id, prof, prog);
        if (v > bv) { bv = v; bestId = id; }
      }
      return { t: 'gain', id: bestId };
    }
    // 1. place tiles
    if (st.ti.places > 0 && prof.tile > 0) {
      let best = null;
      p.hand.forEach((id, i) => {
        if (C[id].type !== 'tile') return;
        const w = tileWorth(st, pi, id, prof, prog);
        if (w.best && w.v > 0.3 && (!best || w.v > best.v)) best = { v: w.v, a: { t: 'place', i, x: w.best.x, y: w.best.y } };
      });
      if (best) return best.a;
    }
    // 2. events (draw/trash first, coin-producers any time)
    if (st.ti.events > 0 && prof.event > 0) {
      const evs = p.hand.map((id, i) => ({ id, i })).filter((o) => C[o.id].type === 'event');
      const order = ['expand', 'harvest', 'caravan', 'scavenge', 'tithe', 'windfall', 'raid', 'feast'];
      evs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const o of evs) {
        if (o.id === 'expand' && !p.hand.some((h) => C[h].type === 'tile')) continue;
        if (o.id === 'scavenge' && !p.hand.some((h) => h === 'curse' || h === 'penny')) continue;
        return { t: 'event', i: o.i };
      }
    }
    // 3. buy
    if (st.ti.buys > 0) {
      const av = K.avail(st);
      let best = null;
      for (const id of Object.keys(st.supply)) {
        if (!st.supply[id] || C[id].type === 'curse' || C[id].cost > av) continue;
        if (prof.tile === 0 && C[id].type === 'tile') continue;
        let v = buyValue(st, pi, id, prof, prog);
        v += C[id].cost * 0.02;
        if (v > 0.5 && (!best || v > best.v)) best = { v, id };
      }
      if (best) return { t: 'buy', id: best.id };
    }
    return { t: 'end' };
  }
  const api = { choose, PROFS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ClaudenBot = api;
})(typeof window !== 'undefined' ? window : globalThis);
