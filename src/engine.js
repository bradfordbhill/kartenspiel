/* Kartenspiel rules engine.
   Pure: apply(state, action) mutates a deep clone and returns it. No DOM.
   Every player decision is a `pending` object in state, answered with an
   {t:'answer'} action, so the same engine can later run on a server.

   Shorthand used throughout:
     st        the whole game state (plain JSON, so it can be saved and undone)
     uid / u   one physical card, e.g. "c12"; st.cards[uid] holds its in-play state
     def       a card definition from the library; st.defs[id]
     k         a board cell key "x,y"; st.board[k] is the stack of uids there
     p         a player index into st.players
     ●         Aktion points (AP), spent to play cards
     ◇         victory points (VP)
     claimants the players with a meeple on a card, i.e. its owners
     res       the card effect currently resolving (see "effect resolution") */
var KEngine = (function () {
  // Cells are "x,y" strings. x grows east, y grows south (north is up).
  var DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var SUITS = ['Sceptre', 'Goblet', 'Sword', 'Bone', 'Leaf', 'Tome'];

  // K / XY convert between [x, y] and the "x,y" key used by st.board.
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function K(x, y) { return x + ',' + y; }
  function XY(k) { var a = k.split(','); return [+a[0], +a[1]]; }
  // Seeded shuffle (uses st.seed), so the same seed always deals the same game.
  function shuffle(a, st) {
    for (var i = a.length - 1; i > 0; i--) {
      st.seed = (st.seed * 1103515245 + 12345) % 2147483648;
      var j = st.seed % (i + 1); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function log(st, msg) { st.log.push(msg); if (st.log.length > 400) st.log.shift(); }

  /* ---------- lookups ---------- */
  // rawDef: the card's printed definition.
  // def: the same, except a card copying another (Topiary) takes the copied card's rules.
  function rawDef(st, uid) { return st.defs[st.cards[uid].def]; }
  function def(st, uid) {
    var c = st.cards[uid], d = st.defs[c.def];
    if (c.copyOf && st.defs[c.copyOf]) {
      var o = st.defs[c.copyOf], m = clone(o);
      m.id = d.id; m.name = d.name + ' (as ' + o.name + ')'; m.suit = d.suit; m.cost = d.cost; m.type = d.type;
      m.onPlay = []; m.place = d.place;
      return m;
    }
    return d;
  }
  // Effects can change a card's suit (stored on the card); otherwise it is the printed suit.
  function suitOf(st, uid) { var c = st.cards[uid]; return c.suit || rawDef(st, uid).suit; }
  // an Ascended card counts as every suit
  function hasSuit(st, uid, s) { var c = st.cards[uid]; return !!(c && c.ascended && !c.ruined) || suitOf(st, uid) === s; }
  function suitsOf(st, uid) { var c = st.cards[uid]; return c.ascended && !c.ruined ? SUITS.slice() : [suitOf(st, uid)]; }
  // How many cards buried at k share the top card's suit.
  function onSuitBuried(st, k) { var s = st.board[k], u = s && s[0]; if (!u) return 0; var t = suitOf(st, u); return s.slice(1).filter(function (x) { return suitOf(st, x) === t; }).length; }
  // st.board[k] is a stack: [0] is the visible top card, the rest are buried under it.
  function top(st, k) { var s = st.board[k]; return s && s.length ? s[0] : null; }
  function keys(st) { return Object.keys(st.board).filter(function (k) { return st.board[k] && st.board[k].length; }); }
  // Neighbouring cells: n4 = the 4 orthogonal ones, n8 = those plus the diagonals.
  function n4(k) { var p = XY(k); return ['N', 'E', 'S', 'W'].map(function (d) { return K(p[0] + DIRS[d][0], p[1] + DIRS[d][1]); }); }
  function n8(k) { var p = XY(k); return n4(k).concat(DIAG.map(function (d) { return K(p[0] + d[0], p[1] + d[1]); })); }
  function cellOf(st, uid) { var ks = keys(st); for (var i = 0; i < ks.length; i++) if (st.board[ks[i]][0] === uid) return ks[i]; return null; }
  function isFoundation(st, uid) { return rawDef(st, uid).type === 'Foundation'; }
  function owners(st, k) { var u = top(st, k); return u ? st.cards[u].claimants : []; }
  // Does player p own the card at k? Ruined or covered cards belong to no one.
  function ownedBy(st, k, p) {
    var u = top(st, k); if (!u) return false; var c = st.cards[u]; if (c.ruined || isCovered(st, k)) return false;
    if (c.claimants.indexOf(p) >= 0) return true;
    var m = rawDef(st, u).mods || {}; return !!(m.kingdomOf && st.players[p] && st.players[p].arch === m.kingdomOf);
  }
  function mods(st, uid) { return def(st, uid).mods || {}; }
  // Foundations and immune cards (The Wise Old Tree) can never be targeted by card effects
  function untargetable(st, uid) { return isFoundation(st, uid) || !!(rawDef(st, uid).mods || {}).immune || !!(st.cards[uid] && st.cards[uid].ascended); }
  function unburiable(st, uid) { var m = rawDef(st, uid).mods || {}; return untargetable(st, uid) || !!m.unburiable; }
  // Foundations, Curses and kingdomOf cards (The Wise Old Tree) never take meeples.
  function unclaimable(st, uid) { var d = def(st, uid); return d.type === 'Foundation' || d.type === 'Curse' || !!(d.mods && d.mods.kingdomOf); }
  // A player's Kingdom: every cell whose top card they own.
  function kingdom(st, p) { return keys(st).filter(function (k) { return ownedBy(st, k, p); }); }
  // Curses have two modes: "under" (tucked beneath the target) and "top" (covers it, like Sarcophagus).
  function curseCardsUnder(st, k) {
    return (st.board[k] || []).slice(1).filter(function (u) { var d = rawDef(st, u); return d.curse && d.curse.mode === 'under'; });
  }
  function isCovered(st, k) { var u = top(st, k); if (!u) return false; var d = rawDef(st, u); return d.type === 'Curse' && d.curse && d.curse.mode === 'top' && st.board[k].length > 1; }
  function isCursed(st, k) { return curseCardsUnder(st, k).length > 0 || isCovered(st, k); }
  // Standard Bearer buried in a stack protects it from Ruin and Overwhelm.
  function protectedStack(st, k) { var s = st.board[k]; return !!s && s.slice(1).some(function (x) { var m = rawDef(st, x).mods || {}; return m.burialEffect && m.burialEffect.protect; }); }
  // Cards with a burialEffect (Flowers, Eye for an Eye, Standard Bearer) boost whatever they are buried under.
  function onBuried(st, u, k) {
    var m = (rawDef(st, u).mods || {}).burialEffect, t = top(st, k); if (!m || !t) return;
    var c = st.cards[t], nm = rawDef(st, t).name;
    if (m.ap) { c.apBonus = (c.apBonus || 0) + m.ap; log(st, nm + ' now produces ' + m.ap + '● more per turn, permanently (' + rawDef(st, u).name + ').'); }
    if (m.vp) { c.vpBonus = (c.vpBonus || 0) + m.vp; log(st, nm + ' is now worth ' + m.vp + '◇ more, permanently (' + rawDef(st, u).name + ').'); }
    if (m.protect) log(st, nm + ' cannot be Ruined or Overwhelmed while ' + rawDef(st, u).name + ' stays buried under it.');
  }
  // With the weak-to rule on, a player can't use a reaction card of their weak suit.
  function canReact(st, q, uid) { var a = archInfo(st)[st.players[q].arch]; return !(st.opts.enforceWeak && a && a.weakTo === rawDef(st, uid).suit); }
  // Number of Curses with effect e tucked under the stack at k.
  function curseFx(st, k, e) { return curseCardsUnder(st, k).filter(function (u) { return rawDef(st, u).curse.effect === e; }).length; }
  // Extra cost to place at k from "tax" Curses (Eye of Newt): 3● each.
  function taxAt(st, k) { var n = 0; keys(st).forEach(function (x) { curseCardsUnder(st, x).forEach(function (u) { var c = st.cards[u]; if (rawDef(st, u).curse.effect === 'tax' && c.taxCells && c.taxCells.indexOf(k) >= 0) n++; }); }); return n * 3; }
  function noIncome(st, k) { return curseCardsUnder(st, k).some(function (u) { return rawDef(st, u).curse.effect === 'noIncome'; }); }
  // A card works only if it is on top, not Ruined and not covered by a Curse.
  function active(st, k) { var u = top(st, k); return u && !st.cards[u].ruined && !isCovered(st, k); }

  // Archetype table, read off the Foundation cards: name -> { foundation id, suit, weakTo }.
  function archInfo(st) {
    var a = {};
    Object.keys(st.defs).forEach(function (id) { var d = st.defs[id]; if (d.type === 'Foundation' && d.archetype) a[d.archetype] = { foundation: id, suit: d.suit, weakTo: d.weakTo }; });
    return a;
  }
  // Suits that count against a card for Overwhelm: its archetype's weak suit, plus Sword (except for Sword cards).
  function enemies(st, suit) {
    var a = archInfo(st), out = [];
    Object.keys(a).forEach(function (n) { if (a[n].suit === suit && a[n].weakTo) out.push(a[n].weakTo); });
    if (suit !== 'Sword') out.push('Sword');
    return out.filter(function (s, i) { return out.indexOf(s) === i; });
  }

  /* ---------- deck ---------- */
  // Draw for player p, shuffling the discard pile back in when the deck runs out.
  function drawOne(st, p) {
    if (!st.deck.length && st.discard.length) { st.deck = shuffle(st.discard, st); st.discard = []; log(st, 'Discard pile shuffled into the deck.'); }
    if (!st.deck.length) return null;
    var u = st.deck.shift(); st.players[p].hand.push(u); return u;
  }
  function draw(st, p, n) { var got = 0; for (var i = 0; i < n; i++) if (drawOne(st, p)) got++; return got; }
  // Wipe a card's in-play state and put it on the discard pile.
  function toDiscard(st, uid) { var c = st.cards[uid]; c.banked = {}; c.free = null; c.ruined = false; c.suit = null; c.claimants = []; c.tokens = 0; c.copyOf = null; st.discard.push(uid); }
  // bank ◇ tokens for player p, remembering which card they came from (for the VP overlay)
  function bank(st, p, amt, uid) {
    if (!amt || !st.players[p]) return; st.players[p].tokens += amt;
    if (uid && st.cards[uid]) { var c = st.cards[uid]; c.banked = c.banked || {}; c.banked[p] = (c.banked[p] || 0) + amt; }
  }
  // Cards in hand that can be discarded: everything except the Foundation.
  function discardable(st, p) { return st.players[p].hand.filter(function (u) { return rawDef(st, u).type !== 'Foundation'; }); }
  function removeFromHand(st, p, uid) { var h = st.players[p].hand, i = h.indexOf(uid); if (i >= 0) h.splice(i, 1); return i >= 0; }

  /* ---------- scoring ---------- */
  // Full ◇ value of the card at k for player p: base value, Ascension and permanent bonuses, then halving Curses.
  function cardValue(st, k, p) {
    var u0 = top(st, k), v = cardValue0(st, k, p) + (u0 && st.cards[u0].ascended && !st.cards[u0].ruined ? 8 : 0) + (u0 && !st.cards[u0].ruined ? st.cards[u0].vpBonus || 0 : 0);
    for (var h = curseFx(st, k, 'halveValue'); h > 0; h--) v = Math.floor(v / 2);
    return v;
  }
  // Base ◇ value from the card's `score` rule. Each `kind` is one scoring formula;
  // the card builder's labels for them are SCORE_KINDS in ui.js.
  function cardValue0(st, k, p) {
    var u = top(st, k), c = st.cards[u], d = def(st, u), s = d.score || { kind: 'none' }, n = +s.n || 0, m = +s.m || 0;
    if (c.ruined || isCovered(st, k)) return 0;
    var nb = n4(k), cnt;
    switch (s.kind) {
      case 'flat': return n;
      case 'perAdjacentSuit': return n * nb.filter(function (x) { var t = top(st, x); return t && hasSuit(st, t, s.suit); }).length;
      case 'perSurroundOpp': return n * n8(k).filter(function (x) { var t = top(st, x); return t && !st.cards[t].ruined && st.cards[t].claimants.length && st.cards[t].claimants.indexOf(p) < 0; }).length;
      case 'perAdjOrBuriedSuit': return n * (nb.filter(function (x) { var t = top(st, x); return t && hasSuit(st, t, s.suit); }).length + st.board[k].slice(1).filter(function (x) { return suitOf(st, x) === s.suit; }).length);
      case 'perAdjOrBuriedOtherSuit': { var me = suitOf(st, top(st, k)); return n * (nb.filter(function (x) { var t = top(st, x); return t && suitOf(st, t) !== me; }).length + st.board[k].slice(1).filter(function (x) { return suitOf(st, x) !== me; }).length); }
      case 'perSuitInKingdom': return n * kingdom(st, p).filter(function (x) { return hasSuit(st, top(st, x), s.suit); }).length;
      case 'perSuitSplit':
        var kd = kingdom(st, p);
        cnt = keys(st).filter(function (x) { return hasSuit(st, top(st, x), s.suit); });
        var inK = cnt.filter(function (x) { return kd.indexOf(x) >= 0; }).length;
        return n * inK + m * (cnt.length - inK);
      case 'perBuriedInKingdom': return n * kingdom(st, p).reduce(function (a, x) { return a + st.board[x].length - 1; }, 0);
      case 'perDistinctSuitInKingdom':
        var ss = {}; kingdom(st, p).forEach(function (x) { suitsOf(st, top(st, x)).forEach(function (q) { ss[q] = 1; }); }); return n * Object.keys(ss).length;
      case 'largestRegion': return n * largestRegion(st, p);
      case 'perCardNorth': return n * northKeys(st, k).length;
      case 'flatDoubledIfSurrounded': return nb.every(function (x) { return top(st, x); }) ? n * 2 : n;
      case 'flatMinusPerAdjacentNotOwned':
        return n - m * nb.filter(function (x) { var t = top(st, x); if (!t) return false; var cl = st.cards[t].claimants; return !c.claimants.some(function (o) { return cl.indexOf(o) >= 0; }); }).length;
      case 'flatMinusPerExtraClaimant': return n - m * Math.max(0, c.claimants.length - 1);
      case 'flatPlusTokens': return n + (c.tokens || 0);
      default: return 0;
    }
  }
  // Occupied cells north of k in the same column.
  function northKeys(st, k) { var p = XY(k); return keys(st).filter(function (x) { var q = XY(x); return q[0] === p[0] && q[1] < p[1]; }); }
  // Size of the largest connected group of cells in p's Kingdom (flood fill).
  function largestRegion(st, p) {
    var kd = kingdom(st, p), seen = {}, best = 0;
    kd.forEach(function (s) {
      if (seen[s]) return; var q = [s], size = 0; seen[s] = 1;
      while (q.length) { var x = q.pop(); size++; n4(x).forEach(function (y) { if (!seen[y] && kd.indexOf(y) >= 0) { seen[y] = 1; q.push(y); } }); }
      if (size > best) best = size;
    });
    return best;
  }
  // Extra ◇ for k from active northBonus cards south of it in the same column: n per card in k's stack.
  function volcanicBonus(st, k) {
    var p = XY(k), b = 0;
    keys(st).forEach(function (x) {
      if (!active(st, x)) return; var d = def(st, top(st, x)); if (!d.mods || !d.mods.northBonus) return;
      var q = XY(x); if (q[0] === p[0] && p[1] < q[1]) b += d.mods.northBonus * st.board[k].length;
    });
    return b;
  }
  // split a card's worth to player p into its own value and tokens (tokens on the card + ◇ banked through it)
  function valueParts(st, k, p) {
    var u = top(st, k), c = st.cards[u], d = def(st, u);
    var v = cardValue(st, k, p) + volcanicBonus(st, k);
    var cardTok = d.score && d.score.kind === 'flatPlusTokens' && !c.ruined ? (c.tokens || 0) : 0;
    var banked = (c.banked && c.banked[p]) || 0;
    return { base: v - cardTok, cardTok: cardTok, banked: banked, tokens: cardTok + banked };
  }
  function bankedBreakdown(st, p) {
    var by = {}, attributed = 0;
    Object.keys(st.cards).forEach(function (u) { var c = st.cards[u]; var n = c.banked && c.banked[p]; if (n) { var nm = rawDef(st, u).name; by[nm] = (by[nm] || 0) + n; attributed += n; } });
    return { by: by, other: st.players[p].tokens - attributed };
  }
  // Every player's score: card values across their Kingdom plus banked ◇ tokens.
  function scores(st) {
    return st.players.map(function (pl, p) {
      var rows = kingdom(st, p).map(function (k) { var v = cardValue(st, k, p) + volcanicBonus(st, k); return { k: k, v: v }; });
      var cards = rows.reduce(function (a, r) { return a + r.v; }, 0);
      return { cards: cards, tokens: pl.tokens, total: cards + pl.tokens, rows: rows };
    });
  }
  // ● available = this turn's ● plus Reserves (Warcamp). spend() uses ● first, then Reserves.
  function funds(pl) { return (pl.ap || 0) + (pl.reserve || 0); }
  function spend(pl, n) { var a = Math.min(pl.ap || 0, n); pl.ap -= a; pl.reserve = (pl.reserve || 0) - (n - a); }
  // ● a player gets at the start of each turn. A flat 3 until their Foundation is down.
  function income(st, p) {
    var pl = st.players[p];
    if (!pl.foundationPlaced) return 3;
    return kingdom(st, p).reduce(function (a, k) { return a + cardIncome(st, k); }, 0);
  }
  // ● one card produces per turn: printed income, tokens, Ascension and bonuses, adjusted by Curses.
  function cardIncome(st, k) {
    if (!active(st, k) || noIncome(st, k)) return 0;
    var u = top(st, k), d = def(st, u);
    var inc = (+d.income || 0) + (+d.incomePerToken || 0) * (st.cards[u].tokens || 0) + (st.cards[u].ascended ? 12 : 0) + (st.cards[u].apBonus || 0) + 3 * curseFx(st, k, 'intoxicate');
    for (var h = curseFx(st, k, 'halveIncome'); h > 0; h--) inc = Math.ceil(inc / 2);
    return inc;
  }

  /* ---------- placement ---------- */
  // Why player p can't play this card at all, as a message, or null if they can.
  function playBlock(st, p, uid) {
    var d = rawDef(st, uid), pl = st.players[p], a = archInfo(st)[pl.arch];
    if (st.opts.sandbox) return null;
    if (d.type === 'Foundation' && d.id !== (a && a.foundation)) return 'This is not your Foundation.';
    if (st.opts.enforceWeak && a && a.weakTo && d.suit === a.weakTo) return 'The ' + pl.arch + ' cannot play ' + d.suit + ' cards.';
    if (d.mods && d.mods.reaction) return d.name + ' can only be revealed as a reaction.';
    var lim = d.mods && d.mods.cannotPlayIfOwnMore;
    if (lim) { var own = kingdom(st, p).filter(function (k) { return hasSuit(st, top(st, k), lim.suit); }).length; if (own > lim.n) return 'You own more than ' + lim.n + ' ' + lim.suit + ' cards.'; }
    return null;
  }
  // A card set aside by Last Will and Testament is free on the turn it comes back to hand.
  function isFree(st, uid) { var c = st.cards[uid], pl = st.players[st.cur]; return c.free != null && pl && c.free === pl.turns && pl.hand.indexOf(uid) >= 0; }
  // Cost to place a card at k: printed cost + neighbours' adjacentCost (Watchtower) + tax Curses - building discount.
  function placeCost(st, uid, k) {
    if (isFree(st, uid)) return 0;
    var d = rawDef(st, uid), extra = 0;
    n4(k).forEach(function (x) { if (active(st, x)) { var m = def(st, top(st, x)).mods || {}; if (m.adjacentCost) extra += +m.adjacentCost; } });
    var total = (+d.cost || 0) + extra + taxAt(st, k);
    if (st.opts.adjDiscount && st.cur != null && n4(k).some(function (x) { return ownedBy(st, x, st.cur); })) total = Math.max(0, total - 3);
    return total;
  }
  // Every empty cell where the card may go, mapped to its cost. A cell is legal when it touches
  // at least one card and every touching side is in the card's `place` list. "diag" = corners only.
  function legalCells(st, uid) {
    var occ = keys(st), out = {};
    if (!occ.length) { out[K(0, 0)] = placeCost(st, uid, K(0, 0)); return out; }
    var d = rawDef(st, uid), cand = {};
    occ.forEach(function (k) { (d.place === 'diag' ? n8(k) : n4(k)).forEach(function (x) { if (!top(st, x)) cand[x] = 1; }); });
    Object.keys(cand).forEach(function (x) {
      var p = XY(x), touch = ['N', 'E', 'S', 'W'].filter(function (s) { return top(st, K(p[0] + DIRS[s][0], p[1] + DIRS[s][1])); });
      var ok;
      if (d.place === 'diag') ok = !touch.length && DIAG.some(function (q) { return top(st, K(p[0] + q[0], p[1] + q[1])); });
      else {
        var A = d.place && d.place.length ? d.place : ['N', 'E', 'S', 'W'];
        ok = touch.length > 0 && touch.every(function (s) { return A.indexOf(s) >= 0; });
      }
      if (ok) out[x] = placeCost(st, uid, x);
    });
    return out;
  }

  /* ---------- ruin / overwhelm / elimination ---------- */
  // Send the meeples on a card home (a Foundation's fixed claim stays).
  function returnMeeples(st, uid) {
    var c = st.cards[uid];
    if (!c.fixed) c.claimants.forEach(function (o) { if (st.players[o]) st.players[o].meeples++; });
    c.claimants = c.fixed ? c.claimants : [];
    if (c.parked) { Object.keys(c.parked).forEach(function (o) { if (st.players[o]) st.players[o].meeples += c.parked[o]; }); c.parked = null; }
  }
  // Ruin the card at k (or Overwhelm it, when how is "overwhelm"), credited to player `actor`.
  // In order: protection, Defense tokens, Rear Guard swap, queue reactions, flip, Foundation payouts.
  function ruinAt(st, k, actor, how) {
    var u = top(st, k); if (!u) return; var c = st.cards[u]; if (c.ruined) return;
    if (protectedStack(st, k)) { log(st, rawDef(st, u).name + ' is protected by a Standard Bearer buried under it.'); return; }
    if (how === 'ruin' && c.dtok > 0) { c.dtok--; c.defUsed = (c.defUsed || 0) + 1; log(st, rawDef(st, u).name + '’s Defense token absorbs the Ruin (' + c.dtok + ' left).'); return; }
    if (how === 'ruin' && !st.opts.sandbox) {
      var gk = n8(k).filter(function (x) { var g = top(st, x); if (!g || !active(st, x)) return false; var gm = mods(st, g); var o = st.cards[g].claimants[0]; return gm.guard && o != null && c.claimants.indexOf(o) >= 0; })[0];
      if (gk) { var tmp = st.board[k]; st.board[k] = st.board[gk]; st.board[gk] = tmp; log(st, rawDef(st, top(st, k)).name + ' swaps in to protect ' + rawDef(st, u).name + '.'); u = top(st, k); c = st.cards[u]; }
    }
    var ownersBefore = c.claimants.slice();
    if (!st.opts.sandbox && actor != null) st.players.forEach(function (q, qi) {
      if (qi === actor || q.out) return; var rp = q.hand.filter(function (h) { return (rawDef(st, h).mods || {}).reaction === 'opponentRuins'; })[0];
      if (rp && canReact(st, qi, rp)) (st.reactions = st.reactions || []).push({ p: qi, uid: rp, key: null, kind: 'repent', target: actor });
    });
    if (how === 'ruin' && !st.opts.sandbox && st.res && st.res.src && rawDef(st, st.res.src).type === 'Structure' && st.res.srcKey && top(st, st.res.srcKey) === st.res.src) {
      var srcK = st.res.srcKey;
      ownersBefore.forEach(function (o) { var rg = st.players[o] && !st.players[o].out && o !== actor && st.players[o].hand.filter(function (h) { return (rawDef(st, h).mods || {}).reaction === 'ruinedByStructure'; })[0]; if (rg) (st.reactions = st.reactions || []).push({ p: o, uid: rg, key: srcK, kind: 'regret' }); });
    }
    // The Ruin itself: flip the card and send its meeples home.
    var wasFoundation = isFoundation(st, u), owner = c.claimants[0];
    c.ruined = true; if (how === 'overwhelm') c.overwhelmed = true;
    returnMeeples(st, u);
    log(st, rawDef(st, u).name + ' at ' + k + ' is ' + (how === 'overwhelm' ? 'Overwhelmed' : 'Ruined') + (actor != null ? ' by ' + st.players[actor].name : '') + '.');
    if (actor != null && st.players[actor] && !st.players[actor].out) {
      var fd = st.defs[st.players[actor].foundation];
      var pay = fd && fd.mods ? (how === 'overwhelm' && fd.mods.payoutOnOverwhelm ? +fd.mods.payoutOnOverwhelm : +fd.mods.payoutOnRuin || 0) : 0;
      if (pay && st.players[actor].foundationPlaced) { bank(st, actor, pay, st.players[actor].foundationUid); log(st, st.players[actor].name + ' banks ' + pay + '◇ (' + fd.name + ').'); }
      var rsv = fd && fd.mods ? +fd.mods.reserveOnRuin || 0 : 0;
      if (rsv && st.players[actor].foundationPlaced) { st.players[actor].reserve = (st.players[actor].reserve || 0) + rsv; log(st, st.players[actor].name + ' gains ' + rsv + '● in Reserves (' + fd.name + '). Reserves stay until spent.'); }
    }
    if (how === 'overwhelm' && !st.opts.sandbox) ownersBefore.forEach(function (o) {
      var rv = st.players[o] && !st.players[o].out && st.players[o].hand.filter(function (h) { return (rawDef(st, h).mods || {}).reaction === 'overwhelmed'; })[0];
      if (rv) (st.reactions = st.reactions || []).push({ p: o, uid: rv, key: k, kind: 'revenge' });
    });
    giantsReact(st, k);
    if (wasFoundation && how === 'overwhelm' && owner != null && !st.opts.sandbox) eliminate(st, owner);
  }
  // A player whose Foundation is Overwhelmed is out: their cards are Ruined. Last one standing wins.
  function eliminate(st, p, why) {
    var pl = st.players[p]; if (pl.out) return; pl.out = true;
    log(st, why || pl.name + '’s Foundation was Overwhelmed. ' + pl.name + ' is out of the game.');
    keys(st).forEach(function (k) { var u = top(st, k); var c = st.cards[u]; if (c.claimants.indexOf(p) >= 0) { c.ruined = true; c.fixed = false; returnMeeples(st, u); } });
    pl.hand.forEach(function (u) { st.discard.push(u); }); pl.hand = [];
    var alive = st.players.map(function (q, i) { return q.out ? -1 : i; }).filter(function (i) { return i >= 0; });
    if (alive.length === 1) { st.winner = alive[0]; log(st, st.players[alive[0]].name + ' wins: last player standing.'); }
  }
  // n = enemy-suit neighbours; th = how many it takes to Overwhelm (3 by default,
  // 8 for Foundations, which also count diagonals), adjusted by burials and Curses.
  function overwhelmCount(st, k) {
    var u = top(st, k); if (!u) return null;
    var fd = isFoundation(st, u), d = def(st, u), en = enemies(st, suitOf(st, u));
    var around = fd ? n8(k) : n4(k);
    var n = around.filter(function (x) { var t = top(st, x); return t && en.some(function (s) { return hasSuit(st, t, s); }); }).length;
    var th = d.overwhelm != null && d.overwhelm !== '' ? +d.overwhelm : (fd ? 8 : 3), bonus = st.opts.burySuitOW ? onSuitBuried(st, k) : 0;
    var minus = curseFx(st, k, 'owMinus') + curseFx(st, k, 'intoxicate');
    return { n: n, th: Math.max(1, th + bonus - minus), bonus: bonus, minus: minus };
  }
  // Overwhelm every card at or past its threshold. Repeats, since one Overwhelm can set off another.
  function checkOverwhelm(st, actor) {
    var again = true, guard = 0;
    while (again && guard++ < 50) {
      again = false;
      keys(st).forEach(function (k) {
        var u = top(st, k); if (!u || st.cards[u].ruined || (rawDef(st, u).mods || {}).immune || st.cards[u].ascended || protectedStack(st, k)) return;
        var oc = overwhelmCount(st, k); if (oc && oc.n >= oc.th) { ruinAt(st, k, actor, 'overwhelm'); again = true; }
      });
    }
  }
  // Watchmaker's Shop: the moment all 4 sides fill, its neighbours rotate clockwise.
  function checkWatchmakers(st) {
    keys(st).forEach(function (k) {
      var u = top(st, k); if (!active(st, k)) return; var d = def(st, u); var c = st.cards[u];
      if (!(d.mods && d.mods.surroundRotate)) return;
      var nb = n4(k), full = nb.every(function (x) { return top(st, x); });
      if (full && !c.wasSurrounded) {
        // rotate clockwise (N→E→S→W) among the neighbors that may move; Foundations stay put
        var mv = nb.filter(function (x) { return !isFoundation(st, top(st, x)); }), stacks = mv.map(function (x) { return st.board[x]; });
        if (mv.length > 1) { mv.forEach(function (x, i) { st.board[mv[(i + 1) % mv.length]] = stacks[i]; }); mv.forEach(function (x, i) { st.moves = (st.moves || []).concat([mv[(i + 1) % mv.length]]); });
          log(st, d.name + ' is fully surrounded: the cards around it rotate clockwise' + (mv.length < 4 ? ' (Foundations stay in place)' : '') + '.'); }
      }
      c.wasSurrounded = full;
    });
  }
  // Placing the right suit next to a covering Curse destroys it and returns the card beneath to its owners.
  function checkSarcophagusRelease(st, placedKey) {
    var u = top(st, placedKey); if (!u) return; var s = suitOf(st, u);
    n4(placedKey).forEach(function (x) {
      if (!isCovered(st, x)) return; var cu = top(st, x), cd = rawDef(st, cu);
      if (cd.curse.releasedBy && hasSuit(st, u, cd.curse.releasedBy)) {
        st.board[x].shift(); toDiscard(st, cu);
        var t = top(st, x), tc = st.cards[t];
        (tc.prevClaimants || []).forEach(function (o) { if (st.players[o] && !st.players[o].out && st.players[o].meeples > 0) { st.players[o].meeples--; tc.claimants.push(o); } });
        tc.prevClaimants = null;
        log(st, 'A ' + s + ' card was played next to ' + cd.name + ': the Curse is destroyed and ' + rawDef(st, t).name + ' returns to its owner.');
      }
    });
  }
  // ---- movement triggers (Ballroom, Sleeping Giant) ----
  // After a card moves into toKey: Ballroom draws and Sleeping Giant. _depth stops chains of moves looping forever.
  function moved(st, toKey) {
    st._depth = (st._depth || 0) + 1; if (st._depth > 8) { st._depth--; return; }
    var mover = top(st, toKey);
    n4(toKey).forEach(function (x) {
      var u = top(st, x); if (!u || u === mover || !active(st, x)) return; var m = mods(st, u);
      if (m.drawOnMoveIn) st.cards[u].claimants.forEach(function (o) { if (!st.players[o].out) { draw(st, o, +m.drawOnMoveIn); log(st, rawDef(st, u).name + ': a card moved next to it, so ' + st.players[o].name + ' draws a card.'); } });
    });
    giantsReact(st, toKey);
    st._depth--;
  }
  // A Sleeping Giant next to k moves onto it, burying it.
  function giantsReact(st, k) {
    n4(k).forEach(function (gk) { var g = top(st, gk); if (!g || !active(st, gk) || !mods(st, g).giant || !top(st, k)) return; giantMove(st, gk, k); });
  }
  function giantMove(st, gk, tk) {
    var g = top(st, gk), tu = top(st, tk); if (!g || !tu || g === tu) return;
    if (unburiable(st, tu)) { log(st, rawDef(st, g).name + ' stirs but cannot bury ' + rawDef(st, tu).name + '.'); return; }
    st.board[tk].forEach(function (x) { returnMeeples(st, x); });
    var left = st.board[gk].slice(1);
    st.board[tk] = [g].concat(st.board[tk]);
    if (left.length) st.board[gk] = left; else delete st.board[gk];
    log(st, rawDef(st, g).name + ' moves onto ' + rawDef(st, tu).name + ' at ' + tk + ' and buries it (its claims end).');
    moved(st, tk);
  }
  // Everything that happens when the current player ends their turn.
  function endOfTurnEffects(st) {
    // Acorn-style tokens that grow at the end of every turn
    var me = st.cur;
    keys(st).forEach(function (k) { var u = top(st, k), d = def(st, u); if (d.perTurn && (d.perTurn.when === 'ownerTurnEnd' || d.perTurn.when === 'everyTurnEnd') && active(st, k) && (d.perTurn.when === 'everyTurnEnd' || ownedBy(st, k, me))) st.cards[u].tokens += +d.perTurn.token || 1; });
    // Spice Caravan
    keys(st).forEach(function (k) {
      var u = top(st, k); if (!u || !active(st, k) || !mods(st, u).caravan || !ownedBy(st, k, me) || st.cards[u]._movedTurn === st.log.length) return;
      var q = XY(k), e = K(q[0] + 1, q[1]), w = K(q[0] - 1, q[1]);
      var okTo = function (x) { return !top(st, x) && (!st.opts.noWander || n4(x).some(function (y) { return y !== k && top(st, y); })); };
      var to = okTo(e) ? e : (okTo(w) ? w : null);
      if (!to && (!top(st, e) || !top(st, w))) { log(st, rawDef(st, u).name + ' stays put: moving would leave it away from every other card.'); return; }
      if (!to) { var s = st.board[k]; st.board[k].forEach(function (x) { returnMeeples(st, x); }); s.slice(1).forEach(function (x) { st.discard.push(x); }); delete st.board[k]; toDiscard(st, u); log(st, rawDef(st, u).name + ' is boxed in and is discarded.'); return; }
      st.board[to] = st.board[k]; delete st.board[k]; st.cards[u]._movedTurn = st.log.length;
      st.cards[u].claimants.forEach(function (o) { bank(st, o, 1, u); });
      log(st, rawDef(st, u).name + ' moves ' + (to === e ? 'east' : 'west') + ' to ' + to + (st.cards[u].claimants.length ? '; its owner banks 1◇' : '') + '.');
      moved(st, to);
    });
  }
  // Alchemy Lab: when three neighbours share a suit, its owner may give them three different suits.
  function checkAlchemy(st) {
    keys(st).forEach(function (k) {
      var u = top(st, k); if (!active(st, k) || !mods(st, u).alchemy) return; var c = st.cards[u], o = c.claimants[0];
      var by = {}; n4(k).forEach(function (x) { var t = top(st, x); if (t && !st.cards[t].ruined && !st.cards[t].ascended) { var s = suitOf(st, t); (by[s] = by[s] || []).push(x); } });
      var hit = Object.keys(by).filter(function (s) { return by[s].length >= 3; })[0];
      if (hit && !c.alchemyFired && o != null && !st.players[o].out) (st.reactions = st.reactions || []).push({ p: o, uid: u, key: k, kind: 'alchemy', cells: by[hit].slice(0, 3) });
      c.alchemyFired = !!hit;
    });
  }
  // Start the next queued reaction, unless an effect is already resolving. Each reaction becomes its own
  // st.res with a short list of steps, usually starting with a yes/no confirm for the reacting player.
  function runReactions(st) {
    if (st.res || !st.reactions || !st.reactions.length || st.winner != null) return;
    var r = st.reactions.shift();
    var ctx0 = { affected: [] };
    if (r.kind === 'replay') { var rd = def(st, r.uid); if (!top(st, r.key) || top(st, r.key) !== r.uid) return runReactions(st); log(st, rd.name + '’s placement effect triggers again.');
      st.res = { kind: 'reaction', src: r.uid, srcKey: r.key, player: r.p, steps: JSON.parse(JSON.stringify(rd.onPlay || [])), i: 0, sub: null, ctx: ctx0, phase: null }; runRes(st); return; }
    if (r.kind === 'repent') { ctx0.ownerIs = r.target;
      st.res = { kind: 'reaction', src: r.uid, srcKey: null, player: r.p, steps: [{ do: 'confirm', prompt: st.players[r.p].name + ': play Repent to Ruin a card of ' + st.players[r.target].name + '’s next to one of yours? Your next turn starts with 3● less.' }, { do: 'ruin', area: 'adjacentToOwn', ownerIs: 'ctx' }, { do: 'payDebt', n: 3, discard: true, requires: 'ruined' }], i: 0, sub: null, ctx: ctx0, phase: null }; runRes(st); return; }
    if (r.kind === 'brambles') { var bu = top(st, r.key); if (!bu || st.players[r.p].hand.indexOf(r.uid) < 0) return runReactions(st);
      st.res = { kind: 'reaction', src: r.uid, srcKey: r.key, player: r.p, steps: [{ do: 'confirm', prompt: st.players[r.p].name + ': play Brambles on top of ' + rawDef(st, bu).name + ' (one away from being Overwhelmed)? It and everything under it get buried. Your next turn starts with 3● less.' }, { do: 'brambles' }], i: 0, sub: null, ctx: ctx0, phase: null }; runRes(st); return; }
    var steps = r.kind === 'regret'
      ? [{ do: 'confirm', prompt: st.players[r.p].name + ': play You’ll Regret That to Curse the Structure that Ruined your card? It will produce no ●.' }, { do: 'regretCurse' }]
      : r.kind === 'revenge'
      ? [{ do: 'confirm', prompt: st.players[r.p].name + ': reveal Revenge to change the suit of two cards next to the Overwhelmed card?', consume: true }, { do: 'setSuit', area: 'adjacent', suit: 'choose', count: 2 }]
      : [{ do: 'confirm', prompt: st.players[r.p].name + ': Alchemy Lab is surrounded by three cards of one suit. Assign three different suits to them?' }, { do: 'alchemy', cells: r.cells }];
    st.res = { kind: 'reaction', src: r.uid, srcKey: r.key, player: r.p, steps: steps, i: 0, sub: null, ctx: { affected: [] }, phase: null };
    runRes(st);
  }
  // Brambles: offered to other players once when a card gets one enemy away from Overwhelm.
  function checkOneAway(st) {
    if (st.opts.sandbox) return;
    keys(st).forEach(function (k) {
      var u = top(st, k), c = st.cards[u]; if (!u || c.ruined || untargetable(st, u) || protectedStack(st, k) || isCovered(st, k)) return;
      var oc = overwhelmCount(st, k), near = oc.n === oc.th - 1 && oc.n > 0;
      if (!near) { c.braOffered = false; return; }
      if (c.braOffered) return; c.braOffered = true;
      st.players.forEach(function (q, qi) { if (qi === st.cur || q.out) return; var b = q.hand.filter(function (h) { return (rawDef(st, h).mods || {}).reaction === 'oneAway'; })[0]; if (b && canReact(st, qi, b)) (st.reactions = st.reactions || []).push({ p: qi, uid: b, key: k, kind: 'brambles' }); });
    });
  }
  // Defense tokens (one per two same-suit burials) and Ascension (five suits in one stack).
  function checkDefenseAndAscension(st) {
    keys(st).forEach(function (k) {
      var u = top(st, k), c = st.cards[u]; if (!u || c.ruined || isCovered(st, k)) return;
      if (st.opts.defense) { var earned = Math.floor(onSuitBuried(st, k) / 2), had = c.defAwarded || 0; if (earned > had) { c.dtok = (c.dtok || 0) + earned - had; c.defAwarded = earned; log(st, rawDef(st, u).name + ' gains a Defense token (' + c.dtok + ').'); } }
      if (st.opts.ascension && !c.ascended) {
        var ss = {}; st.board[k].forEach(function (x) { ss[suitOf(st, x)] = 1; });
        if (Object.keys(ss).length >= 5) { c.ascended = true; log(st, rawDef(st, u).name + ' ASCENDS: five suits in one stack. It is invulnerable, counts as every suit, and gives +8◇ and +12●.'); }
      }
    });
  }
  // All the automatic rule checks, run after anything changes the board. The order matters.
  function afterBoardChange(st, actor) {
    (st.moves || []).splice(0).forEach(function (k) { if (top(st, k)) moved(st, k); });
    checkDefenseAndAscension(st);
    checkOverwhelm(st, actor); checkAlchemy(st); checkOneAway(st); runReactions(st);
  }

  /* ---------- targeting ---------- */
  // Cells an effect step can reach, from step.area: around the source card, the player's Kingdom, the whole board, ...
  function area(st, res, step) {
    var p = res.player, src = res.srcKey, out = [];
    var a = step.area || 'adjacent';
    if (a === 'adjacent') out = src ? n4(src) : [];
    else if (a === 'adjacentToOwn') { var s = {}; kingdom(st, p).forEach(function (k) { n4(k).forEach(function (x) { s[x] = 1; }); s[k] = 1; }); out = Object.keys(s); }
    else if (a === 'kingdom') out = kingdom(st, p);
    else if (a === 'adjacentToOwnSuit' || a === 'adjacentToSuit') { var s2 = {}; (a === 'adjacentToOwnSuit' ? kingdom(st, p) : keys(st)).forEach(function (k) { if (hasSuit(st, top(st, k), step.suit)) n4(k).forEach(function (x) { s2[x] = 1; }); }); out = Object.keys(s2); }
    else if (a === 'emptyAround3') out = keys(st).filter(function (k) { return n4(k).filter(function (x) { return !top(st, x); }).length >= 3; });
    else if (a === 'westOfOwn') out = kingdom(st, p).map(function (k) { var q = XY(k); return K(q[0] - 1, q[1]); });
    else if (a === 'east1') { var q = XY(src); out = [K(q[0] + 1, q[1])]; }
    else if (a === 'ring3') { var r = XY(src); out = [K(r[0] + 3, r[1]), K(r[0] - 3, r[1]), K(r[0], r[1] + 3), K(r[0], r[1] - 3)]; }
    else out = keys(st);
    return out.filter(function (k, i) { return out.indexOf(k) === i && k !== src && top(st, k); });
  }
  // area() narrowed down to the legal targets for one kind of effect ("ruin", "curse", "copy", ...).
  function targets(st, res, step, kind) {
    return area(st, res, step).filter(function (k) {
      var u = top(st, k), c = st.cards[u], d = rawDef(st, u);
      if (untargetable(st, u)) return false; // Foundations and immune cards can never be targeted by card effects
      if (kind === 'curse' && rawDef(st, res.src).curse && rawDef(st, res.src).curse.mode === 'top' && unburiable(st, u)) return false;
      if (kind === 'ruin') { if (c.ruined || protectedStack(st, k)) return false; if (step.oppOwned && (!c.claimants.length || c.claimants.indexOf(res.player) >= 0)) return false; if (step.ownerIs === 'ctx' && c.claimants.indexOf(res.ctx.ownerIs) < 0) return false; }
      if (kind === 'suit') { if (c.ruined) return false; }
      if (kind === 'curse') { if (c.ruined || isFoundation(st, u) || isCovered(st, k) || d.type === 'Curse') return false; }
      if (kind === 'uncurse') { if (!isCursed(st, k)) return false; }
      if (kind === 'unruin') { if (!c.ruined) return false; }
      if (kind === 'owned') { if (c.ruined || !c.claimants.length) return false; }
      if (kind === 'copy') { if (c.ruined || (+d.cost || 0) > (+step.maxCost || 0) || d.type === 'Foundation') return false; }
      if (kind === 'buried') { if (st.board[k].length < (isCovered(st, k) ? 3 : 2)) return false; if (c.claimants.length && c.claimants.indexOf(res.player) < 0) return false; }
      if (step.notSuit && hasSuit(st, u, step.notSuit)) return false;
      return true;
    });
  }

  /* ---------- effect resolution (resumable) ---------- */
  // How effects work. A card's onPlay is a list of steps, e.g. [{ do: "ruin", area: "adjacent" }].
  // st.res is the effect being resolved: its steps, the current step index i, the source card (src, srcKey),
  // res.ctx (notes shared between steps) and res.sub (one step's progress across several prompts).
  // Each step runs through its handler in H below: H[step.do](st, res, step, ans).
  //   - First call: ans is undefined. If a choice is needed, return a prompt object; it becomes st.pending.
  //   - Once the player answers, the handler is called again with ans. Return "done" to go to the next step.
  //
  // pend fills in which player answers a prompt (the effect's player unless set).
  function pend(res, o) { o.player = o.player != null ? o.player : res.player; return o; }
  // Note a cell this effect touched. Actions are later buried under one of these.
  function affect(res, k) { if (k && res.ctx.affected.indexOf(k) < 0) res.ctx.affected.push(k); }
  // Reveal cards until one of `suit` turns up and draw it. The rest go to the discard pile or the bottom of the deck.
  function revealUntil(st, res, suit, rest) {
    var shown = [], found = null, guard = st.deck.length + st.discard.length + 1;
    while (guard-- > 0) {
      if (!st.deck.length && st.discard.length) { st.deck = shuffle(st.discard, st); st.discard = []; }
      if (!st.deck.length) break;
      var u = st.deck.shift();
      if (rawDef(st, u).suit === suit) { found = u; break; }
      shown.push(u);
    }
    if (rest === 'bottom') st.deck = st.deck.concat(shown); else shown.forEach(function (u) { st.discard.push(u); });
    if (found) st.players[res.player].hand.push(found);
    log(st, 'Revealed ' + (shown.length ? shown.map(function (u) { return rawDef(st, u).name; }).join(', ') + ', then ' : '') + (found ? rawDef(st, found).name + ' (drawn)' : 'no ' + suit + ' card') + '.');
  }

  // Step handlers, keyed by the `do` name used in the card data. Cards that use each are noted where it isn't obvious.
  var H = {
    draw: function (st, res, s) { draw(st, res.player, +s.n || 1); log(st, st.players[res.player].name + ' draws ' + (s.n || 1) + '.'); return 'done'; },
    gainAP: function (st, res, s) { st.players[res.player].ap += +s.n || 0; log(st, st.players[res.player].name + ' gains ' + s.n + '●.'); return 'done'; },
    discardHand: function (st, res) { var pl = st.players[res.player]; var keep = pl.hand.filter(function (u) { return rawDef(st, u).type === 'Foundation'; }); discardable(st, res.player).forEach(function (u) { st.discard.push(u); }); pl.hand = keep; log(st, pl.name + ' discards their hand' + (keep.length ? ' (keeping their Foundation)' : '') + '.'); return 'done'; },
    // Turn the Soil: draw up to hand size (+ plus).
    drawTo: function (st, res, s) { var pl = st.players[res.player], extra = +s.plus || 0;
      if (s.plusPer) extra += Math.floor(kingdom(st, res.player).filter(function (k) { return hasSuit(st, top(st, k), s.plusPer.suit); }).length / (+s.plusPer.per || 1));
      var want = st.opts.handSize + extra; draw(st, res.player, Math.max(0, want - pl.hand.length)); return 'done'; },
    discard: function (st, res, s, ans) {
      var pl = st.players[res.player], opts = discardable(st, res.player), n = Math.min(+s.n || 1, opts.length);
      if (!n) return 'done';
      if (ans === undefined) return pend(res, { kind: 'hand', count: n, options: opts, prompt: 'Discard ' + n + ' card' + (n > 1 ? 's' : '') + '. Your Foundation cannot be discarded.' });
      ans.forEach(function (u) { if (removeFromHand(st, res.player, u)) st.discard.push(u); });
      log(st, pl.name + ' discards ' + ans.map(function (u) { return rawDef(st, u).name; }).join(', ') + '.'); return 'done';
    },
    ruin: function (st, res, s, ans) {
      if (ans === undefined) {
        if (s.ownAdjacentAtLeast) { var own = n4(res.srcKey).filter(function (k) { return ownedBy(st, k, res.player); }).length; if (own < s.ownAdjacentAtLeast) { log(st, 'Condition not met: own ' + s.ownAdjacentAtLeast + ' adjacent cards.'); return 'done'; } }
        var t = targets(st, res, s, 'ruin');
        if (!t.length) { log(st, 'No card to Ruin.'); return 'done'; }
        if (s.auto && t.length === 1) { ruinAt(st, t[0], res.player, 'ruin'); affect(res, t[0]); res.ctx.ruined = true; return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a card to Ruin.', verb: 'ruin', optional: !!s.optional });
      }
      if (ans) { ruinAt(st, ans, res.player, 'ruin'); affect(res, ans); res.ctx.ruined = true; if (s.asCurse) res.ctx.curseTarget = ans; }
      return 'done';
    },
    setSuit: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = { picked: [] }), count = +s.count || 1;
      if (sub.stage === 'suit') {
        if (ans && ans !== 'keep') sub.picked.forEach(function (k) { st.cards[top(st, k)].suit = ans; log(st, rawDef(st, top(st, k)).name + ' is now ' + ans + '.'); });
        return 'done';
      }
      if (ans !== undefined) { if (ans) { sub.picked.push(ans); affect(res, ans); } if (!ans || sub.picked.length >= count) { return finishSuit(); } }
      var t = targets(st, res, s, 'suit').filter(function (k) { return sub.picked.indexOf(k) < 0; });
      if (!t.length) return finishSuit();
      return pend(res, { kind: 'cell', options: t, prompt: 'Choose a card to change suit' + (count > 1 ? ' (' + (sub.picked.length + 1) + ' of ' + count + ')' : '') + '.', verb: 'suit', optional: !!s.optional || sub.picked.length > 0 });
      function finishSuit() {
        if (!sub.picked.length) return 'done';
        if (s.suit && s.suit !== 'choose') { sub.stage = 'suit'; return H.setSuit(st, res, s, s.suit); }
        sub.stage = 'suit'; return pend(res, { kind: 'suit', options: SUITS, prompt: 'Choose the new suit.' });
      }
    },
    curse: function (st, res, s, ans) {
      if (ans === undefined) {
        var t = targets(st, res, s, 'curse');
        if (!t.length) { log(st, 'No card to Curse.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: s.prompt || 'Choose a card to Curse.', verb: 'curse', optional: !!s.optional });
      }
      if (ans === null) return 'done';
      var dc = st.cards[top(st, ans)];
      if (dc.dtok > 0 && !s.pierce) { dc.dtok--; dc.defUsed = (dc.defUsed || 0) + 1; res.ctx.curseBlocked = true; affect(res, ans); log(st, rawDef(st, dc.uid).name + '’s Defense token absorbs the Curse (' + dc.dtok + ' left).'); return 'done'; }
      res.ctx.curseTarget = ans; affect(res, ans); return 'done';
    },
    removeCurse: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {});
      if (sub.stage === 'suit') { if (ans && ans !== 'keep') { st.cards[top(st, sub.k)].suit = ans; log(st, rawDef(st, top(st, sub.k)).name + ' is now ' + ans + '.'); } return 'done'; }
      if (ans === undefined) {
        var t = targets(st, res, s, 'uncurse');
        if (!t.length) { log(st, 'No Cursed card nearby.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a Cursed card to cleanse.', verb: 'cleanse' });
      }
      var k = ans; sub.k = k; affect(res, k);
      if (isCovered(st, k)) { var cu = st.board[k].shift(); toDiscard(st, cu); var tc = st.cards[top(st, k)]; (tc.prevClaimants || []).forEach(function (o) { if (st.players[o].meeples > 0) { st.players[o].meeples--; tc.claimants.push(o); } }); tc.prevClaimants = null; }
      else { var cs = curseCardsUnder(st, k); cs.forEach(function (u) { st.board[k].splice(st.board[k].indexOf(u), 1); toDiscard(st, u); }); }
      log(st, 'The Curse on ' + rawDef(st, top(st, k)).name + ' is destroyed.');
      if (!s.chooseSuit) return 'done';
      sub.stage = 'suit'; return pend(res, { kind: 'suit', options: SUITS, prompt: 'Change its suit? (optional)', allowKeep: true });
    },
    unruin: function (st, res, s, ans) {
      if (ans === undefined) {
        var t = targets(st, res, { area: 'board' }, 'unruin');
        if (!t.length) { log(st, 'No Ruined card to restore.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a Ruined card to flip back over.', verb: 'restore' });
      }
      var c = st.cards[top(st, ans)]; c.ruined = false; c.overwhelmed = false; if (s.setSuit) c.suit = s.setSuit; affect(res, ans);
      log(st, rawDef(st, top(st, ans)).name + ' is restored' + (s.setSuit ? ' as ' + s.setSuit : '') + '. It is unclaimed.'); return 'done';
    },
    searchSuit: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'suit', options: SUITS, prompt: 'Name a suit.' });
      revealUntil(st, res, ans, s.rest); return 'done';
    },
    revealHand: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'player', options: others(st, res.player), prompt: 'Choose a player to reveal their hand.' });
      st.reveal = { to: res.player, of: ans, cards: st.players[ans].hand.slice() };
      log(st, st.players[ans].name + ' reveals their hand to ' + st.players[res.player].name + '.'); return 'done';
    },
    takeSuitFromHand: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'player', options: others(st, res.player).filter(function (i) { return !s.notArchetype || st.players[i].arch !== s.notArchetype; }), prompt: 'Choose a player' + (s.notArchetype ? ' (not the ' + s.notArchetype + ')' : '') + '.', allowNone: !!s.orDraw, noneLabel: 'Choose no one and draw ' + (s.orDraw || 1) });
      if (ans === null) { draw(st, res.player, +s.orDraw || 1); log(st, st.players[res.player].name + ' chooses no one and draws a card.'); return 'done'; }
      var from = st.players[ans], got = from.hand.filter(function (u) { return rawDef(st, u).suit === s.suit && rawDef(st, u).type !== 'Foundation'; });
      got.forEach(function (u) { removeFromHand(st, ans, u); st.players[res.player].hand.push(u); });
      log(st, from.name + ' gives ' + got.length + ' ' + s.suit + ' card' + (got.length === 1 ? '' : 's') + ' to ' + st.players[res.player].name + '.'); return 'done';
    },
    buryFromHand: function (st, res, s, ans) {
      var pl = st.players[res.player], fk = pl.foundationUid ? cellOf(st, pl.foundationUid) : null;
      if (!fk) { log(st, 'You have no Foundation on the board to bury under.'); return 'done'; }
      var n = +s.n || 1; if (s.bonusArchetype && pl.arch === s.bonusArchetype) n = +s.bonusN || n;
      var bopts = discardable(st, res.player); n = Math.min(n, bopts.length); if (!n) return 'done';
      if (ans === undefined) return pend(res, { kind: 'hand', count: n, options: bopts, prompt: 'Bury ' + n + ' card' + (n > 1 ? 's' : '') + ' from your hand under your Foundation.' });
      ans.forEach(function (u) { if (removeFromHand(st, res.player, u)) { st.board[fk].splice(1, 0, u); onBuried(st, u, fk); } });
      affect(res, fk); log(st, pl.name + ' buries ' + ans.length + ' card' + (ans.length > 1 ? 's' : '') + ' under their Foundation.'); return 'done';
    },
    drawBuried: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = { got: 0 }), n = +s.n || 1;
      if (ans !== undefined) {
        if (!ans) return 'done';
        var u = st.board[ans].splice(isCovered(st, ans) ? 2 : 1, 1)[0]; st.players[res.player].hand.push(u); sub.got++; affect(res, ans);
        log(st, st.players[res.player].name + ' draws a buried ' + rawDef(st, u).name + '.');
        if (sub.got >= n) return 'done';
      }
      var t = targets(st, res, { area: 'board' }, 'buried');
      if (!t.length) return 'done';
      return pend(res, { kind: 'cell', options: t, prompt: 'Choose a card to draw a buried card from (' + (sub.got + 1) + ' of ' + n + ').', verb: 'dig', optional: true });
    },
    // Portcullis: the owner of a chosen card discards down to n.
    discardDownTo: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {});
      if (sub.stage === 'hand') {
        ans.forEach(function (u) { if (removeFromHand(st, sub.victim, u)) st.discard.push(u); });
        log(st, st.players[sub.victim].name + ' discards down to ' + s.n + '.'); return 'done';
      }
      if (ans === undefined) {
        var t = targets(st, res, s, 'owned');
        if (!t.length) { log(st, 'No adjacent owned card.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose an adjacent card. Its owner discards down to ' + s.n + '.', verb: 'target' });
      }
      affect(res, ans);
      var v = st.cards[top(st, ans)].claimants[0]; sub.victim = v;
      var vopts = discardable(st, v), extra = Math.min(st.players[v].hand.length - (+s.n), vopts.length);
      if (extra <= 0) { log(st, st.players[v].name + ' already has ' + s.n + ' or fewer cards.'); return 'done'; }
      sub.stage = 'hand'; return { kind: 'hand', player: v, count: extra, options: vopts, prompt: st.players[v].name + ': discard ' + extra + ' card' + (extra > 1 ? 's' : '') + ' (Portcullis).' };
    },
    // Topiary: become a copy of an adjacent card (see def()).
    copy: function (st, res, s, ans) {
      if (ans === undefined) {
        var t = targets(st, res, s, 'copy');
        if (!t.length) { log(st, 'Nothing adjacent to copy.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose an adjacent card to copy (cost up to ' + s.maxCost + '●).', verb: 'copy' });
      }
      st.cards[res.src].copyOf = st.cards[top(st, ans)].copyOf || st.cards[top(st, ans)].def; affect(res, ans);
      log(st, rawDef(st, res.src).name + ' now copies ' + rawDef(st, top(st, ans)).name + '.'); return 'done';
    },
    // Volcanic Soil: owners of cards north of it bank ◇ once.
    northBonusOnce: function (st, res, s) {
      if (!res.srcKey) return 'done';
      var q = XY(res.srcKey), any = false;
      keys(st).forEach(function (k) {
        var p = XY(k); if (p[0] !== q[0] || p[1] >= q[1]) return;
        var u = top(st, k), c = st.cards[u]; if (c.ruined || isCovered(st, k) || !c.claimants.length) return;
        var amt = st.board[k].length > 1 ? (+s.buried || 2) : (+s.plain || 1);
        c.claimants.forEach(function (o) { if (!st.players[o].out) bank(st, o, amt, u); });
        any = true; affect(res, k);
        log(st, rawDef(st, u).name + ' at ' + k + ' gives ' + c.claimants.map(function (o) { return st.players[o].name; }).join(' and ') + ' +' + amt + '◇ (' + rawDef(st, res.src).name + ').');
      });
      if (!any) log(st, 'No owned cards north of ' + rawDef(st, res.src).name + '.');
      return 'done';
    },
    // Reactions cost ● from the player's next turn.
    payDebt: function (st, res, s) { var pl = st.players[res.player]; pl.debt = (pl.debt || 0) + (+s.n || 0); if (s.discard) { removeFromHand(st, res.player, res.src); toDiscard(st, res.src); } log(st, pl.name + ' plays ' + rawDef(st, res.src).name + '; their next turn starts with ' + s.n + '● less.'); return 'done'; },
    // Brambles: grows on top of the threatened card, burying it, and is claimed by the reacting player.
    brambles: function (st, res, s) {
      var k = res.srcKey, u = top(st, k), p = res.player, pl = st.players[p]; if (!u || st.cards[u].ruined) return 'done';
      removeFromHand(st, p, res.src); returnMeeples(st, u); st.board[k].unshift(res.src);
      pl.debt = (pl.debt || 0) + 3;
      if (pl.meeples > 0) { st.cards[res.src].claimants = [p]; pl.meeples--; }
      log(st, pl.name + ' grows Brambles over ' + rawDef(st, u).name + ': it and everything under it are buried' + (st.cards[res.src].claimants.length ? ', and ' + pl.name + ' claims the Brambles' : '') + '. Next turn starts with 3● less.');
      return 'done';
    },
    // Royal Seal: claim any unclaimed card; a Structure's onPlay runs again.
    royalClaim: function (st, res, s, ans) {
      var p = res.player;
      if (ans === undefined) {
        if (st.players[p].meeples <= 0) { log(st, 'No meeples left to claim with.'); return 'done'; }
        var t = keys(st).filter(function (k) { var u = top(st, k), c = st.cards[u]; return !c.ruined && !c.claimants.length && !unclaimable(st, u) && !isCovered(st, k); });
        if (!t.length) { log(st, 'No unclaimed card to claim.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose an unclaimed card to claim. A Structure’s placement effect triggers again.', verb: 'claim', optional: true });
      }
      if (!ans) return 'done';
      var u = top(st, ans), d = def(st, u); st.cards[u].claimants.push(p); st.players[p].meeples--; affect(res, ans);
      log(st, st.players[p].name + ' claims ' + d.name + ' with ' + rawDef(st, res.src).name + '.');
      if (d.type === 'Structure' && (d.onPlay || []).length) (st.reactions = st.reactions || []).push({ p: p, uid: u, key: ans, kind: 'replay' });
      return 'done';
    },
    // Scrying Pool: re-run the onPlay of a Structure you own.
    scry: function (st, res, s, ans) {
      var p = res.player;
      if (ans === undefined) {
        var t = kingdom(st, p).filter(function (k) { var u = top(st, k), d = def(st, u); return k !== res.srcKey && active(st, k) && d.type === 'Structure' && (d.onPlay || []).length; });
        if (!t.length) { log(st, 'You own no Structure with a placement effect.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a card you own: its placement effect triggers again.', verb: 'target' });
      }
      (st.reactions = st.reactions || []).push({ p: p, uid: top(st, ans), key: ans, kind: 'replay' }); return 'done';
    },
    // Bread and Circuses: 1◇ per unbroken card east of the chosen one.
    eastChain: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'cell', options: keys(st), prompt: 'Choose a card. You earn 1◇ for each unbroken non-Ruined card east of it.', verb: 'target' });
      var q = XY(ans), n = 0, x = q[0] + 1; for (;;) { var t = top(st, K(x, q[1])); if (!t || st.cards[t].ruined) break; n++; x++; }
      if (n) bank(st, res.player, n, res.src); log(st, st.players[res.player].name + ' banks ' + n + '◇ from the crowd east of ' + rawDef(st, top(st, ans)).name + '.'); affect(res, ans); return 'done';
    },
    // Decay: tokens have no effect yet.
    decayToken: function (st, res, s, ans) {
      if (ans === undefined) { var t = n4(res.srcKey).filter(function (k) { return top(st, k) && !untargetable(st, top(st, k)); }); if (!t.length) return 'done'; return pend(res, { kind: 'cell', options: t, prompt: 'Place a Decay token on an adjacent card.', verb: 'target' }); }
      var c = st.cards[top(st, ans)]; c.decay = (c.decay || 0) + 1; log(st, rawDef(st, c.uid).name + ' gets a Decay token (' + c.decay + ').'); return 'done';
    },
    // Fortune Teller: name a suit; sets ctx.fortuneOk, which later steps can `require`.
    fortune: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'suit', options: SUITS, prompt: 'Name a suit, then the top card of the deck is revealed.' });
      if (!st.deck.length && st.discard.length) { st.deck = shuffle(st.discard, st); st.discard = []; }
      var tc = st.deck[0]; if (!tc) { log(st, 'The deck is empty.'); return 'done'; }
      var hit = rawDef(st, tc).suit === ans; res.ctx.fortuneOk = hit;
      log(st, 'The top card is ' + rawDef(st, tc).name + ' (' + rawDef(st, tc).suit + '): ' + (hit ? 'the fortune holds.' : 'the fortune fails.'));
      return 'done';
    },
    // Extra effects for some Curses once they land: Tunnel, Exile, Usurp, Eye of Newt (tax).
    curseExtra: function (st, res, s) {
      var k = res.ctx.curseTarget; if (!k || res.ctx.curseBlocked || !top(st, k)) return 'done';
      var u = top(st, k), c = st.cards[u], nm = rawDef(st, u).name;
      if (s.kind === 'tunnel') { var gone = st.board[k].splice(1); gone.forEach(function (x) { toDiscard(st, x); }); c.dtok = 0; c.defAwarded = 0; log(st, 'Tunnel undermines ' + nm + ': ' + gone.length + ' buried card' + (gone.length === 1 ? '' : 's') + ' removed and its Defense tokens lost.'); }
      if (s.kind === 'exile') { if (c.claimants.length) { returnMeeples(st, u); log(st, nm + ' is Exiled: its meeples go home.'); } }
      if (s.kind === 'usurp') { var p = res.player; if (c.claimants.indexOf(p) < 0 && st.players[p].meeples > 0) { c.claimants.push(p); st.players[p].meeples--; log(st, st.players[p].name + ' Usurps ' + nm + ' and adds a meeple to it.'); } }
      if (s.kind === 'tax') { st.cards[res.src].taxCells = n4(k).filter(function (x) { return !top(st, x); }); log(st, 'The spaces around ' + nm + ' now cost 3● more.'); }
      return 'done';
    },
    // Overwhelming Evidence: offer to claim the card just affected.
    offerClaim: function (st, res, s, ans) {
      var k = res.ctx.affected[res.ctx.affected.length - 1], u = k && top(st, k), p = res.player;
      if (!u || st.cards[u].ruined || st.cards[u].claimants.indexOf(p) >= 0 || st.players[p].meeples <= 0 || unclaimable(st, u)) return 'done';
      if (ans === undefined) return pend(res, { kind: 'confirm', prompt: 'Claim ' + rawDef(st, u).name + ' with one of your meeples?' });
      if (ans) { st.cards[u].claimants.push(p); st.players[p].meeples--; log(st, st.players[p].name + ' claims ' + rawDef(st, u).name + '.'); }
      return 'done';
    },
    // Overgrowth: replace a Ruined card next to a Leaf card.
    overgrow: function (st, res, s, ans) {
      var me = res.src;
      if (ans === undefined) {
        var t = keys(st).filter(function (k) {
          var u = top(st, k); if (!u || !st.cards[u].ruined || k === res.srcKey || untargetable(st, u)) return false;
          if (!n4(k).some(function (x) { var y = top(st, x); return y && x !== k && hasSuit(st, y, 'Leaf'); })) return false;
          var en = enemies(st, 'Leaf'); var nE = n4(k).filter(function (x) { var y = top(st, x); return y && x !== res.srcKey && en.some(function (q) { return hasSuit(st, y, q); }); }).length;
          return nE < 3;
        });
        if (!t.length) { log(st, 'No Ruined card for Overgrowth to replace.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a Ruined card next to a Leaf card for Overgrowth to replace (or Skip).', verb: 'target', optional: true });
      }
      if (!ans) return 'done';
      var old = st.board[ans].shift(); toDiscard(st, old);
      st.board[res.srcKey].shift(); if (!st.board[res.srcKey].length) delete st.board[res.srcKey];
      st.board[ans].unshift(me); log(st, 'Overgrowth swallows the Ruined ' + rawDef(st, old).name + ' and takes its place.');
      res.srcKey = ans; if (st.turn) st.turn.lastKey = ans; (st.moves = st.moves || []).push(ans); affect(res, ans);
      return 'done';
    },
    // You'll Regret That: Curse the Structure that Ruined your card.
    regretCurse: function (st, res, s) {
      var k = res.srcKey, u = top(st, k); if (!u) return 'done';
      removeFromHand(st, res.player, res.src);
      var c = st.cards[u];
      if (c.dtok > 0) { c.dtok--; toDiscard(st, res.src); log(st, rawDef(st, u).name + '’s Defense token absorbs the Curse.'); return 'done'; }
      st.board[k].splice(1, 0, res.src); log(st, st.players[res.player].name + ' reveals You’ll Regret That: ' + rawDef(st, u).name + ' is Cursed and produces no ●.');
      return 'done';
    },
    // Yes/no gate. "No" skips the rest of the steps.
    confirm: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'confirm', prompt: s.prompt || 'Use this effect?' });
      if (!ans) { res.i = res.steps.length - 1; log(st, st.players[res.player].name + ' declines.'); return 'done'; }
      if (s.consume) { removeFromHand(st, res.player, res.src); toDiscard(st, res.src); log(st, st.players[res.player].name + ' reveals ' + rawDef(st, res.src).name + '.'); }
      return 'done';
    },
    // Alchemy Lab: pick a different suit for each of three cards.
    alchemy: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = { i: 0, used: [] }), cells = s.cells.filter(function (k) { var t = top(st, k); return t && !untargetable(st, t); });
      if (ans !== undefined) { var t0 = top(st, cells[sub.i]); st.cards[t0].suit = ans; sub.used.push(ans); log(st, rawDef(st, t0).name + ' is now ' + ans + ' (Alchemy Lab).'); sub.i++; }
      if (sub.i >= cells.length) return 'done';
      return pend(res, { kind: 'suit', options: SUITS.filter(function (x) { return sub.used.indexOf(x) < 0; }), prompt: 'Alchemy Lab: new suit for ' + rawDef(st, top(st, cells[sub.i])).name + ' at ' + cells[sub.i] + ' (each must differ).' });
    },
    // Last Will and Testament: keep a card for a free play next turn.
    setAside: function (st, res, s, ans) {
      var pl = st.players[res.player], opts = discardable(st, res.player);
      if (!opts.length) return 'done';
      if (ans === undefined) return pend(res, { kind: 'hand', count: 1, options: opts, prompt: 'Set a card aside. You may play it for free on your next turn.' });
      removeFromHand(st, res.player, ans[0]); (pl.aside = pl.aside || []).push(ans[0]);
      log(st, pl.name + ' sets a card aside for next turn.'); return 'done';
    },
    // Funeral Pyre ability.
    buryUnderSelf: function (st, res, s, ans) {
      var opts = discardable(st, res.player); if (!opts.length) return 'done';
      if (ans === undefined) return pend(res, { kind: 'hand', count: 1, options: opts, prompt: 'Bury a card from your hand under ' + rawDef(st, res.src).name + '.' });
      removeFromHand(st, res.player, ans[0]); st.board[res.srcKey].splice(1, 0, ans[0]); onBuried(st, ans[0], res.srcKey);
      log(st, st.players[res.player].name + ' buries ' + rawDef(st, ans[0]).name + ' under ' + rawDef(st, res.src).name + '.'); return 'done';
    },
    // Proliferation: add a new copy of a card in your Kingdom to your hand.
    copyToHand: function (st, res, s, ans) {
      if (ans === undefined) {
        var t = kingdom(st, res.player).filter(function (k) { var u = top(st, k); return hasSuit(st, u, s.suit) && !isFoundation(st, u); });
        if (!t.length) { log(st, 'No ' + s.suit + ' card in your Kingdom to copy.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a ' + s.suit + ' card in your Kingdom to copy into your hand.', verb: 'copy' });
      }
      var nu = mkCard(st, st.cards[top(st, ans)].def); st.players[res.player].hand.push(nu);
      log(st, st.players[res.player].name + ' adds a copy of ' + rawDef(st, nu).name + ' to their hand.'); return 'done';
    },
    // Tithe: the victim offers 2 cards and you take one at random.
    tithe: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {});
      if (sub.stage === 'hand') {
        st.seed = (st.seed * 1103515245 + 12345) % 2147483648; var pick = ans[st.seed % ans.length];
        removeFromHand(st, sub.victim, pick); st.players[res.player].hand.push(pick);
        log(st, st.players[sub.victim].name + ' offers ' + ans.length + ' card' + (ans.length > 1 ? 's' : '') + '; ' + st.players[res.player].name + ' takes one at random.'); return 'done';
      }
      if (ans === undefined) {
        var t = keys(st).filter(function (k) { var u = top(st, k), c = st.cards[u]; if (!c.claimants.length || c.claimants.indexOf(res.player) >= 0 || c.ruined || untargetable(st, u)) return false; return n4(k).filter(function (x) { var y = top(st, x); return y && hasSuit(st, y, s.suit); }).length >= (+s.need || 2); });
        if (!t.length) { log(st, 'No opponent card with ' + s.need + ' neighboring ' + s.suit + ' cards.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a card with at least ' + s.need + ' neighboring ' + s.suit + ' cards.', verb: 'target' });
      }
      affect(res, ans); var v = st.cards[top(st, ans)].claimants[0], n = Math.min(2, discardable(st, v).length);
      if (!n) { log(st, st.players[v].name + ' has no cards to offer.'); return 'done'; }
      sub.victim = v; sub.stage = 'hand';
      return { kind: 'hand', player: v, count: n, options: discardable(st, v), prompt: st.players[v].name + ': choose ' + n + ' card' + (n > 1 ? 's' : '') + ' to offer (Tithe). One is taken at random.' };
    },
    // Confessional: move a Curse (from the board or your hand) to the Archbishop's hand for ◇.
    confess: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {}), p = res.player, conf = res.srcKey;
      function reward() {
        bank(st, p, +s.gain || 3, res.src); log(st, st.players[p].name + ' confesses a Curse at ' + rawDef(st, res.src).name + ' and banks ' + (s.gain || 3) + '◇.');
        return 'done';
      }
      var handCurses = st.players[p].arch === s.toArchetype ? [] : discardable(st, p).filter(function (u) { return !!rawDef(st, u).curse; }); // the confessor of record can't confess to themselves from hand
      function hear(cu) {
        var arch = s.toArchetype ? st.players.findIndex(function (q) { return q.arch === s.toArchetype && !q.out; }) : -1;
        toDiscard(st, cu);
        if (arch >= 0) { st.discard.pop(); st.players[arch].hand.push(cu); log(st, st.players[arch].name + ' (' + s.toArchetype + ') hears the confession and takes ' + rawDef(st, cu).name + ' into hand.'); }
        else log(st, rawDef(st, cu).name + ' is discarded: no ' + s.toArchetype + ' is here to hear it.');
      }
      if (sub.stage === 'hand') { removeFromHand(st, p, ans[0]); hear(ans[0]); return reward(); }
      if (ans === undefined) {
        var t = keys(st).filter(function (k) { return k !== conf && isCursed(st, k); });
        if (!t.length) { if (!handCurses.length) { log(st, 'There is no Curse to confess.'); return 'done'; } sub.stage = 'hand'; return pend(res, { kind: 'hand', count: 1, options: handCurses, prompt: 'Choose a Curse from your hand to bury under the Confessional.' }); }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose a Cursed card: its Curse is buried under the Confessional.' + (handCurses.length ? ' Or Skip to use a Curse from your hand.' : ''), verb: 'cleanse', optional: true });
      }
      if (ans === null) { if (!handCurses.length) return 'done'; sub.stage = 'hand'; return pend(res, { kind: 'hand', count: 1, options: handCurses, prompt: 'Choose a Curse from your hand to bury under the Confessional.' }); }
      var cu;
      if (isCovered(st, ans)) { cu = st.board[ans].shift(); var tc = st.cards[top(st, ans)]; (tc.prevClaimants || []).forEach(function (o) { if (st.players[o].meeples > 0) { st.players[o].meeples--; tc.claimants.push(o); } }); tc.prevClaimants = null; }
      else { cu = curseCardsUnder(st, ans)[0]; st.board[ans].splice(st.board[ans].indexOf(cu), 1); }
      hear(cu); affect(res, ans);
      return reward();
    },
    // Errata: move one of your meeples to another card.
    moveMeeple: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {}), p = res.player;
      if (sub.stage === 'to') {
        if (!ans) return 'done';
        var fc = st.cards[top(st, sub.from)]; fc.claimants.splice(fc.claimants.indexOf(p), 1); st.cards[top(st, ans)].claimants.push(p);
        log(st, st.players[p].name + ' moves a meeple from ' + rawDef(st, top(st, sub.from)).name + ' to ' + rawDef(st, top(st, ans)).name + '.'); return 'done';
      }
      if (ans === undefined) {
        var mine = keys(st).filter(function (k) { var u = top(st, k), c = st.cards[u]; return !c.fixed && !c.ruined && !c.ascended && c.claimants.indexOf(p) >= 0; });
        if (!mine.length) { log(st, 'You have no deployed meeple to move.'); return 'done'; }
        return pend(res, { kind: 'cell', options: mine, prompt: 'Choose one of your claimed cards to take a meeple from.', verb: 'target', optional: true });
      }
      if (!ans) return 'done';
      sub.from = ans; sub.stage = 'to';
      var to = keys(st).filter(function (k) { var u = top(st, k), c = st.cards[u], d = def(st, u); if (k === ans || c.ruined || unclaimable(st, u) || isCovered(st, k) || c.claimants.indexOf(p) >= 0) return false; return !c.claimants.length || (d.mods && d.mods.multiClaim); });
      if (!to.length) { log(st, 'No claimable card to move to.'); return 'done'; }
      return pend(res, { kind: 'cell', options: to, prompt: 'Choose a claimable card to move the meeple to.', verb: 'claim', optional: true });
    },
    // University: offer to swap meeples with an opponent. If they refuse, you park a meeple on University.
    uniSwap: function (st, res, s, ans) {
      var sub = res.sub || (res.sub = {}), p = res.player;
      if (sub.stage === 'ask') {
        var a = st.cards[top(st, sub.mine)], b = st.cards[top(st, sub.theirs)], v = sub.victim;
        if (ans) { a.claimants[a.claimants.indexOf(p)] = v; b.claimants[b.claimants.indexOf(v)] = p; log(st, st.players[v].name + ' agrees: the meeples on ' + rawDef(st, a.uid).name + ' and ' + rawDef(st, b.uid).name + ' are swapped.'); }
        else if (st.players[p].meeples > 0) { st.players[p].meeples--; var uc = st.cards[res.src]; uc.parked = uc.parked || {}; uc.parked[p] = (uc.parked[p] || 0) + 1; log(st, st.players[v].name + ' refuses. ' + st.players[p].name + ' places a meeple from their bank on ' + rawDef(st, res.src).name + '.'); }
        else log(st, st.players[v].name + ' refuses.');
        return 'done';
      }
      if (sub.stage === 'theirs') {
        if (!ans) return 'done';
        sub.theirs = ans; sub.victim = st.cards[top(st, ans)].claimants.filter(function (o) { return o !== p; })[0]; sub.stage = 'ask';
        return { kind: 'confirm', player: sub.victim, prompt: st.players[sub.victim].name + ': ' + st.players[p].name + ' offers to swap their meeple on ' + rawDef(st, top(st, sub.mine)).name + ' for yours on ' + rawDef(st, top(st, ans)).name + '. Accept?' };
      }
      if (ans === undefined) {
        var mine = keys(st).filter(function (k) { var c = st.cards[top(st, k)]; return !c.fixed && !c.ruined && !c.ascended && c.claimants.indexOf(p) >= 0; });
        if (!mine.length) { log(st, 'You have no meeple on the board to offer.'); return 'done'; }
        return pend(res, { kind: 'cell', options: mine, prompt: 'Choose your card to offer in the swap.', verb: 'target', optional: true });
      }
      if (!ans) return 'done';
      sub.mine = ans; sub.stage = 'theirs';
      var theirs = keys(st).filter(function (k) { var c = st.cards[top(st, k)]; return !c.fixed && !c.ruined && !c.ascended && c.claimants.length && c.claimants.indexOf(p) < 0; });
      if (!theirs.length) { log(st, 'No opponent meeple to swap with.'); return 'done'; }
      return pend(res, { kind: 'cell', options: theirs, prompt: 'Choose an opponent’s card to swap meeples with.', verb: 'target', optional: true });
    },
    payAP: function (st, res, s) { spend(st.players[res.player], +s.n || 0); return 'done'; },
    tokens: function (st, res, s) { bank(st, res.player, +s.n || 0, res.src); log(st, st.players[res.player].name + ' banks ' + s.n + '◇.'); return 'done'; },
    // Move the source card to an empty adjacent cell (Choreography and Merriment).
    move: function (st, res, s, ans) {
      if (ans === undefined) {
        var t = n4(res.srcKey).filter(function (k) { return !top(st, k) && n4(k).some(function (x) { return x !== res.srcKey && top(st, x); }); });
        if (!t.length) { log(st, 'No empty adjacent space.'); return 'done'; }
        return pend(res, { kind: 'cell', options: t, prompt: 'Choose an empty adjacent space to move to.', verb: 'move', empty: true, optional: true });
      }
      if (ans) { st.board[ans] = st.board[res.srcKey]; delete st.board[res.srcKey]; log(st, rawDef(st, res.src).name + ' moves to ' + ans + '.'); res.srcKey = ans; (st.moves = st.moves || []).push(ans); }
      return 'done';
    },
    // Anything not automated: show the text and let the players resolve it by hand.
    manual: function (st, res, s, ans) {
      if (ans === undefined) return pend(res, { kind: 'manual', prompt: s.text || 'Resolve this effect by hand, then click Done.' });
      return 'done';
    }
  };
  // Indexes of the other players still in the game.
  function others(st, p) { return st.players.map(function (q, i) { return i; }).filter(function (i) { return i !== p && !st.players[i].out; }); }

  // Step through st.res until it finishes or stops on a prompt. `ans` answers the prompt that was pending.
  // A step with `requires` is skipped unless an earlier step set that flag in ctx.
  function runRes(st, ans) {
    var res = st.res;
    while (res) {
      if (res.i >= res.steps.length) { finishRes(st); return; }
      var s = res.steps[res.i], h = H[s.do] || H.manual;
      if (s.requires && !res.ctx[s.requires]) { res.i++; res.sub = null; continue; }
      var r = h(st, res, s, ans); ans = undefined;
      if (r === 'done') { res.i++; res.sub = null; st.pending = null; continue; }
      st.pending = r; return;
    }
  }
  // Effect done: decide where the played card goes. Actions and Blessings are buried under a card
  // (the player picks if there's a choice), Curses attach to their target, everything else stays put.
  function finishRes(st) {
    var res = st.res, d = rawDef(st, res.src), p = res.player;
    if (res.phase === 'bury') {
      // answered bury target
      return;
    }
    if (res.kind === 'play' && (d.type === 'Action' || d.type === 'Blessing') && res.ctx.curseBlocked) {
      if (res.srcKey && top(st, res.srcKey) === res.src) { st.board[res.srcKey].shift(); if (!st.board[res.srcKey].length) delete st.board[res.srcKey]; }
      toDiscard(st, res.src); log(st, d.name + ' is blocked and discarded.'); endRes(st); return;
    }
    if (res.kind === 'play' && (d.type === 'Action' || d.type === 'Blessing')) {
      var opts = res.ctx.affected.filter(function (k) { return top(st, k) && k !== res.srcKey; });
      if (!opts.length) opts = res.srcKey ? n4(res.srcKey).filter(function (k) { return top(st, k); }) : keys(st);
      if ((d.mods || {}).burialEffect) opts = keys(st).filter(function (k) { var u = top(st, k); return k !== res.srcKey && !st.cards[u].ruined && !untargetable(st, u) && !isCovered(st, k); });
      if (!opts.length) { if (res.srcKey) { st.board[res.srcKey].shift(); if (!st.board[res.srcKey].length) delete st.board[res.srcKey]; } toDiscard(st, res.src); log(st, d.name + ' has nothing to be buried under and is discarded.'); endRes(st); return; }
      if (opts.length === 1) { buryAction(st, opts[0]); endRes(st); return; }
      res.phase = 'bury'; st.pending = { kind: 'cell', player: p, options: opts, prompt: 'Bury ' + d.name + ' under which card?', verb: 'bury' }; return;
    }
    if (res.kind === 'play' && d.type === 'Curse') {
      var tk = res.ctx.curseTarget;
      if (res.srcKey && top(st, res.srcKey) === res.src) { st.board[res.srcKey].shift(); if (!st.board[res.srcKey].length) delete st.board[res.srcKey]; }
      if (!tk || !top(st, tk) || res.ctx.curseBlocked) { toDiscard(st, res.src); log(st, d.name + (res.ctx.curseBlocked ? ' is blocked' : ' found no target') + ' and is discarded.'); endRes(st); return; }
      if (d.curse && d.curse.mode === 'top') {
        var tu = top(st, tk), tc = st.cards[tu];
        tc.prevClaimants = tc.claimants.slice(); returnMeeples(st, tu);
        st.board[tk].unshift(res.src); log(st, d.name + ' covers ' + rawDef(st, tu).name + '. It loses its effects and owner.');
      } else { st.board[tk].splice(1, 0, res.src); log(st, d.name + ' is tucked under ' + rawDef(st, top(st, tk)).name + '.'); }
      endRes(st); return;
    }
    endRes(st);
  }
  // Move the resolving card from its cell (if it had one) to under the card at k.
  function buryAction(st, k) {
    var res = st.res; if (res.srcKey) { st.board[res.srcKey].shift(); if (!st.board[res.srcKey].length) delete st.board[res.srcKey]; }
    st.board[k].splice(1, 0, res.src); log(st, rawDef(st, res.src).name + ' is buried under ' + rawDef(st, top(st, k)).name + '.');
    onBuried(st, res.src, k);
  }
  // Clear the effect and run the rule checks. If End turn was waiting on this effect, finish ending the turn.
  function endRes(st) {
    var p = st.res.player; st.res = null; st.pending = null; afterBoardChange(st, p);
    if (!st.res && st.endAfter) { st.endAfter = false; var sc = scores(st)[st.cur]; if (sc.total >= st.opts.target) { st.winner = st.cur; log(st, st.players[st.cur].name + ' ends their turn with ' + sc.total + '◇ and wins!'); } else if (st.winner == null) nextPlayer(st); }
  }

  /* ---------- turn flow ---------- */
  // Fresh turn record. Nothing happens until the player starts the turn (or reclaims a meeple instead).
  function beginTurn(st) {
    var p = st.cur, pl = st.players[p];
    st.turn = { started: false, claimed: false, lastKey: null, used: {}, paid: {}, played: 0 };
    log(st, '— ' + pl.name + '’s turn (round ' + st.round + ') —');
  }
  // Start of turn: tokens, set-aside cards back to hand, ● income (or seat-start ●), pay debt, draw.
  function startTurn(st) {
    var p = st.cur, pl = st.players[p];
    // per-turn tokens (Acorn)
    kingdom(st, p).forEach(function (k) { var u = top(st, k), d = def(st, u); if (d.perTurn && d.perTurn.token && d.perTurn.when !== 'everyTurnEnd' && d.perTurn.when !== 'ownerTurnEnd' && active(st, k)) st.cards[u].tokens += +d.perTurn.token; });
    (pl.aside || []).splice(0).forEach(function (u) { pl.hand.push(u); st.cards[u].free = pl.turns; log(st, pl.name + ' takes back the card set aside: it is free to play this turn.'); });
    pl.ap = income(st, p);
    if (st.opts.seatStart && pl.turns === 1 && !pl.foundationPlaced) pl.ap = 3 * (p + 1);
    if (pl.debt) { log(st, pl.name + ' pays ' + Math.min(pl.debt, pl.ap) + '● owed for reactions.'); pl.ap = Math.max(0, pl.ap - pl.debt); pl.debt = 0; }
    kingdom(st, p).forEach(function (k) { st.turn.paid[top(st, k)] = 1; });
    var got = draw(st, p, st.opts.drawPerTurn != null ? +st.opts.drawPerTurn : 1);
    st.turn.started = true;
    log(st, pl.name + ' gains ' + pl.ap + '● and draws ' + got + '.');
  }
  // Pass to the next player who isn't out. Wrapping back to seat 0 starts a new round.
  function nextPlayer(st) {
    var n = st.players.length, i = st.cur;
    for (var t = 0; t < n; t++) { i = (i + 1) % n; if (i === 0) st.round++; if (!st.players[i].out) break; }
    st.cur = i; st.players[i].turns++; beginTurn(st);
  }

  // Fresh game state. `defs` is the card library; `setup` holds the players and rule options
  // (see opts). A sandbox has no deck or turns.
  function newGame(defs, setup) {
    var st = {
      v: 1, defs: {}, players: [], cur: 0, round: 1, deck: [], discard: [], board: {}, cards: {}, uid: 1,
      turn: null, res: null, pending: null, reveal: null, log: [], winner: null, seed: (setup.seed || Date.now()) % 2147483647,
      opts: { handSize: setup.handSize || 4, meeples: setup.meeples || 8, target: setup.target || 48, sandbox: !!setup.sandbox, enforceWeak: setup.enforceWeak !== false, foundationBy: setup.foundationBy || 3, drawPerTurn: setup.drawPerTurn != null ? +setup.drawPerTurn : 2, autoEnd: setup.autoEnd !== false, seatStart: setup.seatStart !== false,
        burySuitOW: setup.burySuitOW !== false, defense: setup.defense !== false, adjDiscount: setup.adjDiscount !== false, noWander: setup.noWander !== false, ascension: setup.ascension !== false }
    };
    defs.forEach(function (d) { var c = clone(d); c.art = ''; st.defs[d.id] = c; });
    // A card instance: a uid like "c12" plus its in-play state, pointing at a definition id.
    function mk(id) { var u = 'c' + (st.uid++); st.cards[u] = { uid: u, def: id, suit: null, ruined: false, overwhelmed: false, claimants: [], tokens: 0, copyOf: null, prevClaimants: null, fixed: false }; return u; }
    var arch = archInfo(st);
    setup.players.forEach(function (sp, i) {
      var a = arch[sp.arch] || {};
      var pl = { name: sp.name || ('Player ' + (i + 1)), color: sp.color, arch: sp.arch, foundation: a.foundation || null, foundationUid: null, foundationPlaced: false, hand: [], meeples: st.opts.meeples, tokens: 0, ap: 0, out: false, turns: 0 };
      if (a.foundation) { pl.foundationUid = mk(a.foundation); pl.hand.push(pl.foundationUid); }
      st.players.push(pl);
    });
    if (!st.opts.sandbox) {
      defs.forEach(function (d) { if (d.type === 'Foundation') return; for (var i = 0; i < (+d.copies || 0); i++) st.deck.push(mk(d.id)); });
      shuffle(st.deck, st);
      st.players.forEach(function (pl, i) { draw(st, i, st.opts.handSize); });
      st.players[0].turns = 1;
      log(st, 'New game: ' + st.players.map(function (p) { return p.name + ' (' + p.arch + ')'; }).join(', ') + '.');
      beginTurn(st);
    } else {
      st.turn = { started: true, claimed: false, lastKey: null, used: {}, paid: {}, played: 0 };
      log(st, 'Sandbox started.');
    }
    return st;
  }
  function mkCard(st, id) { var u = 'c' + (st.uid++); st.cards[u] = { uid: u, def: id, suit: null, ruined: false, overwhelmed: false, claimants: [], tokens: 0, copyOf: null, prevClaimants: null, fixed: false }; return u; }

  // Actions/Blessings whose effect never looks at the cards around them are played straight from hand.
  function needsPlacement(d) {
    if (d.type !== 'Action' && d.type !== 'Blessing' && d.type !== 'Curse') return true;
    if (d.curse && d.curse.mode === 'top') return true;
    var AREA = ['ruin', 'setSuit', 'curse', 'removeCurse', 'discardDownTo', 'copy'];
    return (d.onPlay || []).some(function (s) { return s.do === 'move' || (AREA.indexOf(s.do) >= 0 && (!s.area || s.area === 'adjacent' || s.area === 'east1' || s.area === 'ring3')); });
  }
  // Start resolving `steps` for card uid at cell k (null when played from hand).
  function startRes(st, kind, uid, k, steps) {
    st.res = { kind: kind, src: uid, srcKey: k, player: st.cur, steps: clone(steps || []), i: 0, sub: null, ctx: { affected: [] }, phase: null };
    runRes(st);
  }

  // Rule violations come back as st.error on the returned state; nothing is thrown.
  // Abandon the resolving effect. A played Action, Blessing or Curse goes to the discard pile.
  function cancelRes(st) {
    var rs = st.res; st.res = null; st.pending = null; var d3 = rawDef(st, rs.src);
    if (rs.kind === 'play' && (d3.type === 'Action' || d3.type === 'Blessing' || d3.type === 'Curse') && rs.srcKey && top(st, rs.srcKey) === rs.src) { st.board[rs.srcKey].shift(); if (!st.board[rs.srcKey].length) delete st.board[rs.srcKey]; toDiscard(st, rs.src); }
    else if (rs.kind === 'play' && !rs.srcKey) toDiscard(st, rs.src);
  }

  function err(st, m) { st.error = m; return st; }

  // The one entry point: apply(state, action) returns a new state. Actions look like { t: "play", uid, k }.
  // The UI, the tests and the simulator all play the game through this.
  function apply(st0, a) {
    var st = clone(st0); st.error = null;
    var p = a.p != null ? a.p : st.cur;
    if (st.winner != null && a.t !== 'closeReveal') return err(st, 'The game is over.');
    switch (a.t) {
      case 'startTurn':
        if (st.turn.started) return err(st, 'Turn already started.');
        startTurn(st); return st;

      // Instead of starting a turn: take back a meeple. This ends the turn.
      case 'reclaim': {
        if (st.turn.started) return err(st, 'Take back a meeple instead of starting your turn.');
        var k = a.k, u = top(st, k);
        if (!u || st.cards[u].fixed || st.cards[u].claimants.indexOf(p) < 0) return err(st, 'Choose a card that holds one of your meeples.');
        if (st.cards[u].ascended) return err(st, 'An Ascended card cannot change hands.');
        st.cards[u].claimants.splice(st.cards[u].claimants.indexOf(p), 1); st.players[p].meeples++;
        log(st, st.players[p].name + ' takes back a meeple from ' + rawDef(st, u).name + ' and ends their turn.');
        nextPlayer(st); return st;
      }

      // Place a card from hand at a.k, pay for it, then resolve its onPlay steps.
      case 'play': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started) return err(st, 'Start your turn first.');
        var pl = st.players[p], uid = a.uid;
        if (pl.hand.indexOf(uid) < 0) return err(st, 'That card is not in your hand.');
        var why = playBlock(st, p, uid); if (why) return err(st, why);
        var legal = legalCells(st, uid);
        if (!(a.k in legal) && !st.opts.sandbox) return err(st, 'You cannot place that card there.');
        var cost = legal[a.k] != null ? legal[a.k] : 0;
        if (!st.opts.sandbox && cost > funds(pl)) return err(st, 'Not enough ● (costs ' + cost + ', you have ' + funds(pl) + ').');
        if (!st.opts.sandbox) spend(pl, cost);
        removeFromHand(st, p, uid);
        st.board[a.k] = [uid]; st.turn.lastKey = a.k; st.turn.played++;
        var d = rawDef(st, uid);
        log(st, pl.name + ' plays ' + d.name + ' at ' + a.k + ' for ' + cost + '●.');
        if (d.type === 'Foundation') {
          st.cards[uid].claimants = [p]; st.cards[uid].fixed = true; pl.foundationPlaced = true;
          if (!st.opts.sandbox) { pl.ap += +d.income || 0; st.turn.paid[uid] = 1; log(st, d.name + ' produces ' + d.income + '● right away.'); }
        }
        checkSarcophagusRelease(st, a.k);
        if (['Action', 'Blessing', 'Curse'].indexOf(d.type) < 0) checkWatchmakers(st);
        startRes(st, 'play', uid, a.k, d.onPlay);
        return st;
      }

      // Play an Action or Blessing straight from hand, without placing it.
      case 'cast': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started) return err(st, 'Start your turn first.');
        var cp = st.players[p], cuid = a.uid;
        if (cp.hand.indexOf(cuid) < 0) return err(st, 'That card is not in your hand.');
        var cdef = rawDef(st, cuid);
        if (needsPlacement(cdef)) return err(st, cdef.name + ' must be placed on the board.');
        var cwhy = playBlock(st, p, cuid); if (cwhy) return err(st, cwhy);
        var ccost = isFree(st, cuid) ? 0 : (+cdef.cost || 0);
        if (!st.opts.sandbox && ccost > funds(cp)) return err(st, 'Not enough AP (costs ' + ccost + ', you have ' + funds(cp) + ').');
        if (!st.opts.sandbox) spend(cp, ccost);
        removeFromHand(st, p, cuid); st.turn.played++;
        log(st, cp.name + ' plays ' + cdef.name + ' from hand for ' + ccost + '●.');
        startRes(st, 'play', cuid, null, cdef.onPlay);
        return st;
      }

      // Answer the pending prompt with a.v, after checking it fits the prompt's kind.
      case 'answer': {
        var pd = st.pending; if (!pd) return err(st, 'Nothing to answer.');
        var v = a.v;
        if (pd.kind === 'cell') { if (v === null) { if (!pd.optional) return err(st, 'You must choose a card.'); } else if (pd.options.indexOf(v) < 0) return err(st, 'Not a valid choice.'); }
        if (pd.kind === 'hand') { var hh = st.players[pd.player].hand; if (!Array.isArray(v) || v.length !== pd.count || v.some(function (u, i) { return (pd.options || hh).indexOf(u) < 0 || v.indexOf(u) !== i; })) return err(st, 'Choose exactly ' + pd.count + ' card(s).'); }
        if (pd.kind === 'suit' && SUITS.indexOf(v) < 0 && !(pd.allowKeep && v === 'keep')) return err(st, 'Choose a suit.');
        if (pd.kind === 'player' && pd.options.indexOf(v) < 0 && !(pd.allowNone && v === null)) return err(st, 'Choose a player.');
        if (pd.kind === 'confirm' && typeof v !== 'boolean') return err(st, 'Answer yes or no.');
        st.pending = null;
        if (st.res && st.res.phase === 'bury') { buryAction(st, v); endRes(st); return st; }
        runRes(st, v); return st;
      }

      // Once per turn: put a meeple on the last card placed, or on an unclaimed card next to it.
      case 'claim': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started && !st.opts.sandbox) return err(st, 'Start your turn first.');
        if (st.turn.claimed && !st.opts.sandbox) return err(st, 'You already claimed a card this turn.');
        var ck = a.k, cu = top(st, ck); if (!cu) return err(st, 'No card there.');
        var cc = st.cards[cu], cd = def(st, cu), plc = st.players[p];
        if (!st.opts.sandbox) {
          var ok = ck === st.turn.lastKey || (st.turn.lastKey && n4(st.turn.lastKey).indexOf(ck) >= 0 && (!cc.claimants.length || (cd.mods && cd.mods.multiClaim)));
          if (!ok) return err(st, 'Claim the last card you placed, or an unclaimed card next to it.');
        }
        if (cc.ruined) return err(st, 'Ruined cards cannot be claimed.');
        if (unclaimable(st, cu)) return err(st, cd.name + ' cannot be claimed.');
        if (cc.claimants.indexOf(p) >= 0) return err(st, 'You already own that card.');
        if (cc.claimants.length && !(cd.mods && cd.mods.multiClaim)) return err(st, 'That card is already claimed.');
        if (cc.ascended && cc.claimants.length) return err(st, 'An Ascended card cannot change hands.');
        if (plc.meeples <= 0) return err(st, 'You have no meeples left.');
        cc.claimants.push(p); plc.meeples--; st.turn.claimed = true;
        log(st, plc.name + ' claims ' + cd.name + '.');
        if (!st.opts.sandbox && !st.turn.paid[cu]) { var inc = cardIncome(st, ck); if (inc) { plc.ap += inc; log(st, cd.name + ' produces ' + inc + '● right away.'); } st.turn.paid[cu] = 1; }
        var drain = [ck].concat(n4(ck)).filter(function (x) { var t = top(st, x); return t && active(st, x) && mods(st, t).claimDrain && mods(st, t).claimDrain !== plc.arch; })[0];
        if (drain && !st.opts.sandbox && plc.ap) { log(st, rawDef(st, top(st, drain)).name + ': ' + plc.name + ' loses their remaining ' + plc.ap + '●.'); plc.ap = 0; }
        afterBoardChange(st, p); return st;
      }

      // Use a card's once-per-turn ability. Each ability kind is turned into effect steps here.
      case 'ability': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started) return err(st, 'Start your turn first.');
        var ak = a.k, au = top(st, ak); if (!au || !active(st, ak)) return err(st, 'That card is not active.');
        var ad = def(st, au), ab = ad.ability; if (!ab) return err(st, 'That card has no ability.');
        if (!ab.anyPlayer && !ownedBy(st, ak, p)) return err(st, 'You can only use abilities on cards you own.');
        if (st.turn.used[au]) return err(st, 'Already used this turn.');
        if ((+ab.pay || 0) > funds(st.players[p])) return err(st, 'Not enough ●.');
        st.turn.used[au] = 1;
        var steps = [];
        if (+ab.pay) steps.push({ do: 'payAP', n: +ab.pay });
        if (ab.kind === 'exchange') steps.push({ do: 'tokens', n: +ab.gain || 0 });
        else if (ab.kind === 'convert') steps.push({ do: 'setSuit', area: ab.area || 'adjacent', suit: 'choose' });
        else if (ab.kind === 'move') steps.push({ do: 'move' });
        else if (ab.kind === 'buryHand') steps.push({ do: 'buryUnderSelf' });
        else if (ab.kind === 'confess') steps.push({ do: 'confess', gain: ab.gain, toArchetype: ab.toArchetype || 'Archbishop' });
        else if (ab.kind === 'swapMeeple') steps.push({ do: 'uniSwap' });
        else if (ab.kind === 'artillery') steps.push({ do: 'ruin', area: 'adjacentToOwnSuit', suit: ab.suit || 'Sword', oppOwned: true });
        else if (ab.kind === 'scry') steps.push({ do: 'scry' });
        else steps.push({ do: 'manual', text: ab.text || 'Resolve this ability by hand.' });
        log(st, st.players[p].name + ' uses ' + ad.name + '.');
        startRes(st, 'ability', au, ak, steps); return st;
      }

      // Discard 2 cards, draw 1.
      case 'swap': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started) return err(st, 'Start your turn first.');
        var sp = st.players[p];
        if (!Array.isArray(a.uids) || a.uids.length !== 2 || a.uids.some(function (u) { return sp.hand.indexOf(u) < 0; }) || a.uids[0] === a.uids[1]) return err(st, 'Choose 2 cards from your hand.');
        if (a.uids.some(function (u) { return isFoundation(st, u); })) return err(st, 'You cannot discard your Foundation.');
        a.uids.forEach(function (u) { removeFromHand(st, p, u); st.discard.push(u); });
        var g = draw(st, p, 1); log(st, sp.name + ' discards 2 cards and draws ' + g + '.'); return st;
      }

      // End-of-turn effects, then the win check, then the next player.
      case 'endTurn': {
        if (st.pending || st.res) return err(st, 'Finish the current effect first.');
        if (!st.turn.started) return err(st, 'Start your turn first.');
        var ep = st.players[p];
        if (!ep.foundationPlaced && ep.turns >= st.opts.foundationBy && st.opts.foundationBy > 0) return err(st, 'You must place your Foundation by your turn ' + st.opts.foundationBy + '.');
        endOfTurnEffects(st); afterBoardChange(st, p);
        if (st.res || st.pending) { st.endAfter = true; return st; }
        var sc = scores(st)[p];
        if (sc.total >= st.opts.target) { st.winner = p; log(st, ep.name + ' ends their turn with ' + sc.total + '◇ and wins!'); return st; }
        nextPlayer(st); return st;
      }

      case 'closeReveal': st.reveal = null; return st;

      // Player a.p leaves (online: quits or stays disconnected). They are out, exactly as if Overwhelmed.
      // Anything waiting on them is dropped so the game can carry on.
      case 'resign': {
        var rp = a.p, rpl = st.players[rp];
        if (!rpl || rpl.out) return err(st, 'That player is not in the game.');
        st.reactions = (st.reactions || []).filter(function (r) { return r.p !== rp; });
        if (st.res && (st.res.player === rp || (st.pending && st.pending.player === rp))) cancelRes(st);
        st.reveal = st.reveal && (st.reveal.to === rp || st.reveal.of === rp) ? null : st.reveal;
        eliminate(st, rp, rpl.name + ' leaves the game.');
        if (st.winner != null) return st;
        if (st.cur === rp) { st.res = null; st.pending = null; st.endAfter = false; nextPlayer(st); return st; }
        if (!st.res) runReactions(st);
        if (!st.res && st.endAfter) { st.endAfter = false; var rs = scores(st)[st.cur]; if (rs.total >= st.opts.target) { st.winner = st.cur; log(st, st.players[st.cur].name + ' ends their turn with ' + rs.total + '◇ and wins!'); } else nextPlayer(st); }
        return st;
      }

      /* ----- referee / sandbox tools: free edits ----- */
      // These bypass the normal rules. Used by the sandbox, the referee tools and the tests.
      case 'sbPlace': { var nu = mkCard(st, a.id); if (top(st, a.k)) st.board[a.k].unshift(nu); else st.board[a.k] = [nu]; var dd = rawDef(st, nu); if (dd.type === 'Foundation' && a.owner != null) { st.cards[nu].claimants = [a.owner]; st.cards[nu].fixed = true; st.players[a.owner].foundationPlaced = true; st.players[a.owner].foundationUid = nu; } log(st, 'Placed ' + dd.name + ' at ' + a.k + '.'); if (a.check) afterBoardChange(st, null); return st; }
      case 'sbBury': { var bu = mkCard(st, a.id); if (!top(st, a.k)) return err(st, 'No card there.'); st.board[a.k].splice(1, 0, bu); log(st, 'Buried ' + rawDef(st, bu).name + ' under ' + rawDef(st, top(st, a.k)).name + '.'); onBuried(st, bu, a.k); return st; }
      case 'sbRemove': { var ru = top(st, a.k); if (!ru) return st; returnMeeples(st, ru); st.board[a.k].shift(); if (!st.board[a.k].length) delete st.board[a.k]; if (st.opts.sandbox) delete st.cards[ru]; else toDiscard(st, ru); log(st, 'Removed the top card at ' + a.k + '.'); return st; }
      case 'sbUnbury': { var s2 = st.board[a.k]; if (!s2 || s2.length < 2) return st; var ub = s2.splice(1, 1)[0]; if (st.opts.sandbox) delete st.cards[ub]; else toDiscard(st, ub); log(st, 'Removed a buried card at ' + a.k + '.'); return st; }
      case 'sbRuin': { var xu = top(st, a.k); if (!xu) return st; if (st.cards[xu].ruined) { st.cards[xu].ruined = false; st.cards[xu].overwhelmed = false; log(st, 'Flipped ' + rawDef(st, xu).name + ' face up.'); } else ruinAt(st, a.k, a.credit != null ? a.credit : null, 'ruin'); return st; }
      case 'sbSuit': { var su = top(st, a.k); if (!su) return st; st.cards[su].suit = a.suit === rawDef(st, su).suit ? null : a.suit; log(st, rawDef(st, su).name + ' is now ' + a.suit + '.'); if (a.check) afterBoardChange(st, null); return st; }
      case 'sbClaim': { var mu = top(st, a.k); if (!mu) return st; var mc = st.cards[mu]; var ix = mc.claimants.indexOf(a.owner); if (ix >= 0) { mc.claimants.splice(ix, 1); if (!mc.fixed) st.players[a.owner].meeples++; } else { mc.claimants.push(a.owner); if (!mc.fixed) st.players[a.owner].meeples--; } return st; }
      case 'sbTokens': { var tu2 = top(st, a.k); if (!tu2) return st; st.cards[tu2].tokens = Math.max(0, (st.cards[tu2].tokens || 0) + a.d); return st; }
      case 'sbMove': { if (!top(st, a.from) || top(st, a.to)) return err(st, 'Move needs a card and an empty space.'); st.board[a.to] = st.board[a.from]; delete st.board[a.from]; log(st, 'Moved a card from ' + a.from + ' to ' + a.to + '.'); return st; }
      case 'sbPlayer': { var pp = st.players[a.i]; if (!pp) return st; if (a.ap != null) pp.ap = a.ap; if (a.tokens != null) pp.tokens = a.tokens; if (a.meeples != null) pp.meeples = a.meeples; return st; }
      case 'sbDraw': draw(st, a.i, 1); return st;
      case 'sbGive': { var gu = mkCard(st, a.id); st.players[a.i].hand.push(gu); log(st, 'Referee gives ' + rawDef(st, gu).name + ' to ' + st.players[a.i].name + '.'); return st; }
      case 'sbCheck': afterBoardChange(st, a.credit != null ? a.credit : null); if (!a.quiet) log(st, 'Checked for Overwhelm.'); return st;
      case 'sbCancelEffect': if (st.res) { log(st, 'Effect cancelled by the referee.'); cancelRes(st); } return st;
    }
    return err(st, 'Unknown action.');
  }

  /* ---------- sight (for highlighting) ---------- */
  // What a card looks at, from its `sees` field. Only used for the yellow highlight in the UI.
  function sight(st, k) {
    var u = top(st, k); if (!u) return { cells: [], counted: [] };
    var d = def(st, u), sv = d.sees || { area: 'none' }, c = st.cards[u], p = c.claimants[0], cells = [];
    var q = XY(k);
    switch (sv.area) {
      case 'adjacent': cells = n4(k); break;
      case 'surround8': cells = n8(k); break;
      case 'north': var b = bounds(st); for (var y = b.minY - 1; y < q[1]; y++) cells.push(K(q[0], y)); break;
      case 'east1': cells = [K(q[0] + 1, q[1])]; break;
      case 'ring3': cells = [K(q[0] + 3, q[1]), K(q[0] - 3, q[1]), K(q[0], q[1] + 3), K(q[0], q[1] - 3)]; break;
      case 'kingdom': cells = p != null ? kingdom(st, p) : []; break;
      case 'adjacentToOwn': if (p != null) { var s = {}; kingdom(st, p).forEach(function (kk) { n4(kk).forEach(function (x) { s[x] = 1; }); }); cells = Object.keys(s); } break;
      case 'westOfOwn': if (p != null) cells = kingdom(st, p).map(function (kk) { var r = XY(kk); return K(r[0] - 1, r[1]); }); break;
      case 'board': cells = keys(st); break;
    }
    cells = cells.filter(function (x) { return x !== k; });
    var counted = cells.filter(function (x) { var t = top(st, x); return t && (!sv.suit || hasSuit(st, t, sv.suit)); });
    return { cells: cells, counted: counted };
  }
  // Bounding box of all occupied cells.
  function bounds(st) {
    var ks = keys(st); if (!ks.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    var xs = ks.map(function (k) { return XY(k)[0]; }), ys = ks.map(function (k) { return XY(k)[1]; });
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
  }
  // Can the current player use the ability on the card at k right now? (Drives the green glow.)
  function abilityReady(st, k) {
    var u = top(st, k); if (!u || !st.turn || !st.turn.started || st.pending || st.res || st.winner != null || st.opts.sandbox) return false;
    var d = def(st, u), ab = d.ability, p = st.cur; if (!ab) return false;
    if ((!ab.anyPlayer && !ownedBy(st, k, p)) || !active(st, k) || st.turn.used[u] || (+ab.pay || 0) > funds(st.players[p])) return false;
    if (ab.kind === 'convert') { var cand = ab.area === 'adjacentToOwn' ? (function () { var s = {}; kingdom(st, p).forEach(function (x) { n4(x).forEach(function (y) { s[y] = 1; }); s[x] = 1; }); return Object.keys(s); })() : n4(k); return cand.some(function (x) { var t = top(st, x); return t && x !== k && !st.cards[t].ruined && !untargetable(st, t); }); }
    if (ab.kind === 'buryHand') return discardable(st, p).length > 0;
    if (ab.kind === 'confess') return keys(st).some(function (x) { return x !== k && isCursed(st, x); }) || (st.players[p].arch !== (ab.toArchetype || 'Archbishop') && discardable(st, p).some(function (h) { return !!rawDef(st, h).curse; }));
    if (ab.kind === 'swapMeeple') { var mine = false, theirs = false; keys(st).forEach(function (x) { var c = st.cards[top(st, x)]; if (c.fixed || c.ruined) return; if (c.claimants.indexOf(p) >= 0) mine = true; else if (c.claimants.length) theirs = true; }); return mine && theirs; }
    if (ab.kind === 'artillery') { var fake = { player: p, srcKey: k, ctx: {} }; return targets(st, fake, { area: 'adjacentToOwnSuit', suit: ab.suit || 'Sword', oppOwned: true }, 'ruin').length > 0; }
    if (ab.kind === 'scry') return kingdom(st, p).some(function (x) { var y = top(st, x), dd = def(st, y); return x !== k && active(st, x) && dd.type === 'Structure' && (dd.onPlay || []).length; });
    if (ab.kind === 'move') return n4(k).some(function (x) { return !top(st, x) && n4(x).some(function (y) { return y !== k && top(st, y); }); });
    return true;
  }
  // Cells player p could claim right now.
  /* ---------- hidden information (online play) ---------- */
  // Stand-in definition for cards a player isn't allowed to see.
  var HIDDEN = { id: '__hidden', name: 'Hidden card', suit: '', type: 'Hidden', cost: 0, copies: 0, income: 0, text: '', place: ['N', 'E', 'S', 'W'], overwhelm: null,
    score: { kind: 'none' }, sees: { area: 'none' }, onPlay: [], curse: null, ability: null, perTurn: null, incomePerToken: 0, mods: {}, archetype: '', weakTo: '', art: '', note: '' };
  // The copy of the state that player `seat` may see: other players' hands and set-aside cards become
  // placeholder cards (so counts still show), the deck order and shuffle seed are hidden, and so is a
  // reaction card another player is still deciding whether to use. Foundations are public.
  function redact(st0, seat) {
    var st = clone(st0), inHand = {}, n = 0;
    st.players.forEach(function (pl, i) { if (i !== seat) pl.hand.concat(pl.aside || []).forEach(function (u) { if (u !== pl.foundationUid) inHand[u] = 1; }); });
    function hide(list) { return list.map(function (u) { if (!inHand[u]) return u; var h = 'h' + (n++); st.cards[h] = { uid: h, def: HIDDEN.id, suit: null, ruined: false, overwhelmed: false, claimants: [], tokens: 0, copyOf: null, prevClaimants: null, fixed: false }; return h; }); }
    st.players.forEach(function (pl, i) { if (i !== seat) { pl.hand = hide(pl.hand); if (pl.aside) pl.aside = hide(pl.aside); } });
    st.deck.forEach(function (u) { inHand[u] = 1; });
    st.deck = st.deck.map(function () { return null; });
    if (st.reveal && st.reveal.to === seat) st.reveal.cards.forEach(function (u) { delete inHand[u]; });
    else if (st.reveal) st.reveal.cards = [];
    if (st.res && inHand[st.res.src]) { st.res.src = null; st.res.steps = []; if (st.pending) st.pending.prompt = ''; }
    if (st.pending && st.pending.player !== seat && st.pending.kind === 'hand') st.pending.options = [];
    st.reactions = (st.reactions || []).map(function (r) { return r.p === seat ? r : { p: r.p, kind: r.kind }; });
    Object.keys(inHand).forEach(function (u) { delete st.cards[u]; });
    st.defs[HIDDEN.id] = clone(HIDDEN); st.seed = 0;
    return st;
  }

  function claimOptions(st, p) {
    if (!st.turn || !st.turn.lastKey || st.turn.claimed) return [];
    return [st.turn.lastKey].concat(n4(st.turn.lastKey)).filter(function (k) {
      var u = top(st, k); if (!u) return false; var c = st.cards[u], d = def(st, u);
      if (c.ruined || unclaimable(st, u) || isCovered(st, k) || c.claimants.indexOf(p) >= 0) return false;
      if (k !== st.turn.lastKey && c.claimants.length && !(d.mods && d.mods.multiClaim)) return false;
      if (c.claimants.length && !(d.mods && d.mods.multiClaim)) return false;
      return st.players[p].meeples > 0;
    });
  }

  return {
    // Public API, used by ui.js, the tests and the tools.
    newGame: newGame, apply: apply, scores: scores, income: income, cardValue: cardValue, volcanicBonus: volcanicBonus,
    legalCells: legalCells, needsPlacement: needsPlacement, protectedStack: protectedStack, funds: funds, curseFx: curseFx, hasSuit: hasSuit, onSuitBuried: onSuitBuried, valueParts: valueParts, bankedBreakdown: bankedBreakdown, abilityReady: abilityReady, isFree: isFree, untargetable: untargetable, playBlock: playBlock, sight: sight, bounds: bounds, top: top, keys: keys, def: def, rawDef: rawDef,
    suitOf: suitOf, isCursed: isCursed, isCovered: isCovered, noIncome: noIncome, overwhelmCount: overwhelmCount, enemies: enemies,
    archInfo: archInfo, kingdom: kingdom, claimOptions: claimOptions, redact: redact, cardIncome: cardIncome, n4: n4, K: K, XY: XY, SUITS: SUITS
  };
})();
if (typeof module !== 'undefined') module.exports = KEngine;
