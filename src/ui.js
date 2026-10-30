/* Kartenspiel playtest UI. All game logic lives in KEngine; this file only renders state and dispatches actions. */
(function () {
  var E = KEngine, D = KData;
  var COLORS = ['#d42020', '#1f4fd1', '#138a36', '#d39a00', '#8a2be2'];
  var CW = 88, CH = 118, GAP = 10;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

  var ICON = {
    Sceptre: '<path d="M2.5 13.5 10 6"/><circle cx="11.3" cy="4.7" r="2.2"/>',
    Goblet: '<path d="M3 2h10l-1.2 4.5a3.9 3.9 0 0 1-7.6 0Z"/><path d="M8 10.5v3M5 14h6"/>',
    Sword: '<path d="M8 1.5v9M4.5 10.5h7M8 10.5v4"/>',
    Bone: '<path d="M3.5 7a4.5 4.5 0 1 1 9 0c0 1.6-.8 2.6-1.8 3.2V13H5.3v-2.8C4.3 9.6 3.5 8.6 3.5 7Z"/><circle cx="6.2" cy="7" r=".9"/><circle cx="9.8" cy="7" r=".9"/>',
    Leaf: '<path d="M8 1.5c4 2.2 4.6 7.5 0 11.5-4.6-4-4-9.3 0-11.5Z"/><path d="M8 4v11"/>',
    Tome: '<rect x="3" y="3.5" width="10" height="8.5"/><path d="M5 6.5h6M5 9h6"/><circle cx="3" cy="3.5" r="1.2"/><circle cx="13" cy="12" r="1.2"/>'
  };
  function meepCursor(color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path d="M12 1.5a3.3 3.3 0 0 1 3.3 3.3c0 1-.4 1.9-1 2.5 2.7.6 6.4 1.8 6.4 3.8 0 1.2-1.6 1.4-3.5 1.1l2.6 7.8c.2.7-.3 1-1 1h-3.7L12 15.9 8.9 21H5.2c-.7 0-1.2-.3-1-1l2.6-7.8c-1.9.3-3.5.1-3.5-1.1 0-2 3.7-3.2 6.4-3.8-.6-.6-1-1.5-1-2.5A3.3 3.3 0 0 1 12 1.5Z" fill="' + color + '" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    return "url('data:image/svg+xml," + encodeURIComponent(svg) + "') 13 3";
  }
  var SUITINK = { Sceptre: '#8a6500', Goblet: '#86206f', Sword: '#9b1c10', Bone: '#2e2e2e', Leaf: '#1e6b1e', Tome: '#1b3f91' };
  function suitCursor(s) {
    var path = ICON[s] || '', c = SUITINK[s] || '#000';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-2 -2 20 20"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="4">' + path + '</g><g stroke="' + c + '" stroke-width="2">' + path + '</g></g></svg>';
    return "url('data:image/svg+xml," + encodeURIComponent(svg) + "') 14 14";
  }
  function swordCursor() {
    var px2 = function (x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>'; };
    var s = '', i;
    for (i = 0; i < 13; i++) s += px2(2 + i, 2 + i, 3, 3, '#1b1b1b');
    for (i = 0; i < 12; i++) s += px2(3 + i, 3 + i, 1, 1, '#ffffff') + px2(4 + i, 3 + i, 1, 1, '#cfd6dc');
    s += px2(12, 18, 8, 2, '#1b1b1b') + px2(18, 12, 2, 8, '#1b1b1b') + px2(13, 18, 6, 1, '#d9a400') + px2(18, 13, 1, 6, '#d9a400');
    s += px2(19, 19, 3, 3, '#5a3416') + px2(21, 21, 3, 3, '#1b1b1b');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" shape-rendering="crispEdges">' + s + '</svg>';
    return "url('data:image/svg+xml," + encodeURIComponent(svg) + "') 2 2";
  }
  function shieldStack(n) {
    var show = Math.min(n, 4), w = 10 + (show - 1) * 3, h = 12 + (show - 1) * 2, s = '';
    for (var i = show - 1; i >= 0; i--) s += '<g transform="translate(' + (i * 3) + ',' + ((show - 1 - i) * 2) + ')">' + shieldPixels() + '</g>';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.round(w * 1.7) + '" height="' + Math.round(h * 1.7) + '" shape-rendering="crispEdges" aria-hidden="true">' + s + '</svg>';
  }
  function shieldPixels() { return '<rect x="1" y="0" width="8" height="1" fill="#000"/><rect x="0" y="1" width="1" height="6" fill="#000"/><rect x="9" y="1" width="1" height="6" fill="#000"/><rect x="1" y="1" width="8" height="6" fill="#4a7bd6"/><rect x="1" y="7" width="1" height="2" fill="#000"/><rect x="8" y="7" width="1" height="2" fill="#000"/><rect x="2" y="7" width="6" height="2" fill="#4a7bd6"/><rect x="2" y="9" width="2" height="1" fill="#000"/><rect x="6" y="9" width="2" height="1" fill="#000"/><rect x="4" y="10" width="2" height="1" fill="#000"/><rect x="4" y="9" width="2" height="1" fill="#4a7bd6"/><rect x="2" y="2" width="2" height="2" fill="#bcd2ff"/><rect x="4" y="3" width="2" height="4" fill="#f2c94c"/><rect x="3" y="4" width="4" height="1" fill="#f2c94c"/>'; }
  function shieldIcon() { return '<svg viewBox="0 0 10 12" width="9" height="11" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="8" height="1" fill="#000"/><rect x="0" y="1" width="1" height="6" fill="#000"/><rect x="9" y="1" width="1" height="6" fill="#000"/><rect x="1" y="1" width="8" height="6" fill="#4a7bd6"/><rect x="1" y="7" width="1" height="2" fill="#000"/><rect x="8" y="7" width="1" height="2" fill="#000"/><rect x="2" y="7" width="6" height="2" fill="#4a7bd6"/><rect x="2" y="9" width="2" height="1" fill="#000"/><rect x="6" y="9" width="2" height="1" fill="#000"/><rect x="4" y="10" width="2" height="1" fill="#000"/><rect x="4" y="9" width="2" height="1" fill="#4a7bd6"/><rect x="2" y="2" width="2" height="2" fill="#bcd2ff"/></svg>'; }
  function icon(s) { return '<svg class="suitico si-' + esc(s) + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-label="' + esc(s) + '"><title>' + esc(s) + '</title>' + (ICON[s] || '') + '</svg>'; }

  /* ---------------- app state ---------------- */
  var app = {
    page: 'new', lib: [], libSource: 'built-in', db: null, dbEmpty: false, libReady: false,
    open: {}, game: null, sandbox: null, libUI: { q: '', suit: '', type: '', sort: 'suit', sel: null }, builder: null, toast: null
  };
  function libById(id) { for (var i = 0; i < app.lib.length; i++) if (app.lib[i].id === id) return app.lib[i]; return null; }
  function sortLib(a) {
    var so = D.SUITS; return a.slice().sort(function (x, y) {
      return so.indexOf(x.suit) - so.indexOf(y.suit) || (x.type === 'Foundation' ? -1 : 0) - (y.type === 'Foundation' ? -1 : 0) || (+x.cost) - (+y.cost) || x.name.localeCompare(y.name);
    });
  }
  function normalizeCard(c) { var d = D.make({}); for (var k in c) d[k] = c[k]; return d; }

  /* ---------------- library persistence ---------------- */
  function initLibrary() {
    var cached = lsGet('ks.lib');
    app.lib = sortLib((cached && cached.length ? cached : D.STARTER).map(normalizeCard));
    app.libSource = cached ? 'this browser' : 'built-in';
    if (!window.claude || !window.claude.use) return;
    window.claude.use('db').then(function (db) {
      if (!db) return;
      app.db = db;
      db.collection('cards').onSnapshot(function (snap) {
        if (snap.empty) { app.dbEmpty = true; render(); return; }
        app.dbEmpty = false;
        app.lib = sortLib(snap.docs.map(function (d) { return normalizeCard(d.data()); }));
        app.libSource = 'shared library'; lsSet('ks.lib', app.lib); render();
      }, function () { app.db = null; render(); });
    }).catch(function () { });
  }
  function saveCard(card) {
    var i = app.lib.findIndex(function (c) { return c.id === card.id; });
    if (i >= 0) app.lib[i] = card; else app.lib.push(card);
    app.lib = sortLib(app.lib); lsSet('ks.lib', app.lib);
    if (app.db && app.dbEmpty) {
      app.dbEmpty = false; var all = app.lib.slice();
      return all.reduce(function (pr, c) { return pr.then(function () { return app.db.collection('cards').doc(c.id).set(clone(c)); }); }, Promise.resolve()).catch(function (e) { toast('Could not save to the shared library: ' + (e && e.message || e)); });
    }
    if (app.db) return app.db.collection('cards').doc(card.id).set(clone(card)).catch(function (e) { toast('Could not save to the shared library: ' + (e && e.message || e)); });
    return Promise.resolve();
  }
  function deleteCard(id) {
    app.lib = app.lib.filter(function (c) { return c.id !== id; }); lsSet('ks.lib', app.lib);
    if (app.db) return app.db.collection('cards').doc(id).delete().catch(function (e) { toast('Could not delete: ' + (e && e.message || e)); });
    return Promise.resolve();
  }
  function restoreStarter() {
    var ps = D.STARTER.map(function (c) { var keep = libById(c.id); var n = clone(c); if (keep && keep.art) n.art = keep.art; return n; });
    (function next(i) { if (i >= ps.length) { toast('Starter cards restored.'); render(); return; } saveCard(ps[i]).then(function () { next(i + 1); }); })(0);
  }
  function toast(m) { app.toast = m; render(); clearTimeout(toast.t); toast.t = setTimeout(function () { app.toast = null; render(); }, 4000); }

  /* ---------------- contexts (game / sandbox) ---------------- */
  function newCtx(state, kind) {
    return { kind: kind, state: state, hist: [], ui: { sel: null, hand: null, swap: null, mode: null, moveFrom: null, zoom: 1, fit: true, showOW: true, showSeen: true, showSeenBy: false, coords: false, picked: [], passOK: false, sbCard: '', sbMode: 'place', autoCheck: true, revealOK: false } };
  }
  function dispatch(ctx, a) {
    var r = E.apply(ctx.state, a);
    if (r.error) { ctx.err = r.error; render(); return false; }
    ctx.err = null; ctx.hist.push(ctx.state); if (ctx.hist.length > 80) ctx.hist.shift();
    ctx.state = r;
    if (ctx.kind === 'sandbox' && ctx.ui.autoCheck && /^sb(Place|Suit|Move|Remove|Bury|Unbury)$/.test(a.t)) { var r2 = E.apply(ctx.state, { t: 'sbCheck', quiet: true }); if (!r2.error) ctx.state = r2; }
    if (a.t === 'play' || a.t === 'cast' || a.t === 'answer' || a.t === 'endTurn' || a.t === 'reclaim') { ctx.ui.hand = null; ctx.ui.picked = []; }
    if (a.t === 'endTurn' || a.t === 'reclaim') { ctx.ui.passOK = false; ctx.ui.mode = null; ctx.ui.sel = null; ctx.ui.swap = null; }
    lsSet(ctx.kind === 'game' ? 'ks.game' : 'ks.sandbox', ctx.state);
    var fx = FX.diff(ctx, ctx.hist[ctx.hist.length - 1], ctx.state, a);
    render(); FX.run(fx); maybeAutoEnd(ctx); return true;
  }
  /* ---- auto end turn when out of ● with nothing free to do ---- */
  function canAfford(st, u) {
    var d = E.rawDef(st, u); if (E.playBlock(st, st.cur, u)) return false;
    var ap = E.funds(st.players[st.cur]);
    if (!E.needsPlacement(d)) return (E.isFree(st, u) ? 0 : +d.cost || 0) <= ap;
    var L = E.legalCells(st, u); return Object.keys(L).some(function (k) { return L[k] <= ap; });
  }
  function stuck(st) {
    if (!st.turn || !st.turn.started || st.pending || st.res || st.winner != null || st.reveal) return false;
    var pl = st.players[st.cur]; if (E.funds(pl) > 0) return false;
    if (E.claimOptions(st, st.cur).length) return false;
    if (pl.hand.some(function (u) { return canAfford(st, u); })) return false;
    if (E.keys(st).some(function (k) { return E.abilityReady(st, k); })) return false;
    if (!pl.foundationPlaced) return false;
    return true;
  }
  function maybeAutoEnd(ctx) {
    clearTimeout(maybeAutoEnd.t);
    if (ctx.kind !== 'game' || ctx.state.opts.autoEnd === false || !stuck(ctx.state) || ctx.ui.holdTurn === ctx.state.log.length) { ctx.ui.autoEnding = false; return; }
    ctx.ui.autoEnding = true; render();
    var mark = ctx.state.log.length;
    maybeAutoEnd.t = setTimeout(function () { if (ctx.ui.autoEnding && ctx.state.log.length === mark && stuck(ctx.state)) { ctx.ui.autoEnding = false; dispatch(ctx, { t: 'endTurn' }); } }, 1600);
  }
  function undo(ctx) { if (!ctx.hist.length) return; ctx.state = ctx.hist.pop(); ctx.err = null; ctx.ui.hand = null; ctx.ui.picked = []; lsSet(ctx.kind === 'game' ? 'ks.game' : 'ks.sandbox', ctx.state); render(); }
  function cur() { return app.page === 'sandbox' ? app.sandbox : app.game; }

  /* ---------------- effects: crumble, ◇ and ● flying to their piles ---------------- */
  var FX = (function () {
    var layer = document.createElement('div'); layer.className = 'fxlayer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function topUid(st, k) { return E.top(st, k); }
    function valuesByUid(st) {
      var m = {}; st.players.forEach(function (p, i) { E.kingdom(st, i).forEach(function (k) { var u = E.top(st, k), q = E.valueParts(st, k, i); m[u + ':' + i] = { k: k, v: q.base + q.tokens, p: i }; }); }); return m;
    }
    function diff(ctx, a, b, act) {
      if (!a || !b) return [];
      var ev = [];
      // newly Ruined / Overwhelmed cards
      E.keys(b).forEach(function (k) { var u = topUid(b, k), c = b.cards[u], c0 = a.cards[u]; if (!c0) return;
        if (c.ascended && !c0.ascended) ev.push({ t: 'note', k: k, text: 'Ascended!', cls: 'asc' });
        if (E.isCursed(b, k) && !E.isCursed(a, k)) ev.push({ t: 'cursed', k: k });
        if ((c.dtok || 0) < (c0.dtok || 0)) ev.push({ t: 'note', k: k, text: 'Defended!', cls: 'def' });
        if ((c.dtok || 0) > (c0.dtok || 0)) ev.push({ t: 'note', k: k, text: '+1 Defense', cls: 'def' }); });
      E.keys(b).forEach(function (k) { var u = topUid(b, k), c = b.cards[u], c0 = a.cards[u]; if (c.ruined && c0 && !c0.ruined) ev.push({ t: 'crumble', k: k, over: c.overwhelmed, suit: E.suitOf(b, u) }); });
      // ◇ gains: per card for its owner, plus banked tokens attributed to cards
      var va = valuesByUid(a), vb = valuesByUid(b), given = b.players.map(function () { return 0; });
      Object.keys(vb).forEach(function (key) { var x = vb[key], y = va[key], g = x.v - (y ? y.v : 0); if (g > 0) { ev.push({ t: 'vp', k: x.k, p: x.p, n: g }); given[x.p] += g; } });
      Object.keys(b.cards).forEach(function (u) { var bk = b.cards[u].banked || {}, ak = (a.cards[u] && a.cards[u].banked) || {}; Object.keys(bk).forEach(function (p) { var g = bk[p] - (ak[p] || 0); if (g > 0 && !vb[u + ':' + p]) { var k = E.keys(b).filter(function (x) { return E.top(b, x) === u; })[0]; ev.push({ t: 'vp', k: k || null, p: +p, n: g }); given[+p] += g; } }); });
      b.players.forEach(function (p, i) { var tot = E.scores(b)[i].total - E.scores(a)[i].total, rest = tot - given[i]; if (rest > 0 && tot > 0) ev.push({ t: 'vp', k: null, p: i, n: rest }); });
      // ● gains for the current player
      var p = b.cur, gain = b.players[p].ap - a.players[p].ap;
      if (gain > 0 && a.cur === b.cur && act.t !== 'sbPlayer') {
        if (act.t === 'startTurn') { var left = gain; E.kingdom(b, p).forEach(function (k) { var inc = E.cardIncome(b, k); if (inc > 0 && left > 0) { ev.push({ t: 'ap', k: k, n: Math.min(inc, left) }); left -= inc; } }); if (left > 0) ev.push({ t: 'ap', k: null, n: left }); }
        else if (act.t === 'claim' || act.t === 'play') ev.push({ t: 'ap', k: act.k, n: gain });
        else ev.push({ t: 'ap', k: null, n: gain });
      }
      return ev;
    }
    function rectOf(sel) { var e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; }
    function cellRect(k) { return k ? rectOf('.cell [data-cell="' + k + '"]') : null; }
    function center() { var b = rectOf('.boardwrap'); return b ? { left: b.left + b.width / 2 - 20, top: b.top + b.height / 2 - 20, width: 40, height: 40 } : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }; }
    function piece(cls, html, x, y) { var d = document.createElement('div'); d.className = 'fx ' + cls; d.innerHTML = html || ''; d.style.left = x + 'px'; d.style.top = y + 'px'; layer.appendChild(d); return d; }
    function popup(text, cls, r, delay) {
      var d = piece('pop ' + cls, esc(text), r.left + r.width / 2, r.top + r.height * 0.35);
      d.animate([{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-14px) scale(1.15)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-34px) scale(1)', opacity: 0 }], { duration: 1300, delay: delay || 0, easing: 'ease-out', fill: 'both' }).onfinish = function () { d.remove(); };
    }
    function fly(kind, from, to, n, delay) {
      var count = Math.min(n, kind === 'vp' ? 12 : 16);
      for (var i = 0; i < count; i++) {
        var col = kind === 'vp' ? ['#0f8a4a', '#c0103a', '#1747b8'][i % 3] : '#7ff5c9';
        var sx = from.left + from.width * (0.25 + Math.random() * 0.5), sy = from.top + from.height * (0.3 + Math.random() * 0.4);
        var ex = to.left + to.width * (0.3 + Math.random() * 0.4), ey = to.top + to.height * (0.4 + Math.random() * 0.4);
        var d = piece(kind === 'vp' ? 'gem' : 'marble', '', sx, sy); d.style.background = col;
        var mx = (sx + ex) / 2 + (Math.random() - 0.5) * 120, my = Math.min(sy, ey) - 60 - Math.random() * 60;
        d.animate([{ transform: 'translate(0,0) scale(0)', opacity: 0 }, { transform: 'translate(0,-10px) scale(1.3)', opacity: 1, offset: .18 }, { transform: 'translate(' + (mx - sx) + 'px,' + (my - sy) + 'px) scale(1)', offset: .55 }, { transform: 'translate(' + (ex - sx) + 'px,' + (ey - sy) + 'px) scale(.7)', opacity: .9 }],
          { duration: 1050, delay: (delay || 0) + i * 45, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' }).onfinish = (function (el) { return function () { el.remove(); }; })(d);
      }
      var tgt = document.querySelector(kind === 'vp' ? '[data-fx="pile"]' : '[data-fx="jar"]');
      setTimeout(function () { var t = document.querySelector(kind === 'vp' ? '[data-fx="pile-' + flyTo + '"]' : '[data-fx="jar"]'); if (t) t.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 }); }, (delay || 0) + 1000);
      var flyTo = to.p;
    }
    function crumble(e, i) {
      var r = cellRect(e.k); if (!r) return;
      var base = { Sceptre: '#fff6c2', Goblet: '#f6dcf2', Sword: '#ffdad5', Bone: '#ececec', Leaf: '#dcf2d4', Tome: '#d9e4ff' }[e.suit] || '#ddd';
      var cols = 4, rows = 5, w = r.width / cols, h = r.height / rows;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var d = piece('shard', '', r.left + x * w, r.top + y * h); d.style.width = w + 1 + 'px'; d.style.height = h + 1 + 'px'; d.style.background = (x + y) % 2 ? base : '#b9b9b9';
        var dx = (x - 1.5) * (10 + Math.random() * 18), dy = 40 + y * 12 + Math.random() * 50, rot = (Math.random() - 0.5) * 140;
        d.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(' + (Math.random() - 0.5) * 6 + 'px,-2px)', offset: .15 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', opacity: 0 }],
          { duration: 900 + Math.random() * 300, delay: i * 120 + (y * 40), easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'both' }).onfinish = (function (el) { return function () { el.remove(); }; })(d);
      }
      for (var s = 0; s < 8; s++) { var dust = piece('dust', '', r.left + Math.random() * r.width, r.top + r.height * (0.6 + Math.random() * 0.4)); dust.animate([{ transform: 'scale(.3)', opacity: .8 }, { transform: 'translate(' + (Math.random() - 0.5) * 40 + 'px,' + (-20 - Math.random() * 30) + 'px) scale(2.2)', opacity: 0 }], { duration: 1100, delay: i * 120 + 150, easing: 'ease-out', fill: 'both' }).onfinish = (function (el) { return function () { el.remove(); }; })(dust); }
      popup(e.over ? 'Overwhelmed!' : 'Ruined', 'ruin', r, i * 120);
    }
    function flare(r, delay) {
      var f = piece('flare', '', r.left - 4, r.top - 4); f.style.width = r.width + 8 + 'px'; f.style.height = r.height + 8 + 'px';
      f.animate([{ opacity: 0, boxShadow: '0 0 0 0 rgba(160,60,255,0)' }, { opacity: 1, boxShadow: '0 0 18px 10px rgba(170,70,255,.95), 0 0 40px 22px rgba(220,80,255,.55)', offset: .15 },
        { boxShadow: '0 -6px 22px 8px rgba(190,90,255,.9), 0 0 30px 14px rgba(120,30,220,.6)', offset: .3 }, { boxShadow: '0 -10px 26px 12px rgba(210,110,255,.85), 0 0 36px 18px rgba(140,40,240,.5)', offset: .45 },
        { opacity: 1, boxShadow: '0 0 10px 4px rgba(150,70,255,.6)', offset: .75 }, { opacity: 0, boxShadow: '0 0 6px 2px rgba(150,70,255,.3)' }], { duration: 1800, delay: delay || 0, easing: 'ease-out', fill: 'both' }).onfinish = function () { f.remove(); };
      for (var q = 0; q < 14; q++) {
        var side = q % 4, x = side === 0 ? r.left + Math.random() * r.width : side === 1 ? r.left + r.width : side === 2 ? r.left + Math.random() * r.width : r.left, y = side === 0 ? r.top : side === 1 ? r.top + Math.random() * r.height : side === 2 ? r.top + r.height : r.top + Math.random() * r.height;
        var fl = piece('flame', '', x - 4, y - 6);
        fl.animate([{ transform: 'translateY(0) scale(.4)', opacity: 0 }, { transform: 'translateY(-6px) scale(1.2)', opacity: 1, offset: .25 }, { transform: 'translateY(-' + (22 + Math.random() * 18) + 'px) scale(.3)', opacity: 0 }], { duration: 900 + Math.random() * 400, delay: (delay || 0) + Math.random() * 350, easing: 'ease-out', fill: 'both' }).onfinish = (function (el) { return function () { el.remove(); }; })(fl);
      }
    }
    function run(ev) {
      if (!ev || !ev.length) return;
      var nV = 0, nA = 0;
      ev.forEach(function (e, i) {
        if (e.t === 'cursed') { var rc = cellRect(e.k); if (rc) { popup('Cursed!', 'curse', rc, i * 100); if (!calm) flare(rc, i * 100); } }
        if (e.t === 'note') { var rn = cellRect(e.k); if (rn) popup(e.text, e.cls, rn, i * 100); }
        if (e.t === 'crumble') { if (!calm) crumble(e, i); else { var r0 = cellRect(e.k); if (r0) popup(e.over ? 'Overwhelmed!' : 'Ruined', 'ruin', r0); } }
        if (e.t === 'vp') { var from = cellRect(e.k) || center(), to = rectOf('[data-fx="pile-' + e.p + '"]'); popup('+' + e.n + '◇', 'vp', from, nV * 150); if (to && !calm) { to.p = e.p; fly('vp', from, to, e.n, 250 + nV * 150); } nV++; }
        if (e.t === 'ap') { var f2 = cellRect(e.k) || center(), t2 = rectOf('[data-fx="jar"]'); popup('+' + e.n + '●', 'ap', f2, nA * 120); if (t2 && !calm) fly('ap', f2, t2, e.n, 200 + nA * 120); nA++; }
      });
    }
    return { diff: diff, run: run };
  })();

  /* ---------------- card faces ---------------- */
  function artOf(defId) { var c = libById(defId); return c && c.art ? c.art : ''; }
  function placeIcon(pl) {
    if (pl === 'diag') return '✕';
    if (!pl || pl.length === 4) return '✛';
    var m = { 'N': '↑', 'S': '↓', 'E': '→', 'W': '←', 'NS': '↕', 'EW': '↔', 'NE': '↗' };
    var k = ['N', 'E', 'S', 'W'].filter(function (s) { return pl.indexOf(s) >= 0; }).join('');
    return m[k] || k;
  }
  function scoreText(s) {
    if (!s) return '';
    var n = s.n, m = s.m;
    switch (s.kind) {
      case 'flat': return n + '◇';
      case 'perAdjacentSuit': return n + '◇ per adjacent ' + s.suit;
      case 'perSuitInKingdom': return n + '◇ per ' + s.suit + ' in Kingdom';
      case 'perSuitSplit': return n + '◇ per ' + s.suit + ' in Kingdom, ' + m + '◇ per other ' + s.suit;
      case 'perBuriedInKingdom': return n + '◇ per buried card in Kingdom';
      case 'perDistinctSuitInKingdom': return n + '◇ per suit in Kingdom';
      case 'largestRegion': return n + '◇ per card in largest region';
      case 'perCardNorth': return n + '◇ per card north';
      case 'flatDoubledIfSurrounded': return n + '◇, doubled if surrounded';
      case 'flatMinusPerAdjacentNotOwned': return n + '◇ − ' + m + ' per foreign neighbor';
      case 'flatMinusPerExtraClaimant': return n + '◇ − ' + m + ' per extra claimant';
      case 'flatPlusTokens': return n + '◇ + tokens';
      default: return '';
    }
  }
  // face for a card definition (hand, library, builder); opts: {big, value, cost}
  function defFace(d, o) {
    o = o || {};
    var art = d.art || artOf(d.id);
    var h = '<div class="card s-' + esc(d.suit) + (o.big ? ' big' : '') + (d.type === 'Foundation' ? ' found' : '') + '">';
    h += '<div class="top"><span>' + esc(o.cost != null ? o.cost : d.cost) + '●</span>' + icon(d.suit) + '</div>';
    if (art && o.big) h += '<div class="art" style="background-image:url(' + art + ')"></div>';
    else if (art) h += '<div class="art" style="background-image:url(' + art + ')"></div>';
    h += '<div class="nm">' + esc(d.name) + '</div><div class="ty">' + esc(d.type) + ' · ' + esc(d.suit) + '</div>';
    if (o.big) {
      h += '<div class="txt">' + esc(d.text || '') + '</div>';
      var bits = [];
      if (scoreText(d.score)) bits.push('Value: ' + scoreText(d.score));
      if (+d.income) bits.push('Income: ' + d.income + '● per turn');
      if (+d.incomePerToken) bits.push('+' + d.incomePerToken + '● per token');
      bits.push('Placement: ' + placeIcon(d.place));
      if (d.overwhelm != null && d.overwhelm !== '') bits.push('Overwhelm number: ' + d.overwhelm);
      if (d.type === 'Foundation') bits.push('Archetype: ' + d.archetype + ', weak to ' + d.weakTo);
      if (d.note) bits.push('Note: ' + d.note);
      h += '<div class="txt small muted" style="color:#444">' + bits.map(esc).join('<br>') + '</div>';
    } else if (o.mid) {
      h += '<div class="txt mid">' + esc(d.text || '') + '</div>';
      if (scoreText(d.score) && d.score.kind !== 'flat') h += '<div class="ty" style="margin-top:3px">' + esc(scoreText(d.score)) + '</div>';
    }
    h += '<div class="foot"><span>' + esc(placeIcon(d.place)) + '</span><span class="val">' + (o.value != null ? esc(o.value) + '◇' : '') + (+d.income ? ' ' + d.income + '●' : '') + '</span></div>';
    return h + '</div>';
  }
  // face for a card on the board
  function boardFace(st, k, ctx) {
    var u = E.top(st, k), c = st.cards[u], d = E.def(st, u), suit = E.suitOf(st, u), stack = st.board[k];
    var ruined = c.ruined, covered = E.isCovered(st, k);
    var noOW = c.ascended || !!(E.rawDef(st, u).mods || {}).immune;
    var ocx = !ruined && !noOW ? E.overwhelmCount(st, k) : null, crack = ocx && ocx.n > 0 ? Math.min(3, Math.ceil(ocx.n / ocx.th * 3)) : 0;
    var h = '<div class="card s-' + esc(suit) + (ruined ? ' ruined' : '') + (crack ? ' crack' + crack : '') + (E.rawDef(st, u).type === 'Foundation' ? ' found' : '') + (c.ascended && !ruined ? ' ascended' : '') + (E.isCursed(st, k) && !ruined ? ' cursed' : '') + '">';
    h += '<div class="top"><span>' + esc(d.cost) + '●</span>' + icon(suit) + '</div>';
    var art = artOf(c.def); if (art && !ruined) h += '<div class="art" style="background-image:url(' + art + ')"></div>';
    h += '<div class="nm">' + esc(ruined ? E.rawDef(st, u).name : d.name) + '</div><div class="ty">' + esc(ruined ? (c.overwhelmed ? 'Overwhelmed' : 'Ruined') : d.type) + '</div>';
    if (stack.length > 1) h += '<span class="stackn" title="' + (stack.length - 1) + ' card(s) underneath">+' + (stack.length - 1) + '</span>';
    if (c.dtok > 0 && !ruined) h += '<span class="defb" title="' + c.dtok + ' Defense token' + (c.dtok > 1 ? 's' : '') + ': each one stops a Ruin or Curse">' + shieldStack(c.dtok) + (c.dtok > 4 ? '<b>' + c.dtok + '</b>' : '') + '</span>';
    if (!ruined && (c.apBonus || c.vpBonus || c.decay || E.protectedStack(st, k))) h += '<span class="bonusb">' + (E.protectedStack(st, k) ? '⚑' : '') + (c.vpBonus ? '+' + c.vpBonus + '◇' : '') + (c.apBonus ? '+' + c.apBonus + '●' : '') + (c.decay ? ' ☠' + c.decay : '') + '</span>';
    if (c.ascended && !ruined) h += '<span class="ascb" title="Ascended: invulnerable, every suit, +8◇ and +12●">Ascended</span>';
    if (ctx.ui.showOW && !ruined && !noOW) { var oc = E.overwhelmCount(st, k); if (oc && oc.n > 0) h += '<span class="owc' + (oc.n >= oc.th - 1 ? ' hot' : '') + '" title="Enemy-suit neighbors / Overwhelm number">' + oc.n + '/' + oc.th + '</span>'; }
    if (covered) h += '<div class="badge curse">Covering a card</div>';
    else if (E.isCursed(st, k)) { var cfx = []; if (E.noIncome(st, k)) cfx.push('no ●'); if (E.curseFx(st, k, 'halveValue')) cfx.push('½◇'); if (E.curseFx(st, k, 'halveIncome')) cfx.push('½●'); if (E.curseFx(st, k, 'intoxicate')) cfx.push('+3●'); if (E.curseFx(st, k, 'owMinus') + E.curseFx(st, k, 'intoxicate')) cfx.push('−' + (E.curseFx(st, k, 'owMinus') + E.curseFx(st, k, 'intoxicate')) + ' OW'); h += '<div class="badge curse" title="Cursed">Cursed' + (cfx.length ? ': ' + cfx.join(' ') : '') + '</div>'; }
    var val = '';
    if (!ruined && c.claimants.length) { var v = E.cardValue(st, k, c.claimants[0]) + E.volcanicBonus(st, k); val = v + '◇'; }
    var inc = !ruined ? E.cardIncome(st, k) : 0;
    h += '<div class="foot"><span class="meeps">' + c.claimants.map(function (p) { return '<span class="meep" style="background:' + st.players[p].color + '" title="' + esc(st.players[p].name) + '"></span>'; }).join('') + (c.tokens ? '<span title="tokens">⬤' + c.tokens + '</span>' : '') + '</span><span class="val">' + val + (inc ? ' ' + inc + '●' : '') + '</span></div>';
    return h + '</div>';
  }

  /* ---------------- board ---------------- */
  function boardHTML(ctx) {
    var st = ctx.state, ui = ctx.ui, b = E.bounds(st), ks = E.keys(st);
    if (!ks.length) b = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    var pad = 1; b = { minX: b.minX - pad, maxX: b.maxX + pad, minY: b.minY - pad, maxY: b.maxY + pad };
    // extend for legal cells
    var legal = {}, pd = st.pending, optSet = {};
    var buryingSuit = pd && pd.kind === 'cell' && pd.verb === 'bury' && st.res && st.res.src ? E.suitOf(st, st.res.src) : null;
    if (ctx.kind === 'game' && ui.hand && st.turn && st.turn.started && !st.pending && !st.res && E.needsPlacement(E.rawDef(st, ui.hand))) legal = E.legalCells(st, ui.hand);
    if (pd && pd.kind === 'cell' && (pd.player === st.cur || ctx.kind === 'sandbox')) pd.options.forEach(function (k) { optSet[k] = 1; });
    Object.keys(legal).concat(Object.keys(optSet)).forEach(function (k) { var p = E.XY(k); b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0]); b.minY = Math.min(b.minY, p[1]); b.maxY = Math.max(b.maxY, p[1]); });
    var cols = b.maxX - b.minX + 1, rows = b.maxY - b.minY + 1, W = cols * (CW + GAP) + GAP, Hh = rows * (CH + GAP) + GAP;
    var see = {}, counted = {}, seenBy = {};
    if (ui.sel && E.top(st, ui.sel) && ui.showSeen) { var sg = E.sight(st, ui.sel); sg.cells.forEach(function (k) { see[k] = 1; }); sg.counted.forEach(function (k) { counted[k] = 1; }); }
    if (ui.sel && ui.showSeenBy) ks.forEach(function (k) { if (k !== ui.sel && E.sight(st, k).cells.indexOf(ui.sel) >= 0) seenBy[k] = 1; });
    var claimSet = {};
    if (ctx.kind === 'game' && st.turn && st.turn.started && !st.pending && !st.res && !ui.hand && !ui.mode && !ui.swap && st.winner == null) E.claimOptions(st, st.cur).forEach(function (k) { optSet[k] = 1; claimSet[k] = 1; });
    var claiming = Object.keys(claimSet).length > 0;
    var h = '';
    for (var y = b.minY; y <= b.maxY; y++) for (var x = b.minX; x <= b.maxX; x++) {
      var k = x + ',' + y, u = E.top(st, k), cls = 'cell';
      var lx = GAP + (x - b.minX) * (CW + GAP), ly = GAP + (y - b.minY) * (CH + GAP);
      if (!u) cls += ' empty';
      if (legal[k] != null) cls += legal[k] > E.funds(st.players[st.cur]) ? ' legal poor' : ' legal';
      if (optSet[k]) cls += u ? ' opt' : ' optempty';
      if (optSet[k] && u && buryingSuit && !E.hasSuit(st, u, buryingSuit)) cls += ' optdash';
      if (claimSet[k]) cls += ' claimable';
      if (see[k]) cls += ' see'; if (counted[k]) cls += ' counted'; if (seenBy[k]) cls += ' seenby';
      if (ui.sel === k) cls += ' focus';
      if (u && ctx.kind === 'game' && E.abilityReady(st, k)) cls += ' ready';
      var ov = u ? overlayFor(ctx, k) : null; if (ov) cls += ov.on ? ' ovl-on' : ' ovl-dim';
      if (!u && legal[k] == null && !optSet[k] && !see[k] && !(ctx.kind === 'sandbox' || ui.mode === 'move')) { if (!ui.coords) continue; }
      h += '<div class="' + cls + '" style="left:' + lx + 'px;top:' + ly + 'px">';
      if (u) h += boardFace(st, k, ctx);
      if (ov && ov.on) h += '<div class="ovl">' + ov.html + '</div>';
      if (legal[k] != null) h += '<div class="cost">' + (legal[k] > E.funds(st.players[st.cur]) ? '<span>' + legal[k] + '●<br>Not enough AP</span>' : legal[k] + '●') + '</div>';
      if (ui.coords) h += '<span class="coord">' + k + '</span>';
      h += '<button class="cellbtn" data-cell="' + k + '" aria-label="' + (u ? esc(E.def(st, u).name) + ' at ' + k : 'Empty space ' + k) + '"></button></div>';
    }
    var aiming = pd && pd.kind === 'cell' && pd.verb === 'ruin';
    return { html: '<div class="boardsizer' + (claiming ? ' claiming' : '') + (aiming ? ' aiming' : '') + (buryingSuit ? ' burying' : '') + '" style="' + (claiming ? '--meep:' + meepCursor(st.players[st.cur].color) + ';' : '') + (aiming ? '--sword:' + swordCursor() + ';' : '') + (buryingSuit ? '--bury:' + suitCursor(buryingSuit) + ';' : '') + 'width:' + W + 'px;height:' + Hh + 'px"><div class="boardinner" style="width:' + W + 'px;height:' + Hh + 'px">' + h + '</div></div>', W: W, H: Hh };
  }
  function overlayFor(ctx, k) {
    var st = ctx.state, mode = ctx.ui.overlay; if (!mode || mode === 'none') return null;
    var u = E.top(st, k), c = st.cards[u];
    if (mode === 'prod') {
      var inc = E.cardIncome(st, k), mine = ctx.kind === 'game' ? E.kingdom(st, st.cur).indexOf(k) >= 0 : c.claimants.length > 0;
      if (!inc || !mine) return { on: false };
      return { on: true, html: '<b>+' + inc + '●</b>' + (ctx.kind === 'sandbox' ? '<span class="who">' + esc(c.claimants.map(function (p) { return st.players[p].name; }).join(', ')) + '</span>' : '') };
    }
    if (mode === 'vp') {
      var vp = vpViewer(ctx);
      if (E.kingdom(st, vp).indexOf(k) < 0) return { on: false };
      var parts = E.valueParts(st, k, vp);
      return { on: true, html: '<b>' + parts.base + '◇</b>' + (parts.tokens ? '<span class="tok" title="Banked tokens">+' + parts.tokens + '</span>' : '') };
    }
    return null;
  }
  function vpViewer(ctx) { return ctx.kind === 'game' ? ctx.state.cur : Math.min(ctx.ui.vpFor || 0, ctx.state.players.length - 1); }
  function overlayTotal(ctx) {
    var st = ctx.state, mode = ctx.ui.overlay;
    if (mode === 'prod' && ctx.kind === 'game') return st.players[st.cur].name + ' makes ' + E.income(st, st.cur) + '● per turn' + (st.players[st.cur].foundationPlaced ? '' : ' (base 3 until the Foundation is placed)') + '.';
    if (mode === 'vp') {
      var p = vpViewer(ctx), base = 0, cardTok = 0;
      E.kingdom(st, p).forEach(function (k) { var q = E.valueParts(st, k, p); base += q.base; cardTok += q.cardTok; });
      var bb = E.bankedBreakdown(st, p), parts = Object.keys(bb.by).map(function (n) { return n + ' ' + bb.by[n]; });
      if (cardTok) parts.unshift('on cards ' + cardTok); if (bb.other) parts.push('other ' + bb.other);
      var tok = cardTok + st.players[p].tokens;
      return st.players[p].name + ': ' + (base + tok) + '◇ = ' + base + ' from card values + ' + tok + ' in tokens' + (parts.length ? ' (' + parts.join(', ') + ')' : '') + '.';
    }
    return '';
  }
  function applyZoom(ctx) {
    var wrap = $('.boardwrap'); if (!wrap || !ctx) return;
    var sizer = $('.boardsizer', wrap), inner = $('.boardinner', wrap); if (!sizer) return;
    var W = parseFloat(inner.style.width), Hh = parseFloat(inner.style.height);
    if (ctx.ui.fit) { var z = Math.min((wrap.clientWidth - 4) / W, (wrap.clientHeight - 4) / Hh, 1.15); ctx.ui.zoom = Math.max(0.25, z); }
    var zz = ctx.ui.zoom; inner.style.transform = 'scale(' + zz + ')'; sizer.style.width = W * zz + 'px'; sizer.style.height = Hh * zz + 'px';
    var zl = $('#zoomlbl'); if (zl) zl.textContent = Math.round(zz * 100) + '%';
  }
  function boardBar(ctx) {
    var u = ctx.ui;
    return '<div class="boardbar raised row small">' +
      '<button class="btn sm" data-act="zoomout" title="Zoom out">−</button><span id="zoomlbl" style="min-width:38px;text-align:center">100%</span><button class="btn sm" data-act="zoomin" title="Zoom in">+</button>' +
      '<button class="btn sm' + (u.fit ? ' on' : '') + '" data-act="fit">Fit board</button>' +
      '<label><input type="checkbox" data-tog="showSeen"' + (u.showSeen ? ' checked' : '') + '> What it sees</label>' +
      '<label><input type="checkbox" data-tog="showSeenBy"' + (u.showSeenBy ? ' checked' : '') + '> What sees it</label>' +
      '<label><input type="checkbox" data-tog="showOW"' + (u.showOW ? ' checked' : '') + '> Overwhelm counts</label>' +
      '<label><input type="checkbox" data-tog="coords"' + (u.coords ? ' checked' : '') + '> Grid</label>' +
      '<button class="btn sm" data-act="debug" title="Copy the log and board state to the clipboard">Copy debug report</button>' +
      '<label>Overlay <select data-sel="overlay"><option value="none"' + (u.overlay === 'prod' || u.overlay === 'vp' ? '' : ' selected') + '>None</option><option value="prod"' + (u.overlay === 'prod' ? ' selected' : '') + '>Production (●)</option><option value="vp"' + (u.overlay === 'vp' ? ' selected' : '') + '>Victory points (◇)</option></select></label>' +
      (u.overlay === 'vp' && ctx.kind === 'sandbox' ? '<label>for <select data-sel="vpFor">' + ctx.state.players.map(function (p, i) { return '<option value="' + i + '"' + (i === vpViewer(ctx) ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></label>' : '') +
      (u.overlay === 'prod' || u.overlay === 'vp' ? '<b>' + esc(overlayTotal(ctx)) + '</b>' : '') +
      (u.overlay === 'vp' ? '<span class="muted">White box: the card’s own value, recalculated from the board. <span class="tok">+n</span> gold: banked tokens, which never change.</span>' : '') +
      '<span class="muted">Yellow: what the selected card sees (filled = counted). Blue: cards that see it.</span></div>';
  }

  /* ---------------- inspector ---------------- */
  function inspector(ctx) {
    var st = ctx.state, ui = ctx.ui, h = '';
    if (ui.hand && !ui.sel) {
      var hu = ui.hand, hd = E.rawDef(st, hu); h += '<div class="panelhead">In hand</div>' + defFace(Object.assign({}, hd, { art: artOf(hd.id) }), { big: true });
      var why = E.playBlock(st, st.cur, hu); if (why) h += '<p class="err">' + esc(why) + '</p>';
      else h += E.needsPlacement(hd) ? '<p class="small">Green spaces are legal; the number is the cost there.</p>' : '<p class="small">Played straight from your hand: click <b>Play it</b> in the bar above the board. Afterward it is buried under a card it affected, or under any card you choose.</p>';
      return h;
    }
    var k = ui.sel, u = k && E.top(st, k);
    if (!u) return '<div class="panelhead">Card</div><p class="muted">Click a card on the board or in a hand to see it up close.</p>';
    var c = st.cards[u], d = E.def(st, u);
    h += '<div class="panelhead">At ' + esc(k) + '</div>';
    var shown = Object.assign({}, d, { suit: E.suitOf(st, u), art: artOf(c.def) });
    var val = c.claimants.length && !c.ruined ? E.cardValue(st, k, c.claimants[0]) + E.volcanicBonus(st, k) : null;
    h += defFace(shown, { big: true, value: val });
    var info = [];
    if (c.ruined) info.push(c.overwhelmed ? 'Overwhelmed: treated as Ruined.' : 'Ruined: no effects, no owner, keeps its suit.');
    if (c.suit) info.push('Suit changed from ' + E.rawDef(st, u).suit + ' to ' + c.suit + '.');
    info.push('Owner: ' + (c.claimants.length ? c.claimants.map(function (p) { return st.players[p].name; }).join(', ') : 'unclaimed'));
    var oc = E.overwhelmCount(st, k); if (oc && !c.ruined) info.push('Enemy neighbors: ' + oc.n + ' of ' + oc.th + ' (enemies: ' + E.enemies(st, E.suitOf(st, u)).join(', ') + ').');
    if (c.tokens) info.push('Tokens on card: ' + c.tokens);
    if (c.dtok > 0) info.push('Defense tokens: ' + c.dtok + ' (each stops one Ruin or Curse).');
    if (c.apBonus) info.push('Permanent bonus: +' + c.apBonus + '● per turn.');
    if (c.vpBonus) info.push('Permanent bonus: +' + c.vpBonus + '◇.');
    if (c.decay) info.push('Decay tokens: ' + c.decay + ' (no effect defined yet).');
    if (E.protectedStack(st, k)) info.push('Protected by Standard Bearer: cannot be Ruined or Overwhelmed.');
    if (c.ascended) info.push('Ascended: invulnerable, counts as every suit, +8◇ and +12●, cannot change hands.');
    if (oc && oc.bonus) info.push('Overwhelm number raised by ' + oc.bonus + ' for same-suit cards buried underneath.');
    var inc = E.cardIncome(st, k); if (inc) info.push('Producing ' + inc + '● per turn.');
    if (E.noIncome(st, k)) info.push('Cursed: produces no ●.');
    h += '<ul class="small" style="padding-left:16px;margin:6px 0">' + info.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    var stack = st.board[k];
    if (stack.length > 1) h += '<p class="small"><b>Underneath:</b> ' + stack.slice(1).map(function (x) { var dd = E.rawDef(st, x); return esc(dd.name) + (dd.type === 'Curse' ? ' (Curse)' : ''); }).join(', ') + '</p>';
    // actions
    if (ctx.kind === 'game') {
      var p = st.cur, btns = '';
      if (st.turn && st.turn.started && !st.pending && !st.res && st.winner == null) {
        if (E.claimOptions(st, p).indexOf(k) >= 0) btns += '<button class="btn def" data-act="claim" data-k="' + k + '">Claim (' + st.players[p].meeples + ' meeples left)</button>';
        if (d.ability && (c.claimants.indexOf(p) >= 0 || d.ability.anyPlayer) && !c.ruined) btns += '<button class="btn" data-act="ability" data-k="' + k + '"' + (st.turn.used[u] ? ' disabled' : '') + '>' + esc(abilityLabel(d.ability)) + '</button>';
      }
      if (btns) h += '<div class="row">' + btns + '</div>';
      h += '<details style="margin-top:8px" data-keep="reftools"' + (app.open.reftools ? ' open' : '') + '><summary>Referee tools</summary>' + refTools(ctx, k) + '</details>';
    } else h += '<fieldset><legend>Sandbox tools</legend>' + refTools(ctx, k) + '</fieldset>';
    return h;
  }
  function abilityLabel(ab) {
    if (ab.kind === 'exchange') return 'Exchange ' + ab.pay + '● for ' + ab.gain + '◇';
    if (ab.kind === 'convert') return 'Convert a neighbor (' + ab.pay + '●)';
    if (ab.kind === 'move') return 'Move to an adjacent space';
    if (ab.kind === 'buryHand') return 'Bury a card from your hand here';
    if (ab.kind === 'confess') return 'Confess a Curse (+' + (ab.gain || 4) + '◇)';
    if (ab.kind === 'swapMeeple') return 'Offer a meeple swap';
    return 'Use ability';
  }
  function refTools(ctx, k) {
    var st = ctx.state, u = E.top(st, k), c = st.cards[u], h = '<div class="col small" style="margin-top:6px">';
    h += '<div class="row"><button class="btn sm" data-act="sbRuin" data-k="' + k + '">' + (c.ruined ? 'Flip face up' : 'Ruin') + '</button>';
    h += '<button class="btn sm" data-act="startMove" data-k="' + k + '">Move…</button><button class="btn sm" data-act="sbRemove" data-k="' + k + '">Remove top card</button>';
    if (st.board[k].length > 1) h += '<button class="btn sm" data-act="sbUnbury" data-k="' + k + '">Remove a buried card</button>';
    h += '</div><div class="row">Suit <select data-sel="sbSuit" data-k="' + k + '">' + D.SUITS.map(function (s) { return '<option' + (s === E.suitOf(st, u) ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
    h += ' Tokens <button class="btn sm" data-act="tok" data-d="-1" data-k="' + k + '">−</button><b>' + (c.tokens || 0) + '</b><button class="btn sm" data-act="tok" data-d="1" data-k="' + k + '">+</button></div>';
    h += '<div class="row">Claim for: ' + st.players.map(function (pl, i) { var on = c.claimants.indexOf(i) >= 0; return '<button class="btn sm' + (on ? ' on' : '') + '" data-act="sbClaim" data-i="' + i + '" data-k="' + k + '"><span class="swatch" style="background:' + pl.color + '"></span> ' + esc(pl.name) + '</button>'; }).join('') + '</div>';
    h += '<div class="row">Card: <select data-sel="buryId" style="max-width:100%">' + cardOptions(st, ctx.ui.buryId) + '</select></div><div class="row"><button class="btn sm" data-act="sbBury" data-k="' + k + '">Bury it under this card</button><button class="btn sm" data-act="sbOnTop" data-k="' + k + '">Put it on top</button></div>';
    return h + '</div>';
  }
  function cardOptions(st, selId) {
    var defs = sortLib(Object.keys(st.defs).map(function (id) { return st.defs[id]; }));
    return defs.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === selId ? ' selected' : '') + '>' + esc(d.suit + ': ' + d.name) + '</option>'; }).join('');
  }

  /* ---------------- players + log ---------------- */
  /* ---------- pixel art: marble jar (●) and jewel pile (◇) ---------- */
  var MARBLE = [['#7ff5c9', '#eafff6'], ['#5fe8b5', '#d6fff0'], ['#9cf7d8', '#f2fffa']];
  var GEM = [['#0f8a4a', '#7fe8ad'], ['#c0103a', '#ff8aa6'], ['#1747b8', '#8fb4ff']];
  function px(x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>'; }
  function apJar(n) {
    var s = '', cap = 56; n = Math.max(0, n | 0);
    s += px(5, 0, 10, 2, '#6b3f1d') + px(5, 2, 10, 1, '#3d220d') + px(6, 3, 8, 2, '#9fd4e6');
    s += px(3, 5, 14, 1, '#2b3a40') + px(2, 6, 1, 17, '#2b3a40') + px(17, 6, 1, 17, '#2b3a40') + px(3, 23, 14, 1, '#2b3a40') + px(3, 6, 14, 17, 'rgba(170,220,235,.35)');
    var shown = Math.min(n, cap);
    if (shown) s += px(3, 23 - Math.ceil(shown / 7) * 2, 14, Math.ceil(shown / 7) * 2, 'rgba(127,245,201,.22)');
    for (var i = 0; i < shown; i++) { var col = i % 7, row = Math.floor(i / 7), x = 3 + col * 2, y = 21 - row * 2, m = MARBLE[(i * 7 + row * 3) % MARBLE.length]; s += px(x, y, 2, 2, m[0]) + px(x, y, 1, 1, m[1]); }
    s += px(4, 7, 1, 6, 'rgba(255,255,255,.7)');
    return '<svg class="pix jar" viewBox="0 0 20 24" shape-rendering="crispEdges" role="img" aria-label="' + n + ' Aktion points"><title>' + n + '● left' + (n > cap ? ' (the jar holds ' + cap + ')' : '') + '</title>' + s + '</svg>';
  }
  function jewelPile(v) {
    var s = '', left = Math.max(0, Math.min(55, v | 0)), idx = 0, hgt = 0; while (hgt * (hgt + 1) / 2 < left) hgt++;
    var rows = []; for (var q = hgt; q >= 1; q--) rows.push(q); // a heap: base grows with the total
    s += px(0, 20, 32, 2, '#5a4632');
    for (var r = 0; r < rows.length && left > 0; r++) {
      var w = rows[r], x0 = 1 + (10 - w) * 1.5, y = 18 - r * 2;
      for (var c = 0; c < w && left > 0; c++, left--, idx++) { var g = GEM[(idx * 5 + r) % GEM.length], x = x0 + c * 3; s += px(x, y, 3, 2, g[0]) + px(x, y, 1, 1, g[1]); }
    }
    return '<svg class="pix pile" viewBox="0 0 32 22" shape-rendering="crispEdges" role="img" aria-label="' + v + ' victory points"><title>' + v + '◇</title>' + s + '</svg>';
  }
  function playersPanel(ctx) {
    if (ctx.state) return playerCards(ctx);
    var st = ctx.state, sc = E.scores(st), h = '<table class="players small"><tr><th></th><th>Player</th><th title="Victory points">◇</th><th title="Aktion points">●</th><th title="Meeples left">♟</th>' + (ctx.kind === 'game' ? '<th title="Cards in hand">Hand</th>' : '') + '</tr>';
    st.players.forEach(function (pl, i) {
      var isCur = ctx.kind === 'game' && i === st.cur;
      h += '<tr class="' + (isCur ? 'cur' : '') + '"' + (pl.out ? ' style="opacity:.5"' : '') + '><td><span class="swatch" style="background:' + pl.color + '"></span></td>' +
        '<td title="' + esc(pl.arch) + '">' + esc(pl.name) + '<br><span class="small" style="opacity:.8">' + esc(pl.arch) + (pl.out ? ' (out)' : '') + '</span></td>' +
        '<td title="Cards ' + sc[i].cards + ' + tokens ' + sc[i].tokens + '">' + sc[i].total + '</td><td>' + (isCur || ctx.kind === 'sandbox' ? pl.ap : '') + '</td><td>' + pl.meeples + '</td>' + (ctx.kind === 'game' ? '<td>' + pl.hand.length + '</td>' : '') + '</tr>';
    });
    h += '</table>';
    if (ctx.kind === 'game') h += '<p class="small muted" style="margin:4px 0 0">First to ' + st.opts.target + '◇ at the end of their turn wins. Banked tokens are included.</p>';
    return h;
  }
  function playerCards(ctx) {
    var st = ctx.state, sc = E.scores(st), h = '<div class="plist">';
    st.players.forEach(function (pl, i) {
      var isCur = ctx.kind === 'game' && i === st.cur;
      h += '<div class="pcard' + (isCur ? ' cur' : '') + (pl.out ? ' out' : '') + '"><div class="pname"><span class="swatch" style="background:' + pl.color + '"></span> <b>' + esc(pl.name) + '</b> <span class="small">' + esc(pl.arch) + (pl.out ? ' (out)' : '') + '</span>' + (isCur ? '<span class="turnmark">◀ turn</span>' : '') + '</div>' +
        '<div class="pbody"><span data-fx="pile-' + i + '">' + jewelPile(sc[i].total) + '</span><div class="pstats"><div class="bignum" title="Victory points: cards ' + sc[i].cards + ' + tokens ' + sc[i].tokens + '">' + sc[i].total + '<span class="unit">◇</span></div>' +
        '<div class="small">♟ ' + pl.meeples + ' meeples' + (ctx.kind === 'game' ? ' · ' + pl.hand.length + ' in hand' : '') + (pl.reserve > 0 ? ' · ' + pl.reserve + '● Reserves' : '') + '</div></div></div></div>';
    });
    h += '</div>';
    if (ctx.kind === 'game') h += '<p class="small muted" style="margin:4px 0 0">First to ' + st.opts.target + '◇ at the end of their turn wins. Banked tokens are included.</p>';
    return h;
  }
  function logClass(l) {
    if (l.indexOf('—') === 0) return 'turn';
    if (/ wins|last player standing|out of the game/.test(l)) return 'lg-win';
    if (/Referee|^Placed |^Removed |^Moved |^Flipped |^Checked |^Buried |cancelled by the referee/.test(l)) return 'lg-ref';
    if (/Overwhelmed|Ruined|is restored|Ruin\b/.test(l)) return 'lg-ruin';
    if (/Curse|[Cc]overs |tucked under/.test(l)) return 'lg-curse';
    if (/ claims |takes back a meeple|returns to its owner/.test(l)) return 'lg-claim';
    if (/banks|\+\d+◇/.test(l)) return 'lg-vp';
    if (/●/.test(l) && !/ plays /.test(l)) return 'lg-ap';
    if (/ plays |uses /.test(l)) return 'lg-play';
    return 'lg-card';
  }
  function logPanel(st) {
    return '<div class="loglegend"><span class="lg-play">plays</span> <span class="lg-claim">claims</span> <span class="lg-ap">●</span> <span class="lg-vp">◇</span> <span class="lg-ruin">Ruin</span> <span class="lg-curse">Curse</span> <span class="lg-card">cards</span> <span class="lg-ref">referee</span></div>' +
      st.log.slice(-150).map(function (l) { return '<div class="' + logClass(l) + '">' + esc(l) + '</div>'; }).join('');
  }

  /* ---------------- pages ---------------- */
  var rendering = false, rerender = false;
  function render() {
    if (rendering) { rerender = true; return; }
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
    if (rerender) { rerender = false; setTimeout(render, 0); }
  }
  function renderNow() {
    var root = $('#app');
    var scrollLog = $('.log'); var atBottom = !scrollLog || scrollLog.scrollTop + scrollLog.clientHeight >= scrollLog.scrollHeight - 20;
    var bw = $('.boardwrap'), bsx = bw ? bw.scrollLeft : 0, bsy = bw ? bw.scrollTop : 0;
    var focusSel = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-focus-key');
    var tabs = [['new', 'New game'], ['game', 'Game'], ['sandbox', 'Sandbox'], ['library', 'Library'], ['builder', 'Card builder'], ['help', 'Help']];
    var h = '<div class="win raised"><div class="titlebar"><span>Kartenspiel — playtest table</span><span class="grow"></span><span class="small" style="font-weight:400">Library: ' + esc(app.libSource) + ', ' + app.lib.length + ' cards</span></div>';
    h += '<div class="menubar" role="tablist">' + tabs.map(function (t) { var dis = t[0] === 'game' && !app.game; return '<button class="tab' + (app.page === t[0] ? ' on' : '') + '" role="tab" data-page="' + t[0] + '"' + (dis ? ' disabled style="opacity:.5"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="content">' + pageHTML() + '</div>';
    var st = cur() && cur().state;
    h += '<div class="statusbar small"><div class="sunken grow">' + esc(statusText()) + '</div>' + (st && app.page !== 'library' && app.page !== 'builder' && app.page !== 'help' && app.page !== 'new' ? '<div class="sunken">Deck ' + st.deck.length + ' · Discard ' + st.discard.length + '</div>' : '') + '</div></div>';
    h += modalHTML();
    root.innerHTML = h;
    var lg = $('.log'); if (lg && atBottom) lg.scrollTop = lg.scrollHeight;
    var bw2 = $('.boardwrap'); if (bw2) { applyZoom(cur()); if (!cur().ui.fit) { bw2.scrollLeft = bsx; bw2.scrollTop = bsy; } }
    if (focusSel) { var f = document.querySelector('[data-focus-key="' + focusSel + '"]'); if (f) { f.focus(); if (f.setSelectionRange && f.value != null) { try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { } } } }
  }
  function statusText() {
    if (app.toast) return app.toast;
    var c = cur();
    if ((app.page === 'game' || app.page === 'sandbox') && c) {
      var st = c.state;
      if (c.err) return c.err;
      if (st.winner != null) return st.players[st.winner].name + ' wins.';
      if (app.page === 'game') return st.players[st.cur].name + ' — round ' + st.round + (st.turn.started ? ', ' + st.players[st.cur].ap + '● to spend' + (st.turn.claimed ? ', claim used' : ', claim available') : ', waiting to start the turn');
      return 'Sandbox: free placement, no costs or turns.';
    }
    return 'Ready.';
  }
  function pageHTML() {
    switch (app.page) {
      case 'game': return app.game ? gamePage(app.game) : newGamePage();
      case 'sandbox': return sandboxPage();
      case 'library': return libraryPage();
      case 'builder': return builderPage();
      case 'help': return helpPage();
      default: return newGamePage();
    }
  }

  /* ----- new game ----- */
  var setup = { n: 2, players: [], handSize: 4, drawPerTurn: 2, meeples: 8, target: 48, enforceWeak: true, foundationBy: 3, autoEnd: true, seatStart: true, burySuitOW: true, defense: true, adjDiscount: true, noWander: true, ascension: true };
  function archetypes() { return sortLib(app.lib.filter(function (c) { return c.type === 'Foundation' && c.archetype; })); }
  function ensureSetup() {
    var A = archetypes().map(function (c) { return c.archetype; });
    for (var i = 0; i < 5; i++) { if (!setup.players[i]) setup.players[i] = { name: 'Player ' + (i + 1), arch: A[i] || A[0] }; }
  }
  function newGamePage() {
    ensureSetup();
    var A = archetypes(), saved = lsGet('ks.game');
    var h = '<div class="page scroll"><div class="pane" style="max-width:720px">';
    if (saved && saved.players && saved.winner == null && !app.game) h += '<div class="banner row" style="margin-bottom:8px">A game in progress was saved in this browser (round ' + saved.round + ', ' + esc(saved.players.map(function (p) { return p.name; }).join(', ')) + '). <button class="btn" data-act="resume">Resume it</button></div>';
    if (app.game) h += '<div class="banner row" style="margin-bottom:8px">A game is running. Starting a new one replaces it. <button class="btn" data-page="game">Back to the game</button></div>';
    h += '<fieldset><legend>Players</legend><div class="row" style="margin-bottom:6px">Number of players <select data-set="n">' + [2, 3, 4, 5].map(function (n) { return '<option' + (n === setup.n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><span class="muted small">Each archetype can be taken by only one player. Turn order goes top to bottom.</span></div>';
    for (var i = 0; i < setup.n; i++) {
      var p = setup.players[i], taken = setup.players.slice(0, setup.n).map(function (q, j) { return j !== i ? q.arch : null; });
      h += '<div class="row" style="margin:3px 0"><span class="swatch" style="background:' + COLORS[i] + ';width:14px;height:14px"></span><input type="text" data-focus-key="pn' + i + '" data-pname="' + i + '" value="' + esc(p.name) + '" style="width:150px">' +
        '<select data-parch="' + i + '">' + A.map(function (c) { return '<option value="' + esc(c.archetype) + '"' + (c.archetype === p.arch ? ' selected' : '') + (taken.indexOf(c.archetype) >= 0 ? ' disabled' : '') + '>' + esc(c.archetype + ' (' + c.name + ', ' + c.suit + ')') + '</option>'; }).join('') + '</select>' +
        '<span class="small muted">' + (function () { var f = A.find(function (c) { return c.archetype === p.arch; }); return f ? 'Weak to ' + esc(f.weakTo) : ''; })() + '</span></div>';
    }
    h += '</fieldset><fieldset><legend>Options</legend><div class="form">' +
      '<label>Hand size</label><input type="number" min="1" max="10" data-set="handSize" value="' + setup.handSize + '">' +
      '<label>Cards drawn per turn</label><input type="number" min="0" max="5" data-set="drawPerTurn" value="' + setup.drawPerTurn + '">' +
      '<label>Meeples each</label><input type="number" min="1" max="30" data-set="meeples" value="' + setup.meeples + '">' +
      '<label>Victory target ◇</label><input type="number" min="1" max="999" data-set="target" value="' + setup.target + '">' +
      '<label>Foundation deadline</label><span><input type="number" min="0" max="10" data-set="foundationBy" value="' + setup.foundationBy + '"> <span class="small muted">turns (0 = no deadline)</span></span>' +
      '<label>Weak-to rule</label><label><input type="checkbox" data-set="enforceWeak"' + (setup.enforceWeak ? ' checked' : '') + '> Players cannot play their weak suit</label>' +
      '<label>Auto end turn</label><label><input type="checkbox" data-set="autoEnd"' + (setup.autoEnd ? ' checked' : '') + '> End the turn when a player is out of ● and has nothing free to do</label>' +
      '<label class="full" style="margin-top:4px"><b>Rule variants</b></label>' +
      '<label>Seat start</label><label><input type="checkbox" data-set="seatStart"' + (setup.seatStart ? ' checked' : '') + '> Later seats get more ● on their first turn: 3, 6, 9, 12, 15</label>' +
      '<label>Deep foundations</label><label><input type="checkbox" data-set="burySuitOW"' + (setup.burySuitOW ? ' checked' : '') + '> Each same-suit card buried under a card raises its Overwhelm number by 1</label>' +
      '<label>Defense tokens</label><label><input type="checkbox" data-set="defense"' + (setup.defense ? ' checked' : '') + '> Every 2 same-suit cards buried under a card give it a Defense token that stops one Ruin or Curse</label>' +
      '<label>Building discount</label><label><input type="checkbox" data-set="adjDiscount"' + (setup.adjDiscount ? ' checked' : '') + '> Placing next to a card you own costs 3● less (minimum 0)</label>' +
      '<label>No wandering</label><label><input type="checkbox" data-set="noWander"' + (setup.noWander ? ' checked' : '') + '> Cards cannot move to a space that touches no other card</label>' +
      '<label>Ascension</label><label><input type="checkbox" data-set="ascension"' + (setup.ascension ? ' checked' : '') + '> A stack holding five different suits Ascends: invulnerable, every suit, +8◇ and +12●</label>' +
      '</div></fieldset>';
    var dup = {}, bad = false; for (var j = 0; j < setup.n; j++) { if (dup[setup.players[j].arch]) bad = true; dup[setup.players[j].arch] = 1; }
    h += '<div class="row"><button class="btn def" data-act="start"' + (bad ? ' disabled' : '') + '>Start game</button>' + (bad ? '<span class="err">Two players picked the same archetype.</span>' : '') +
      '<span class="muted small">The game uses a snapshot of the library as it is now. Edits made later apply to the next game.</span></div>';
    h += '<fieldset style="margin-top:10px"><legend>Save or load</legend><div class="row"><button class="btn" data-act="exportGame"' + (app.game ? '' : ' disabled') + '>Copy current game as text</button><button class="btn" data-act="importGame">Load a game from text…</button></div></fieldset>';
    return h + '</div></div>';
  }

  /* ----- game page ----- */
  function gamePage(ctx) {
    var st = ctx.state, ui = ctx.ui, pl = st.players[st.cur];
    var h = '<div class="page"><div class="gamegrid">';
    h += '<div class="left"><div class="pane raised" style="flex:0 0 auto">' + playersPanel(ctx) + '</div>';
    h += '<div class="pane raised col" style="flex:0 0 auto"><div class="apbox"><span data-fx="jar">' + apJar(st.turn.started ? pl.ap : 0) + '</span><div><div class="bignum">' + (st.turn.started ? pl.ap : '—') + '<span class="unit">●</span></div><div class="small">' + (st.turn.started ? 'Aktion points left' : 'Turn not started') + '</div>' + (pl.debt > 0 ? '<div class="reserve" title="Owed for reactions; taken from your next turn">− ' + pl.debt + '● owed next turn</div>' : '') + (pl.reserve > 0 ? '<div class="reserve" title="Reserves are spent like ● after your ● runs out, and stay between turns">+ ' + pl.reserve + '● Reserves</div>' : '') +
      (st.turn.started ? (function () { var co = E.claimOptions(st, st.cur).length; return '<div class="claimstate' + (co ? ' avail' : '') + '">' + (st.turn.claimed ? 'Claim used' : co ? '♟ Claim available' : 'Claim: nothing to claim yet') + '</div>'; })() : '') + '</div></div>' +
      '<div class="row"><button class="btn def big" data-act="endTurn"' + (st.turn.started && !st.pending && !st.res && st.winner == null ? '' : ' disabled') + '>End turn</button>' +
      '<button class="btn big" data-act="undo"' + (ctx.hist.length ? '' : ' disabled') + ' title="Undo the last action">Undo</button></div>' +
      '<details class="small" data-keep="ref"' + (app.open.ref ? ' open' : '') + '><summary>Referee</summary><div class="col" style="margin-top:4px"><div class="row">● <button class="btn sm" data-act="apAdj" data-d="-1">−</button><button class="btn sm" data-act="apAdj" data-d="1">+</button> ◇ tokens <button class="btn sm" data-act="tokAdj" data-d="-1">−</button><button class="btn sm" data-act="tokAdj" data-d="1">+</button></div>' +
      '<select data-sel="giveId" style="max-width:100%">' + cardOptions(st, ui.giveId) + '</select><button class="btn sm" data-act="give">Give to ' + esc(pl.name) + '’s hand</button></div></details></div>';
    h += '<div class="raised" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:3px"><div class="panelhead" style="margin:0 0 3px">Log</div><div class="log sunken">' + logPanel(st) + '</div></div></div>';
    h += '<div class="center">' + boardBar(ctx) + promptBar(ctx) + '<div class="boardwrap sunken">' + boardHTML(ctx).html + '</div></div>';
    h += '<div class="right raised pane">' + inspector(ctx) + '</div>';
    h += '<div class="bottom raised">' + handHTML(ctx) + '</div>';
    return h + '</div></div>';
  }
  function promptBar(ctx) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (ctx.err) return '<div class="prompt">' + esc(ctx.err) + ' <button class="btn sm" data-act="clearErr">OK</button></div>';
    if (ctx.kind === 'sandbox') {
      if (ui.mode === 'move') return '<div class="prompt">Click an empty space to move the card from ' + esc(ui.moveFrom) + '. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
      return '';
    }
    if (st.winner != null) return '<div class="prompt"><b>' + esc(st.players[st.winner].name) + ' wins!</b> <button class="btn sm" data-page="new">New game</button></div>';
    if (pd && pd.kind === 'cell') return '<div class="prompt"><b>' + esc(st.players[pd.player].name) + ':</b> ' + esc(pd.prompt) + ' Click an orange-outlined ' + (pd.empty ? 'space' : 'card') + '.' + (pd.optional ? ' <button class="btn sm" data-act="skip">Skip</button>' : '') + (st.res ? ' <button class="btn sm" data-act="cancelEffect" title="Referee: stop resolving this effect">Cancel effect</button>' : '') + '</div>';
    if (ui.autoEnding) return '<div class="prompt"><b>Out of ●.</b> Nothing left to play, claim or use, so your turn ends in a moment. <button class="btn sm" data-act="holdTurn">Wait, I’m not done</button></div>';
    if (ui.mode === 'reclaim') return '<div class="prompt">Click one of your claimed cards to take its meeple back. This ends your turn. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
    if (ui.mode === 'move') return '<div class="prompt">Referee move: click an empty space for the card from ' + esc(ui.moveFrom) + '. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
    if (ui.swap) return '<div class="prompt">Choose 2 cards to discard, then draw 1. <button class="btn sm def" data-act="doSwap"' + (ui.swap.length === 2 ? '' : ' disabled') + '>Discard 2, draw 1</button><button class="btn sm" data-act="cancelSwap">Cancel</button></div>';
    if (ui.hand && !E.needsPlacement(E.rawDef(st, ui.hand))) { var ic = +E.rawDef(st, ui.hand).cost || 0, iok = ic <= E.funds(st.players[st.cur]), iwhy = E.playBlock(st, st.cur, ui.hand); return '<div class="prompt">' + esc(E.rawDef(st, ui.hand).name) + ' is played straight from your hand. <button class="btn sm def" data-act="cast"' + (iok && !iwhy ? '' : ' disabled') + '>' + (iwhy ? esc(iwhy) : iok ? 'Play it (' + ic + '●)' : 'Not enough AP (' + ic + '●)') + '</button> <button class="btn sm" data-act="deselect">Cancel</button></div>'; }
    if (ui.hand) { var LC = E.legalCells(st, ui.hand), canPay = Object.keys(LC).some(function (x) { return LC[x] <= E.funds(st.players[st.cur]); }); return '<div class="prompt">' + (canPay ? 'Click a green space to play ' + esc(E.rawDef(st, ui.hand).name) + '.' : 'Not enough AP to play ' + esc(E.rawDef(st, ui.hand).name) + ' anywhere (you have ' + st.players[st.cur].ap + '●).') + ' <button class="btn sm" data-act="deselect">Cancel</button></div>'; }
    var co = st.turn.started && !pd && !st.res ? E.claimOptions(st, st.cur) : [];
    if (co.length) return '<div class="prompt">Claim available: your cursor is a meeple. Click an orange-outlined card to claim it (' + st.players[st.cur].meeples + ' meeples left), or keep playing.</div>';
    return '';
  }
  function handHTML(ctx) {
    var st = ctx.state, ui = ctx.ui, pl = st.players[st.cur];
    if (!st.turn.started || st.winner != null) return '<div class="hand"><span class="muted">' + (st.winner != null ? 'Game over.' : 'Hand hidden until ' + esc(pl.name) + ' starts their turn.') + '</span></div>';
    var h = '<div class="row small" style="padding:4px 6px 0"><b>' + esc(pl.name) + '’s hand</b> <span class="muted">(' + esc(pl.arch) + ', weak to ' + esc((E.archInfo(st)[pl.arch] || {}).weakTo || '—') + ')</span>' +
      '<button class="btn sm" data-act="startSwap"' + (pl.hand.filter(function (x) { return E.rawDef(st, x).type !== 'Foundation'; }).length >= 2 && !st.pending && !ui.swap ? '' : ' disabled') + '>Discard 2, draw 1…</button>' +
      (st.turn.played === 0 && !st.turn.claimed ? '' : '') + '</div><div class="hand">';
    pl.hand.forEach(function (u) {
      var d = E.rawDef(st, u), cls = 'hcard', blocked = E.playBlock(st, st.cur, u);
      if (ui.hand === u) cls += ' sel'; if (blocked) cls += ' blocked'; if (ui.swap && ui.swap.indexOf(u) >= 0) cls += ' pick';
      if (!blocked && !st.pending && !st.res && canAfford(st, u)) cls += ' afford';
      var free = E.isFree(st, u); if (free) cls += ' free';
      h += '<div class="' + cls + '"' + (blocked ? ' title="' + esc(blocked) + '"' : '') + '>' + defFace(Object.assign({}, d, { art: artOf(d.id) }), free ? { mid: true, cost: 0 } : { mid: true }) + (free ? '<span class="freetag">Free this turn</span>' : '') + '<button class="cellbtn" data-hand="' + u + '" aria-label="' + esc(d.name) + '"></button></div>';
    });
    if (pl.aside && pl.aside.length) h += '<span class="muted small" style="align-self:center">Set aside for next turn: ' + pl.aside.length + ' card' + (pl.aside.length > 1 ? 's' : '') + '</span>';
    if (!pl.hand.length) h += '<span class="muted">No cards in hand.</span>';
    return h + '</div>';
  }

  /* ----- modals ----- */
  function modal(title, body, btns) { return '<div class="modalbg"><div class="modal raised" role="dialog" aria-label="' + esc(title) + '"><div class="titlebar"><span>' + esc(title) + '</span></div><div class="body">' + body + '</div><div class="btns">' + (btns || '') + '</div></div></div>'; }
  function modalHTML() {
    if (app.modal) return app.modal();
    var ctx = cur(); if (!ctx || (app.page !== 'game' && app.page !== 'sandbox')) return '';
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (st.reveal) {
      var rv = st.reveal;
      return modal(st.players[rv.of].name + '’s hand', '<p>Shown to ' + esc(st.players[rv.to].name) + ' only.</p><div class="hand">' + rv.cards.map(function (u) { return '<div class="hcard">' + defFace(E.rawDef(st, u), { mid: true }) + '</div>'; }).join('') + (rv.cards.length ? '' : '<span class="muted">Their hand is empty.</span>') + '</div>', '<button class="btn def" data-act="closeReveal">Close</button>');
    }
    if (ctx.kind !== 'game') { if (pd && pd.kind !== 'cell') return pendingModal(ctx); return ''; }
    if (st.winner != null) return '';
    if (!st.turn.started && ui.mode !== 'reclaim') {
      var pl = st.players[st.cur];
      var hasClaims = E.keys(st).some(function (k) { var c = st.cards[E.top(st, k)]; return !c.fixed && c.claimants.indexOf(st.cur) >= 0; });
      return modal('Next turn', '<p style="font-size:15px"><span class="swatch" style="background:' + pl.color + ';width:14px;height:14px"></span> Pass the device to <b>' + esc(pl.name) + '</b> (' + esc(pl.arch) + ').</p><p class="small muted">Starting the turn gains ● and draws ' + (st.opts.drawPerTurn != null ? st.opts.drawPerTurn : 1) + ' card' + ((st.opts.drawPerTurn != null ? +st.opts.drawPerTurn : 1) === 1 ? '' : 's') + '. Taking back a meeple replaces the whole turn: no ●, no draw, no plays.</p>',
        (ctx.hist.length ? '<button class="btn" data-act="undo">Undo last action</button>' : '') + '<button class="btn" data-act="reclaimMode"' + (hasClaims ? '' : ' disabled') + '>Take back a meeple instead</button><button class="btn def big" data-act="startTurn">Start ' + esc(pl.name) + '’s turn</button>');
    }
    if (pd && pd.kind !== 'cell') return pendingModal(ctx);
    return '';
  }
  function pendingModal(ctx) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending, who = st.players[pd.player];
    if (pd.kind !== 'cell' && pd.player !== st.cur && ui.passFor !== pd.player + ':' + st.log.length)
      return modal('Pass the device', '<p>Pass the device to <b>' + esc(who.name) + '</b> for a decision.</p>', '<button class="btn def" data-act="passOK" data-v="' + pd.player + ':' + st.log.length + '">I’m ' + esc(who.name) + '</button>');
    if (pd.kind === 'hand') {
      var hand = pd.options || who.hand, picked = ui.picked;
      return modal(who.name + ': choose cards', '<p>' + esc(pd.prompt) + ' (' + picked.length + ' of ' + pd.count + ' chosen)</p><div class="hand" style="flex-wrap:wrap">' + hand.map(function (u) {
        var weak = (E.archInfo(st)[who.arch] || {}).weakTo, isWeak = weak && E.rawDef(st, u).suit === weak;
        return '<div class="hcard' + (picked.indexOf(u) >= 0 ? ' pick' : '') + (isWeak ? ' weak' : '') + '"' + (isWeak ? ' title="Your weak suit: you can’t play this card"' : '') + '>' + defFace(E.rawDef(st, u), { mid: true }) + (isWeak ? '<span class="weaktag">Weak suit</span>' : '') + '<button class="cellbtn" data-pick="' + u + '" aria-label="' + esc(E.rawDef(st, u).name) + '"></button></div>';
      }).join('') + '</div>', (st.res ? '<button class="btn" data-act="cancelEffect">Cancel effect</button>' : '') + '<button class="btn def" data-act="answerHand"' + (picked.length === pd.count ? '' : ' disabled') + '>Confirm</button>');
    }
    if (pd.kind === 'suit') return modal(who.name + ': choose a suit', '<p>' + esc(pd.prompt) + '</p><div class="row">' + pd.options.map(function (s) { return '<button class="btn" data-answer="' + s + '">' + icon(s) + ' ' + s + '</button>'; }).join('') + (pd.allowKeep ? '<button class="btn" data-answer="keep">Keep its suit</button>' : '') + '</div>', '');
    if (pd.kind === 'player') return modal(who.name + ': choose a player', '<p>' + esc(pd.prompt) + '</p><div class="row">' + pd.options.map(function (i) { return '<button class="btn" data-answer-p="' + i + '"><span class="swatch" style="background:' + st.players[i].color + '"></span> ' + esc(st.players[i].name) + ' (' + st.players[i].hand.length + ' cards)</button>'; }).join('') + (pd.allowNone ? '<button class="btn" data-act="answerNone">' + esc(pd.noneLabel || 'No one') + '</button>' : '') + (pd.options.length || pd.allowNone ? '' : '<span class="muted">No player can be chosen.</span>') + '</div>', pd.options.length || pd.allowNone ? '' : '<button class="btn def" data-act="answerNone">OK</button>');
    if (pd.kind === 'confirm') return modal(who.name + ': decide', '<p>' + esc(pd.prompt) + '</p>', '<button class="btn" data-act="answerNo">No</button><button class="btn def" data-act="answerYes">Yes</button>');
    if (pd.kind === 'manual') return modal('Resolve by hand', '<p>' + esc(pd.prompt) + '</p><p class="small muted">Use the referee tools if the board needs changing.</p>', '<button class="btn def" data-answer="done">Done</button>');
    return '';
  }

  /* ----- sandbox ----- */
  function sandboxPage() {
    if (!app.sandbox) newSandbox();
    var ctx = app.sandbox, st = ctx.state, ui = ctx.ui;
    var h = '<div class="page"><div class="gamegrid">';
    h += '<div class="left"><div class="pane raised col">' + playersPanel(ctx) +
      '<div class="small">Banked ◇ tokens: ' + st.players.map(function (p, i) { return '<div class="row"><span class="swatch" style="background:' + p.color + '"></span>' + esc(p.name) + ' ◇<button class="btn sm" data-act="ptok" data-i="' + i + '" data-d="-1">−</button><button class="btn sm" data-act="ptok" data-i="' + i + '" data-d="1">+</button></div>'; }).join('') + '</div>' +
      '<button class="btn" data-act="sbNew">Reset sandbox…</button></div>';
    h += '<div class="pane raised col"><div class="h">Place cards</div><select data-sel="sbCard" style="width:100%">' + cardOptions(st, ui.sbCard) + '</select>' +
      '<div class="row small"><label><input type="radio" name="sbm" data-sbmode="place"' + (ui.sbMode === 'place' ? ' checked' : '') + '> Click to place</label><label><input type="radio" name="sbm" data-sbmode="bury"' + (ui.sbMode === 'bury' ? ' checked' : '') + '> Click to bury under</label><label><input type="radio" name="sbm" data-sbmode="look"' + (ui.sbMode === 'look' ? ' checked' : '') + '> Just select</label></div>' +
      '<label class="small"><input type="checkbox" data-tog="autoCheck"' + (ui.autoCheck ? ' checked' : '') + '> Apply Overwhelm automatically</label>' +
      '<div class="row"><button class="btn sm" data-act="undo"' + (ctx.hist.length ? '' : ' disabled') + '>Undo</button><button class="btn sm" data-act="sbCheck">Check Overwhelm now</button></div>' +
      '<p class="small muted" style="margin:0">Click an empty space to place the chosen card. Foundations go to the player with that archetype. Click a card to select it and use the tools on the right.</p></div>';
    h += '<div class="raised" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:3px"><div class="panelhead" style="margin:0 0 3px">Log</div><div class="log sunken">' + logPanel(st) + '</div></div></div>';
    h += '<div class="center">' + boardBar(ctx) + promptBar(ctx) + '<div class="boardwrap sunken">' + boardHTML(ctx).html + '</div></div>';
    h += '<div class="right raised pane">' + inspector(ctx) + '</div>';
    h += '<div class="bottom raised small" style="padding:4px 6px">Score breakdown: ' + E.scores(st).map(function (s, i) { var base = 0, ct = 0; E.kingdom(st, i).forEach(function (k) { var q = E.valueParts(st, k, i); base += q.base; ct += q.cardTok; }); return '<b>' + esc(st.players[i].name) + '</b> ' + base + ' from card values + ' + (ct + s.tokens) + ' in tokens = ' + s.total + '◇'; }).join(' · ') + '</div>';
    return h + '</div></div>';
  }
  var sbSetup = { n: 2, arch: [] };
  function newSandbox() {
    var A = archetypes().map(function (c) { return c.archetype; });
    var ps = []; for (var i = 0; i < sbSetup.n; i++) ps.push({ name: 'Player ' + (i + 1), arch: sbSetup.arch[i] || A[i], color: COLORS[i] });
    var saved = lsGet('ks.sandbox');
    var st = saved && saved.opts && saved.opts.sandbox && !app._sbReset ? saved : E.newGame(app.lib, { players: ps, sandbox: true });
    app._sbReset = false;
    app.sandbox = newCtx(st, 'sandbox'); app.sandbox.ui.sbCard = Object.keys(st.defs)[0];
  }

  /* ----- library ----- */
  function libraryPage() {
    var L = app.libUI, rows = app.lib.filter(function (c) {
      return (!L.suit || c.suit === L.suit) && (!L.type || c.type === L.type) && (!L.q || (c.name + ' ' + c.text).toLowerCase().indexOf(L.q.toLowerCase()) >= 0);
    });
    var sorters = { suit: null, name: function (a, b) { return a.name.localeCompare(b.name); }, cost: function (a, b) { return a.cost - b.cost; }, type: function (a, b) { return a.type.localeCompare(b.type); } };
    if (sorters[L.sort]) rows = rows.slice().sort(sorters[L.sort]);
    var h = '<div class="page">';
    if (app.dbEmpty) h += '<div class="banner row">The shared library is empty. <button class="btn" data-act="restore">Load the starter cards</button></div>';
    h += '<div class="raised row" style="padding:4px">Search <input type="text" data-focus-key="libq" data-lib="q" value="' + esc(L.q) + '" style="width:160px">' +
      'Suit <select data-lib="suit"><option value="">All</option>' + D.SUITS.map(function (s) { return '<option' + (L.suit === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      'Type <select data-lib="type"><option value="">All</option>' + D.TYPES.map(function (s) { return '<option' + (L.type === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<span class="grow" style="flex:1"></span><button class="btn" data-act="newCard">New card</button><button class="btn" data-act="exportLib">Export…</button><button class="btn" data-act="importLib">Import…</button><button class="btn" data-act="restoreAsk">Restore starter cards…</button></div>';
    h += '<div class="split"><div class="sunken scroll"><table class="list small"><thead><tr>' +
      [['name', 'Name'], ['suit', 'Suit'], ['type', 'Type'], ['cost', 'Cost'], ['', 'Value'], ['', 'Income'], ['', 'Copies'], ['', 'Automation']].map(function (c) { return '<th' + (c[0] ? ' data-sort="' + c[0] + '"' : '') + '>' + c[1] + (L.sort === c[0] ? ' ▾' : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (c) {
      h += '<tr data-row="' + esc(c.id) + '" class="' + (L.sel === c.id ? 'sel' : '') + '"><td>' + esc(c.name) + '</td><td>' + icon(c.suit) + ' ' + esc(c.suit) + '</td><td>' + esc(c.type) + '</td><td>' + esc(c.cost) + '●</td><td>' + esc(scoreText(c.score)) + '</td><td>' + (+c.income ? c.income + '●' : '') + '</td><td>' + (c.type === 'Foundation' ? '—' : esc(c.copies)) + '</td><td>' + esc(autoSummary(c)) + '</td></tr>';
    });
    h += '</tbody></table>' + (rows.length ? '' : '<p class="pane muted">No cards match. Clear the filters or add a new card.</p>') + '</div>';
    var sel = L.sel && libById(L.sel);
    h += '<div class="raised pane">' + (sel ? '<div class="panelhead">Preview</div>' + defFace(sel, { big: true }) + '<div class="row" style="margin-top:6px"><button class="btn def" data-act="editCard" data-id="' + esc(sel.id) + '">Edit</button><button class="btn" data-act="dupCard" data-id="' + esc(sel.id) + '">Duplicate</button><button class="btn" data-act="delCard" data-id="' + esc(sel.id) + '">Delete…</button></div>' : '<p class="muted">Select a card to preview it.</p>') + '</div></div></div>';
    return h;
  }
  function autoSummary(c) {
    var parts = [];
    if ((c.type === 'Action' || c.type === 'Blessing') && !E.needsPlacement(c)) parts.push('instant');
    if (c.onPlay && c.onPlay.length) parts.push(c.onPlay.some(function (s) { return s.do === 'manual'; }) ? 'by hand' : 'on play');
    if (c.ability) parts.push('ability');
    if (c.curse) parts.push('curse');
    if (c.mods && Object.keys(c.mods).length) parts.push('rules');
    return parts.join(', ') || (c.score && c.score.kind !== 'none' ? 'scoring' : '');
  }

  /* ----- card builder ----- */
  var STEP_PRESETS = {
    '': 'None', 'draw1discard1': 'Draw 1, then discard 1', 'draw2discard1': 'Draw 2, then discard 1', 'ruinAdj': 'Ruin an adjacent card', 'ruinAdjNonBone': 'Ruin an adjacent non-Bone card',
    'ruinWest': 'Ruin the card west of a card you own', 'ruin3': 'Ruin a card 3 spaces away', 'ruinEastIf2': 'If you own 2 adjacent cards, Ruin the card east',
    'convertNearOwn': 'Change suit of a card next to one you own', 'curseNearOwn': 'Curse a card next to one you own', 'curseAdj': 'Curse an adjacent card',
    'cleanse': 'Remove a Curse from an adjacent card', 'unruinBone': 'Flip a Ruined card back as Bone', 'searchDiscard': 'Name a suit, discard until found, draw it',
    'searchBottom': 'Name a suit, reveal until found, draw it', 'reveal': 'A chosen player reveals their hand', 'takeBone': 'Take all Bone cards from a player’s hand',
    'embalm': 'Bury cards from hand under your Foundation', 'drawBuried2': 'Draw 2 buried cards', 'portcullis': 'Owner of an adjacent card discards down to 3',
    'copy12': 'Copy an adjacent card costing up to 12●', 'freshHand': 'Discard hand, draw up to hand size + 1', 'northBonus': 'Owners of cards north of it get 1◇ (2◇ if a card is buried under)', 'manual': 'Resolve by hand (show text)'
  };
  var PRESET_STEPS = {
    'draw1discard1': [{ do: 'draw', n: 1 }, { do: 'discard', n: 1 }], 'draw2discard1': [{ do: 'draw', n: 2 }, { do: 'discard', n: 1 }],
    'ruinAdj': [{ do: 'ruin', area: 'adjacent' }], 'ruinAdjNonBone': [{ do: 'ruin', area: 'adjacent', notSuit: 'Bone' }], 'ruinWest': [{ do: 'ruin', area: 'westOfOwn' }],
    'ruin3': [{ do: 'ruin', area: 'ring3' }], 'ruinEastIf2': [{ do: 'ruin', area: 'east1', ownAdjacentAtLeast: 2, auto: true }],
    'convertNearOwn': [{ do: 'setSuit', area: 'adjacentToOwn', suit: 'choose' }], 'curseNearOwn': [{ do: 'curse', area: 'adjacentToOwn' }], 'curseAdj': [{ do: 'curse', area: 'adjacent' }],
    'cleanse': [{ do: 'removeCurse', area: 'adjacent', chooseSuit: true }], 'unruinBone': [{ do: 'unruin', setSuit: 'Bone' }],
    'searchDiscard': [{ do: 'searchSuit', rest: 'discard' }], 'searchBottom': [{ do: 'searchSuit', rest: 'bottom' }], 'reveal': [{ do: 'revealHand' }],
    'takeBone': [{ do: 'takeSuitFromHand', suit: 'Bone' }], 'embalm': [{ do: 'buryFromHand', n: 1, bonusArchetype: 'Cryptkeeper', bonusN: 2 }],
    'drawBuried2': [{ do: 'drawBuried', n: 2 }], 'portcullis': [{ do: 'discardDownTo', n: 3, area: 'adjacent' }], 'copy12': [{ do: 'copy', area: 'adjacent', maxCost: 12 }],
    'freshHand': [{ do: 'discardHand' }, { do: 'drawTo', plus: 1 }], 'northBonus': [{ do: 'northBonusOnce', plain: 1, buried: 2 }], 'manual': [{ do: 'manual', text: '' }]
  };
  var SCORE_KINDS = { none: 'No ◇ value', flat: 'Flat value', perAdjacentSuit: 'Per adjacent card of a suit', perSuitInKingdom: 'Per card of a suit in your Kingdom', perSuitSplit: 'Per suit card in / outside your Kingdom', perBuriedInKingdom: 'Per buried card in your Kingdom', perDistinctSuitInKingdom: 'Per different suit in your Kingdom', largestRegion: 'Per card in largest Kingdom region', perCardNorth: 'Per card north in its column', flatDoubledIfSurrounded: 'Flat, doubled if fully surrounded', flatMinusPerAdjacentNotOwned: 'Flat minus per neighbor you don’t own', flatMinusPerExtraClaimant: 'Flat minus per extra claimant', flatPlusTokens: 'Flat plus tokens on the card' };
  var SEES = { none: 'Nothing', adjacent: 'Adjacent (4 sides)', surround8: 'All 8 around', north: 'Column to the north', east1: 'Card directly east', ring3: 'Cards 3 spaces away', kingdom: 'Owner’s Kingdom', adjacentToOwn: 'Cards next to the owner’s cards', westOfOwn: 'Cards west of the owner’s cards', board: 'Whole board' };
  function presetOf(steps) { var s = JSON.stringify(steps || []); if (s === '[]') return ''; for (var k in PRESET_STEPS) if (JSON.stringify(PRESET_STEPS[k]) === s) return k; return 'custom'; }
  function openBuilder(card) { app.builder = { card: normalizeCard(clone(card)), orig: card.id || null, json: JSON.stringify(card.onPlay || [], null, 1), jsonErr: null }; app.page = 'builder'; render(); }
  function builderPage() {
    if (!app.builder) return '<div class="page"><div class="pane"><p>Pick a card to edit in the Library, or start a new one.</p><div class="row"><button class="btn def" data-act="newCard">New card</button><button class="btn" data-page="library">Open the library</button></div></div></div>';
    var B = app.builder, c = B.card, sk = c.score || { kind: 'none' }, m = c.mods || {};
    function inp(field, val, type, extra) { return '<input type="' + (type || 'text') + '" data-focus-key="b-' + field + '" data-b="' + field + '" value="' + esc(val == null ? '' : val) + '"' + (extra || '') + '>'; }
    function sel(field, val, opts) { return '<select data-b="' + field + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>'; }
    function chk(field, on, label) { return '<label><input type="checkbox" data-bc="' + field + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; }
    var suitOpts = D.SUITS, pre = presetOf(c.onPlay);
    var h = '<div class="page"><div class="split"><div class="raised pane scroll"><div class="form">';
    h += '<label>Name</label>' + inp('name', c.name) + '<label>Id</label><span>' + inp('id', c.id, 'text', B.orig ? ' disabled title="The id is fixed once saved"' : '') + ' <span class="small muted">used in saves; letters, digits, dashes</span></span>';
    h += '<label>Suit</label>' + sel('suit', c.suit, suitOpts) + '<label>Type</label>' + sel('type', c.type, D.TYPES);
    h += '<label>Cost ●</label><span>' + inp('cost', c.cost, 'number') + ' Copies in deck ' + inp('copies', c.copies, 'number') + '</span>';
    h += '<label>Income ● per turn</label><span>' + inp('income', c.income, 'number') + ' plus ' + inp('incomePerToken', c.incomePerToken, 'number') + '● per token on the card</span>';
    h += '<label>Rules text</label><textarea data-focus-key="b-text" data-b="text" rows="3">' + esc(c.text) + '</textarea>';
    h += '<label>Artwork</label><span class="row"><input type="file" accept="image/*" data-art="1">' + (c.art ? '<button class="btn sm" data-act="clearArt">Remove art</button>' : '') + '<span class="small muted">Scaled down to fit in the library.</span></span>';
    h += '</div><fieldset style="margin-top:8px"><legend>Value (◇)</legend><div class="form"><label>How it scores</label>' + sel('score.kind', sk.kind, Object.keys(SCORE_KINDS).map(function (k) { return [k, SCORE_KINDS[k]]; }));
    if (sk.kind !== 'none') h += '<label>Amount</label><span>' + inp('score.n', sk.n, 'number') + (/Split|Minus/.test(sk.kind) ? ' second amount ' + inp('score.m', sk.m, 'number') : '') + (/Suit(?!s)|perSuit/.test(sk.kind) && sk.kind !== 'perDistinctSuitInKingdom' ? ' suit ' + sel('score.suit', sk.suit, suitOpts) : '') + '</span>';
    h += '</div></fieldset><fieldset><legend>Placement and sight</legend><div class="form"><label>Sides that may touch</label><span class="row">' +
      (c.place === 'diag' ? '<span>Corners only</span>' : ['N', 'E', 'S', 'W'].map(function (s) { return '<label><input type="checkbox" data-place="' + s + '"' + (c.place.indexOf(s) >= 0 ? ' checked' : '') + '> ' + s + '</label>'; }).join('')) +
      '<label><input type="checkbox" data-place="diag"' + (c.place === 'diag' ? ' checked' : '') + '> Diagonal (Watchtower)</label></span>';
    h += '<label>Overwhelm number</label><span>' + inp('overwhelm', c.overwhelm, 'number', ' placeholder="' + (c.type === 'Foundation' ? 8 : 3) + '"') + ' <span class="small muted">blank = default (3, Foundations 8)</span></span>';
    h += '<label>What it sees</label><span>' + sel('sees.area', (c.sees || {}).area || 'none', Object.keys(SEES).map(function (k) { return [k, SEES[k]]; })) + ' counting ' + sel('sees.suit', (c.sees || {}).suit || '', [['', 'any suit']].concat(suitOpts)) + '</span>';
    h += '</div></fieldset><fieldset><legend>When played</legend><div class="form"><label>Effect</label>' + sel('preset', pre, Object.keys(STEP_PRESETS).map(function (k) { return [k, STEP_PRESETS[k]]; }).concat(pre === 'custom' ? [['custom', 'Custom steps (below)']] : []));
    h += '<label>Extra ● once</label>' + inp('gainOnce', (c.onPlay || []).filter(function (s) { return s.do === 'gainAP'; }).map(function (s) { return s.n; })[0] || '', 'number');
    h += '<details class="full"><summary>Advanced: effect steps as JSON</summary><textarea data-focus-key="b-json" data-json="1" rows="6" style="font-family:monospace;font-size:12px">' + esc(B.json) + '</textarea>' + (B.jsonErr ? '<div class="err">' + esc(B.jsonErr) + '</div>' : '') + '<p class="small muted">Step types: draw, discard, discardHand, drawTo, gainAP, ruin, setSuit, curse, removeCurse, unruin, searchSuit, revealHand, takeSuitFromHand, buryFromHand, drawBuried, discardDownTo, copy, northBonusOnce, manual. Areas: adjacent, adjacentToOwn, westOfOwn, east1, ring3, board.</p></details>';
    h += '</div></fieldset><fieldset><legend>Ongoing rules</legend><div class="form">';
    h += '<label>Ability</label><span>' + sel('ability.kind', c.ability ? c.ability.kind : '', [['', 'None'], ['exchange', 'Exchange ● for ◇'], ['convert', 'Convert an adjacent card'], ['move', 'Move to adjacent space'], ['buryHand', 'Bury a card from hand under it'], ['confess', 'Any player confesses a Curse here'], ['swapMeeple', 'Offer a meeple swap'], ['manual', 'By hand']]) + (c.ability ? ' cost ' + inp('ability.pay', c.ability.pay, 'number') + (c.ability.kind === 'exchange' ? ' gain ◇ ' + inp('ability.gain', c.ability.gain, 'number') : '') : '') + '</span>';
    h += '<label>Modifiers</label><span class="col">' + '<span>Playing next to it costs +' + inp('mods.adjacentCost', m.adjacentCost || '', 'number') + '●</span>' + '<span>Cards north gain ' + inp('mods.northBonus', m.northBonus || '', 'number') + '◇ each (plus per buried card)</span>' +
      '<span>Pays the Foundation owner ' + inp('mods.payoutOnRuin', m.payoutOnRuin || '', 'number') + '◇ per Ruin/Overwhelm they cause</span>' +
      '<span>' + chk('mods.multiClaim', m.multiClaim, 'Any number of players can claim it') + '</span><span>' + chk('mods.surroundRotate', m.surroundRotate, 'Rotates its neighbors clockwise when fully surrounded') + '</span>' +
      '<span>Can’t be played if you own more than ' + inp('mods.limitN', m.cannotPlayIfOwnMore ? m.cannotPlayIfOwnMore.n : '', 'number') + ' ' + sel('mods.limitSuit', m.cannotPlayIfOwnMore ? m.cannotPlayIfOwnMore.suit : 'Sceptre', suitOpts) + ' cards</span>' +
      '<span>Gains ' + inp('perTurnToken', c.perTurn ? c.perTurn.token : '', 'number') + ' token(s) on itself each of its owner’s turns</span></span>';
    if (c.type === 'Curse') h += '<label>Curse</label><span>' + sel('curse.mode', c.curse ? c.curse.mode : 'under', [['under', 'Tucked under its target'], ['top', 'Covers its target']]) + ' ' + sel('curse.effect', c.curse ? c.curse.effect : 'noIncome', [['noIncome', 'Target produces no ●'], ['cover', 'Target loses effects and owner'], ['none', 'No automatic effect']]) + ' released by ' + sel('curse.releasedBy', c.curse ? c.curse.releasedBy || '' : '', [['', 'nothing']].concat(suitOpts)) + '</span>';
    if (c.type === 'Foundation') h += '<label>Archetype</label><span>' + inp('archetype', c.archetype) + ' weak to ' + sel('weakTo', c.weakTo, [['', 'nothing']].concat(suitOpts)) + '</span>';
    h += '<label>Designer note</label>' + inp('note', c.note);
    h += '</div></fieldset><div class="row"><button class="btn def" data-act="saveCard">Save card</button><button class="btn" data-act="saveCopy">Save as a new card</button>' + (B.orig ? '<button class="btn" data-act="delCard" data-id="' + esc(B.orig) + '">Delete…</button>' : '') + '<button class="btn" data-act="closeBuilder">Close</button></div>';
    h += '</div><div class="raised pane"><div class="panelhead">Preview</div>' + defFace(c, { big: true }) + '<p class="small muted">Saved cards go to the ' + esc(app.db ? 'shared library' : 'library in this browser') + '. Running games keep their own copy of the cards.</p></div></div></div>';
    return h;
  }
  function setPath(o, path, v) { var p = path.split('.'); var x = o; for (var i = 0; i < p.length - 1; i++) { if (x[p[i]] == null || typeof x[p[i]] !== 'object') x[p[i]] = {}; x = x[p[i]]; } x[p[p.length - 1]] = v; }
  function builderChange(field, raw) {
    var c = app.builder.card, num = ['cost', 'copies', 'income', 'incomePerToken', 'score.n', 'score.m', 'overwhelm', 'ability.pay', 'ability.gain', 'mods.adjacentCost', 'mods.northBonus', 'mods.payoutOnRuin', 'gainOnce', 'mods.limitN', 'perTurnToken'];
    var v = num.indexOf(field) >= 0 ? (raw === '' ? '' : +raw) : raw;
    if (field === 'name' && !app.builder.orig) { c.name = v; c.id = slug(v); return true; }
    if (field === 'id') { c.id = slug(v); return true; }
    if (field === 'preset') { var steps = v === '' ? [] : v === 'custom' ? c.onPlay : clone(PRESET_STEPS[v]); if (v === 'manual') steps[0].text = c.text; c.onPlay = withGain(steps, gainOf(c)); app.builder.json = JSON.stringify(c.onPlay, null, 1); return true; }
    if (field === 'gainOnce') { c.onPlay = withGain((c.onPlay || []).filter(function (s) { return s.do !== 'gainAP'; }), v); app.builder.json = JSON.stringify(c.onPlay, null, 1); return true; }
    if (field === 'ability.kind') { c.ability = v ? { kind: v, pay: v === 'exchange' ? 12 : v === 'convert' ? 6 : 0, gain: v === 'exchange' ? 4 : 0 } : null; return true; }
    if (field === 'overwhelm') { c.overwhelm = v === '' ? null : v; return false; }
    if (field === 'perTurnToken') { c.perTurn = v ? { token: v } : null; return false; }
    if (field === 'mods.limitN' || field === 'mods.limitSuit') { c.mods = c.mods || {}; var lim = c.mods.cannotPlayIfOwnMore || { suit: 'Sceptre', n: '' }; if (field === 'mods.limitN') lim.n = v; else lim.suit = v; if (lim.n === '' || lim.n == null) delete c.mods.cannotPlayIfOwnMore; else c.mods.cannotPlayIfOwnMore = lim; return false; }
    if (field.indexOf('mods.') === 0) { c.mods = c.mods || {}; var mk = field.slice(5); if (v === '' || v === 0 || v === false) delete c.mods[mk]; else c.mods[mk] = v; return false; }
    if (field === 'type') { c.type = v; if (v === 'Curse' && !c.curse) c.curse = { mode: 'under', effect: 'noIncome' }; if (v !== 'Curse') c.curse = null; return true; }
    if (field === 'score.kind') { c.score = { kind: v, n: (c.score && c.score.n) || 0, m: (c.score && c.score.m) || 0, suit: (c.score && c.score.suit) || c.suit }; return true; }
    if (field === 'sees.suit') { c.sees = c.sees || { area: 'none' }; if (v) c.sees.suit = v; else delete c.sees.suit; return false; }
    if (field === 'curse.releasedBy') { c.curse = c.curse || {}; if (v) c.curse.releasedBy = v; else delete c.curse.releasedBy; return false; }
    setPath(c, field, v); return /^(suit|ability\.)/.test(field) || field === 'sees.area';
  }
  function gainOf(c) { var g = (c.onPlay || []).filter(function (s) { return s.do === 'gainAP'; })[0]; return g ? g.n : ''; }
  function withGain(steps, g) { steps = (steps || []).filter(function (s) { return s.do !== 'gainAP'; }); if (g) steps.unshift({ do: 'gainAP', n: g }); return steps; }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function commitBuilder(asCopy) {
    var B = app.builder, c = clone(B.card);
    if (!c.name.trim()) { toast('Give the card a name before saving.'); return; }
    if (asCopy || !B.orig) { var base = slug(c.id || c.name) || 'card', id = base, n = 2; while (libById(id) && (asCopy || id !== B.orig)) id = base + '-' + (n++); c.id = id; if (asCopy) c.name = c.name + (B.card.name === c.name && libById(B.card.id) ? ' (copy)' : ''); }
    if (!c.id) { toast('The card needs an id.'); return; }
    if (c.place !== 'diag' && (!c.place || !c.place.length)) { toast('Allow at least one side to touch.'); return; }
    var p = saveCard(c); B.orig = c.id; B.card = normalizeCard(clone(c)); app.libUI.sel = c.id;
    p.then(function () { toast('Saved ' + c.name + '.'); });
  }
  function downscale(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image(); img.onload = function () {
        var max = 320, s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.72));
      }; img.onerror = function () { toast('That file could not be read as an image.'); }; img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ----- help ----- */
  function helpPage() {
    return '<div class="page scroll"><div class="pane help">' +
      '<h2>Getting around</h2><p>Use <b>New game</b> for a hot-seat game on one device, and <b>Sandbox</b> to place any card anywhere and watch scores and Overwhelm update. <b>Library</b> lists every card; <b>Card builder</b> edits one.</p>' +
      '<p>The board always fits on screen. Use the zoom buttons for a closer look. Click any card to see it full size in the right panel. While a card is selected, yellow outlines show what its rules look at (filled yellow = counted right now). Turn on <i>What sees it</i> to outline, in blue, the cards whose rules look at the selected card. The small <i>n/3</i> tag shows how many enemy-suit neighbors a card has against its Overwhelm number; it turns red one step before Overwhelm.</p>' +
      '<p><b>Hover</b> over any card to see a magnified copy with its rules text. A card with a <b>bright green border</b> has a once-per-turn ability you can use right now (and afford); select it and use the button in the right panel. The <b>Overlay</b> menu shows either every card producing ● for the current player with its output, or the current player\u2019s cards with their own ◇ value in a white box and any tokens they hold or have banked as a gold <i>+n</i> chip. Card values change as the board changes; tokens never do. Log lines are color-coded: blue plays, green claims, amber ●, gold ◇, red Ruin and Overwhelm, purple Curses, gray card movement, italic gray referee edits.</p>' +
      '<h2>A turn</h2><ol><li>Pass the device. The next player clicks <b>Start turn</b>: they gain ● from their Kingdom (3● before their Foundation is down) and draw cards (2 by default; set on the New game page). Or they take back one meeple instead, which is their whole turn.</li>' +
      '<li>Click a card in hand, then a green space. The green number is the cost there (Watchtower adds to it). Play as many cards as your ● allows.</li>' +
      '<li>Claim once per turn: the last card you placed, or an unclaimed card next to it. Your cursor turns into a meeple in your color: click an orange-outlined card to claim it. A card you claim produces its ● right away.</li>' +
      '<li>Any time during your turn: <b>Discard 2, draw 1</b>.</li><li><b>End turn</b>. If you have 48◇ or more at that moment, you win.</li></ol>' +
      '<h2>Rules the table enforces</h2><ul><li>Placement: orthogonal adjacency, placement icons (at least one allowed side touches, all others clear), Watchtower on a corner only.</li><li>Weak-to: you cannot play your archetype’s weak suit.</li><li>Foundation by turn 3; it is always yours and needs no meeple. It can never be discarded, buried from hand, or taken by another player.</li>' +
      '<li>Actions and Blessings that affect adjacent cards (Absolution, Phalanx-style effects) are placed in a space first. All others are played straight from hand with <b>Play it</b>. Either way they resolve, then are buried under a card they affected (your choice); if they affected nothing, under an adjacent card, or for cards played from hand, any card you choose. Curses tuck under their target; Sarcophagus covers it.</li>' +
      '<li>Overwhelm: 3 enemy-suit neighbors (Encampment 4; Foundations 8 counting diagonals). Enemies are the suit its archetype is weak to, plus Sword for every suit but Sword. Different enemy suits add up. Credit goes to whoever caused it.</li>' +
      '<li>Ruined and Overwhelmed cards keep their suit, lose effects and owner; meeples go home. A Foundation that is Overwhelmed eliminates its player and Ruins their cards.</li>' +
      '<li>Buried cards count toward the Kingdom of the card above them; tucked Curses count as buried.</li>' +
      '<li>Rule variants (each can be switched off on the New game page): same-suit burials raise a card’s Overwhelm number; every 2 same-suit burials give a Defense token that stops one Ruin or Curse; placing next to your own card costs 3● less; cards can’t move away from every other card; and a stack holding five different suits Ascends.</li></ul>' +
      '<h2>Assumptions made for this build</h2><ul><li>Cathedral counts Sceptre cards in your Kingdom.</li><li>Gluttony stays a Blessing (the library sheet lists it as a Curse, but it has no Curse effect).</li>' +
      '<li>Spice Caravan moves at the end of its owner’s turn, trying East first, then West; an unclaimed Caravan stays put. Acorn gains its token at the end of its owner’s turn.</li><li>Sleeping Giant moves into the space of the card that moved or was Ruined. Burying a card ends its claims.</li>' +
      '<li>Rear Guard swaps in automatically when the targeted card belongs to Rear Guard’s owner. Ballroom’s draw is automatic.</li><li>Revenge can only be revealed when a card you own is Overwhelmed, and is then discarded.</li>' +
      '<li>Confessional takes a Curse off a Cursed card on the board, or a Curse card from your hand. A refused University swap leaves one of your meeples parked on University until it leaves play.</li>' +
      '<li>A card set aside by Last Will and Testament returns to your hand at the start of your next turn, free to play that turn only.</li><li>Foundations cannot be targeted by other cards: they are never Ruined, moved, covered, Cursed, recolored, copied or picked by an effect. Only Overwhelm can take one down.</li><li>Seizure puts the other revealed cards on the bottom of the deck; Inquisition discards them.</li>' +
      '<li>Acorn gains a token on itself each of its owner’s turns; each token is worth 1◇ and 1●.</li><li>Topiary copies the target’s value, income and abilities, not its one-time effect.</li>' +
      '<li>Watchtower’s extra cost applies to the 4 spaces orthogonally next to it.</li><li>Living Death takes the card directly under the top card.</li></ul>' +
      '<h2>When something isn’t automated</h2><p>Every card on the board has <b>Referee tools</b>: Ruin or flip back, change suit, move, remove, bury a card under it, adjust tokens, and claim for any player. <b>Undo</b> steps back one action at a time. An effect can be cancelled from the prompt bar.</p>' +
      '<h2>Card builder</h2><p>Pick how a card scores, what it sees (for highlighting), which sides may touch, its Overwhelm number, what happens when it is played (a list of presets, or JSON steps), and any ongoing ability or modifier. Saved cards go to the shared library when it is available, otherwise to this browser. Games in progress keep the card set they started with.</p>' +
      '<h2>Saving</h2><p><b>Copy debug report</b> (above the board) copies the log, a text map of the board, every card\u2019s state and the full saved state, so a bug can be pasted into a message and reproduced.</p><p>The current game and sandbox are kept in this browser and survive a reload. <b>Copy current game as text</b> on the New game page gives you a save you can paste back later, which is also the format a future online version would send between players.</p>' +
      '</div></div>';
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-page],[data-act],[data-cell],[data-hand],[data-pick],[data-answer],[data-answer-p],[data-row],[data-sort]');
    if (!t) return;
    if (t.hasAttribute('data-page')) { if (t.disabled) return; app.page = t.getAttribute('data-page'); app.modal = null; render(); return; }
    if (t.hasAttribute('data-row')) { app.libUI.sel = t.getAttribute('data-row'); render(); return; }
    if (t.hasAttribute('data-sort')) { app.libUI.sort = t.getAttribute('data-sort'); render(); return; }
    var ctx = cur();
    if (t.hasAttribute('data-cell')) return cellClick(ctx, t.getAttribute('data-cell'));
    if (t.hasAttribute('data-hand')) { var u = t.getAttribute('data-hand'); if (ctx.ui.swap) { if (E.rawDef(ctx.state, u).type === 'Foundation') { ctx.err = 'You cannot discard your Foundation.'; render(); return; } var i = ctx.ui.swap.indexOf(u); if (i >= 0) ctx.ui.swap.splice(i, 1); else if (ctx.ui.swap.length < 2) ctx.ui.swap.push(u); } else { ctx.ui.hand = ctx.ui.hand === u ? null : u; ctx.ui.sel = null; } render(); return; }
    if (t.hasAttribute('data-pick')) { var pu = t.getAttribute('data-pick'), pk = ctx.ui.picked, j = pk.indexOf(pu), need = ctx.state.pending.count; if (j >= 0) pk.splice(j, 1); else if (pk.length < need) pk.push(pu); render(); return; }
    if (t.hasAttribute('data-answer')) { var av = t.getAttribute('data-answer'); dispatch(ctx, { t: 'answer', v: av === 'done' ? true : av }); return; }
    if (t.hasAttribute('data-answer-p')) { dispatch(ctx, { t: 'answer', v: +t.getAttribute('data-answer-p') }); return; }
    act(t.getAttribute('data-act'), t, ctx);
  });
  function cellClick(ctx, k) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (pd && pd.kind === 'cell' && pd.options.indexOf(k) >= 0) { dispatch(ctx, { t: 'answer', v: k }); return; }
    if (ui.mode === 'move') { if (!E.top(st, k)) { ui.mode = null; dispatch(ctx, { t: 'sbMove', from: ui.moveFrom, to: k }); ui.sel = k; } else { ui.sel = k; render(); } return; }
    if (ctx.kind === 'game') {
      if (ui.mode === 'reclaim') { ui.mode = null; if (!dispatch(ctx, { t: 'reclaim', k: k })) ui.mode = 'reclaim'; return; }
      if (!ui.hand && !pd && !st.res && !ui.swap && st.turn && st.turn.started && E.claimOptions(st, st.cur).indexOf(k) >= 0) { ui.sel = k; dispatch(ctx, { t: 'claim', k: k }); return; }
      if (ui.hand && !pd) { var L = E.legalCells(st, ui.hand); if (k in L) { var h = ui.hand; ui.sel = k; dispatch(ctx, { t: 'play', uid: h, k: k }); return; } }
      ui.sel = E.top(st, k) ? k : null; ui.hand = null; render(); return;
    }
    // sandbox
    if (ui.sbMode === 'place' && ui.sbCard && !pd) {
      if (E.top(st, k)) { ui.sel = k; render(); return; }
      var d = st.defs[ui.sbCard], owner = null;
      if (d.type === 'Foundation') st.players.forEach(function (p, i) { if (p.arch === d.archetype) owner = i; });
      ui.sel = k; dispatch(ctx, { t: 'sbPlace', id: ui.sbCard, k: k, owner: owner }); return;
    }
    if (ui.sbMode === 'bury' && ui.sbCard && E.top(st, k)) { ui.sel = k; dispatch(ctx, { t: 'sbBury', id: ui.sbCard, k: k }); return; }
    ui.sel = E.top(st, k) ? k : null; render();
  }
  function act(a, t, ctx) {
    var k = t.getAttribute('data-k');
    switch (a) {
      case 'zoomin': ctx.ui.fit = false; ctx.ui.zoom = Math.min(2.5, ctx.ui.zoom * 1.25); applyZoom(ctx); render(); return;
      case 'zoomout': ctx.ui.fit = false; ctx.ui.zoom = Math.max(0.2, ctx.ui.zoom / 1.25); applyZoom(ctx); render(); return;
      case 'fit': ctx.ui.fit = true; render(); return;
      case 'start': {
        var players = []; for (var i = 0; i < setup.n; i++) players.push({ name: setup.players[i].name.trim() || ('Player ' + (i + 1)), arch: setup.players[i].arch, color: COLORS[i] });
        var st = E.newGame(app.lib, { players: players, handSize: +setup.handSize || 4, meeples: +setup.meeples || 8, target: +setup.target || 48, enforceWeak: setup.enforceWeak, foundationBy: +setup.foundationBy, drawPerTurn: setup.drawPerTurn === '' || setup.drawPerTurn == null ? 2 : +setup.drawPerTurn, autoEnd: setup.autoEnd, seatStart: setup.seatStart, burySuitOW: setup.burySuitOW, defense: setup.defense, adjDiscount: setup.adjDiscount, noWander: setup.noWander, ascension: setup.ascension });
        app.game = newCtx(st, 'game'); lsSet('ks.game', st); app.page = 'game'; render(); return;
      }
      case 'resume': { var sv = lsGet('ks.game'); if (sv) { app.game = newCtx(sv, 'game'); app.page = 'game'; render(); } return; }
      case 'startTurn': dispatch(ctx, { t: 'startTurn' }); return;
      case 'reclaimMode': ctx.ui.mode = 'reclaim'; render(); return;
      case 'cancelMode': ctx.ui.mode = null; render(); return;
      case 'endTurn': dispatch(ctx, { t: 'endTurn' }); return;
      case 'undo': undo(ctx); return;
      case 'claim': dispatch(ctx, { t: 'claim', k: k }); return;
      case 'ability': dispatch(ctx, { t: 'ability', k: k }); return;
      case 'skip': dispatch(ctx, { t: 'answer', v: null }); return;
      case 'answerNone': dispatch(ctx, { t: 'answer', v: null }); return;
      case 'answerYes': dispatch(ctx, { t: 'answer', v: true }); return;
      case 'answerNo': dispatch(ctx, { t: 'answer', v: false }); return;
      case 'cancelEffect': dispatch(ctx, { t: 'sbCancelEffect' }); return;
      case 'answerHand': dispatch(ctx, { t: 'answer', v: ctx.ui.picked.slice() }); return;
      case 'passOK': ctx.ui.passFor = t.getAttribute('data-v'); ctx.ui.picked = []; render(); return;
      case 'closeReveal': dispatch(ctx, { t: 'closeReveal' }); return;
      case 'clearErr': ctx.err = null; render(); return;
      case 'cast': { var cu = ctx.ui.hand; ctx.ui.hand = null; if (!dispatch(ctx, { t: 'cast', uid: cu })) ctx.ui.hand = cu; return; }
      case 'holdTurn': ctx.ui.holdTurn = ctx.state.log.length; ctx.ui.autoEnding = false; clearTimeout(maybeAutoEnd.t); render(); return;
      case 'deselect': ctx.ui.hand = null; render(); return;
      case 'startSwap': ctx.ui.swap = []; ctx.ui.hand = null; render(); return;
      case 'cancelSwap': ctx.ui.swap = null; render(); return;
      case 'doSwap': { var sw = ctx.ui.swap; ctx.ui.swap = null; if (!dispatch(ctx, { t: 'swap', uids: sw })) ctx.ui.swap = sw; return; }
      case 'sbRuin': dispatch(ctx, { t: 'sbRuin', k: k, credit: ctx.kind === 'game' ? ctx.state.cur : null }); return;
      case 'sbRemove': dispatch(ctx, { t: 'sbRemove', k: k }); ctx.ui.sel = E.top(ctx.state, k) ? k : null; render(); return;
      case 'sbUnbury': dispatch(ctx, { t: 'sbUnbury', k: k }); return;
      case 'startMove': ctx.ui.mode = 'move'; ctx.ui.moveFrom = k; render(); return;
      case 'tok': dispatch(ctx, { t: 'sbTokens', k: k, d: +t.getAttribute('data-d') }); return;
      case 'sbClaim': dispatch(ctx, { t: 'sbClaim', k: k, owner: +t.getAttribute('data-i') }); return;
      case 'sbBury': { var id = ctx.ui.buryId || Object.keys(ctx.state.defs)[0]; dispatch(ctx, { t: 'sbBury', id: id, k: k }); return; }
      case 'debug': copyDebug(ctx); return;
      case 'sbCheck': dispatch(ctx, { t: 'sbCheck' }); return;
      case 'give': dispatch(ctx, { t: 'sbGive', i: ctx.state.cur, id: ctx.ui.giveId || Object.keys(ctx.state.defs)[0] }); return;
      case 'apAdj': dispatch(ctx, { t: 'sbPlayer', i: ctx.state.cur, ap: Math.max(0, ctx.state.players[ctx.state.cur].ap + +t.getAttribute('data-d')) }); return;
      case 'tokAdj': dispatch(ctx, { t: 'sbPlayer', i: ctx.state.cur, tokens: Math.max(0, ctx.state.players[ctx.state.cur].tokens + +t.getAttribute('data-d')) }); return;
      case 'sbOnTop': { var oid = ctx.ui.buryId || Object.keys(ctx.state.defs)[0]; dispatch(ctx, { t: 'sbPlace', id: oid, k: k }); return; }
      case 'ptok': { var pi = +t.getAttribute('data-i'); dispatch(ctx, { t: 'sbPlayer', i: pi, tokens: Math.max(0, ctx.state.players[pi].tokens + +t.getAttribute('data-d')) }); return; }
      case 'sbNew': app.modal = function () {
        var A = archetypes();
        return modal('Reset sandbox', '<p>Clear the board and set up sandbox players.</p><div class="row">Players <select data-sbn="1">' + [2, 3, 4, 5].map(function (n) { return '<option' + (n === sbSetup.n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
          Array.apply(null, Array(sbSetup.n)).map(function (_, i) { return '<div class="row" style="margin-top:4px"><span class="swatch" style="background:' + COLORS[i] + '"></span><select data-sbarch="' + i + '">' + A.map(function (c, j) { var cur0 = sbSetup.arch[i] || (A[i] && A[i].archetype); return '<option' + (c.archetype === cur0 ? ' selected' : '') + '>' + esc(c.archetype) + '</option>'; }).join('') + '</select></div>'; }).join(''),
          '<button class="btn" data-act="closeModal">Cancel</button><button class="btn def" data-act="sbReset">Clear and reset</button>');
      }; render(); return;
      case 'sbReset': app.modal = null; app._sbReset = true; lsDel('ks.sandbox'); newSandbox(); render(); return;
      case 'closeModal': app.modal = null; render(); return;
      case 'newCard': openBuilder(D.make({ name: 'New card', id: '', suit: 'Sceptre', type: 'Structure', cost: 6 })); return;
      case 'editCard': openBuilder(libById(t.getAttribute('data-id'))); return;
      case 'dupCard': { var src = clone(libById(t.getAttribute('data-id'))); src.name += ' (copy)'; src.id = ''; openBuilder(src); app.builder.orig = null; app.builder.card.id = slug(src.name); render(); return; }
      case 'delCard': { var did = t.getAttribute('data-id'), dc = libById(did); app.modal = function () { return modal('Delete card', '<p>Delete <b>' + esc(dc ? dc.name : did) + '</b> from the library? Games already started keep their copy.</p>', '<button class="btn" data-act="closeModal">Cancel</button><button class="btn def" data-act="delYes" data-id="' + esc(did) + '">Delete</button>'); }; render(); return; }
      case 'delYes': { var dy = t.getAttribute('data-id'); app.modal = null; deleteCard(dy); if (app.builder && app.builder.orig === dy) app.builder = null; app.libUI.sel = null; toast('Card deleted.'); return; }
      case 'saveCard': commitBuilder(false); return;
      case 'saveCopy': commitBuilder(true); return;
      case 'closeBuilder': app.builder = null; app.page = 'library'; render(); return;
      case 'clearArt': app.builder.card.art = ''; render(); return;
      case 'restoreAsk': app.modal = function () { return modal('Restore starter cards', '<p>Put the 44 starter cards back as they were transcribed. Cards you added stay. Edited starter cards are overwritten (their artwork is kept).</p>', '<button class="btn" data-act="closeModal">Cancel</button><button class="btn def" data-act="restore">Restore</button>'); }; render(); return;
      case 'restore': app.modal = null; restoreStarter(); return;
      case 'exportLib': textModal('Export library', 'Copy this text to keep a backup of the library.', JSON.stringify(app.lib), null); return;
      case 'importLib': textModal('Import library', 'Paste a library exported from this table. Cards with the same id are replaced.', '', function (txt) {
        var arr = JSON.parse(txt); if (!Array.isArray(arr)) throw new Error('Expected a list of cards.');
        (function next(i) { if (i >= arr.length) { toast('Imported ' + arr.length + ' cards.'); return; } saveCard(normalizeCard(arr[i])).then(function () { next(i + 1); }); })(0);
      }); return;
      case 'exportGame': textModal('Current game as text', 'Copy this text to save the game.', JSON.stringify(app.game.state), null); return;
      case 'importGame': textModal('Load a game', 'Paste a game saved from this table.', '', function (txt) { var s = JSON.parse(txt); if (!s.players || !s.board) throw new Error('That is not a saved game.'); app.game = newCtx(s, 'game'); lsSet('ks.game', s); app.page = 'game'; }); return;
      case 'textOK': { var ta = $('#bigtext'); try { app._textCb(ta.value); app.modal = null; render(); } catch (err) { app._textErr = err.message || String(err); render(); } return; }
    }
  }
  function debugReport(ctx) {
    var st = ctx.state, L = [], sc = E.scores(st), ks = E.keys(st);
    L.push('KARTENSPIEL DEBUG REPORT — ' + new Date().toISOString());
    L.push('Mode: ' + ctx.kind + (ctx.kind === 'game' ? ' | Round ' + st.round + ' | Current: ' + st.players[st.cur].name + ' | Turn started: ' + !!(st.turn && st.turn.started) + ' | Claim used: ' + !!(st.turn && st.turn.claimed) + ' | Last placed: ' + ((st.turn && st.turn.lastKey) || '—') : ''));
    L.push('Options: ' + JSON.stringify(st.opts) + ' | Winner: ' + (st.winner != null ? st.players[st.winner].name : '—'));
    L.push('Deck ' + st.deck.length + ' | Discard ' + st.discard.length + (st.discard.length ? ' (' + st.discard.map(function (u) { return E.rawDef(st, u).name; }).join(', ') + ')' : ''));
    L.push(''); L.push('PLAYERS');
    st.players.forEach(function (p, i) {
      L.push('- ' + p.name + ' [' + p.arch + ']' + (p.out ? ' OUT' : '') + ': ' + sc[i].total + '◇ (cards ' + sc[i].cards + ' + tokens ' + sc[i].tokens + '), ' + p.ap + '●, meeples ' + p.meeples + ', Foundation ' + (p.foundationPlaced ? 'placed' : 'in hand'));
      L.push('    hand: ' + (p.hand.map(function (u) { return E.rawDef(st, u).name; }).join(', ') || '(empty)'));
      if (sc[i].rows.length) L.push('    kingdom: ' + sc[i].rows.map(function (r) { return E.def(st, E.top(st, r.k)).name + ' @' + r.k + ' = ' + r.v + '◇'; }).join('; '));
    });
    L.push(''); L.push('BOARD (x grows east, y grows south; north is up)');
    if (!ks.length) L.push('(empty)');
    else {
      var b = E.bounds(st), W = 14, row;
      row = '      '; for (var x = b.minX; x <= b.maxX; x++) row += pad('x=' + x, W); L.push(row);
      for (var y = b.minY; y <= b.maxY; y++) {
        row = pad('y=' + y, 6);
        for (var x2 = b.minX; x2 <= b.maxX; x2++) {
          var k = x2 + ',' + y, u = E.top(st, k);
          if (!u) { row += pad('.', W); continue; }
          var c = st.cards[u], nm = E.rawDef(st, u).name.replace(/[^A-Za-z]/g, '').slice(0, 7);
          row += pad(nm + ':' + E.suitOf(st, u).slice(0, 2) + (c.ruined ? 'R' : '') + (c.claimants.length ? c.claimants.map(function (q) { return q + 1; }).join('') : '') + (st.board[k].length > 1 ? '+' + (st.board[k].length - 1) : ''), W);
        }
        L.push(row);
      }
      L.push('Key: Name:Suit, R = Ruined, digits = owning player numbers, +n = cards underneath');
      L.push('');
      ks.sort(function (a, c2) { var p = E.XY(a), q = E.XY(c2); return p[1] - q[1] || p[0] - q[0]; }).forEach(function (k) {
        var u = E.top(st, k), c = st.cards[u], d = E.def(st, u), oc = E.overwhelmCount(st, k), bits = [];
        bits.push(d.name + ' (' + d.type + ', ' + E.suitOf(st, u) + (c.suit ? ', was ' + E.rawDef(st, u).suit : '') + ')');
        if (c.ruined) bits.push(c.overwhelmed ? 'OVERWHELMED' : 'RUINED');
        bits.push('owner: ' + (c.claimants.length ? c.claimants.map(function (q) { return st.players[q].name; }).join('+') : 'none'));
        if (c.claimants.length && !c.ruined) bits.push('value ' + (E.cardValue(st, k, c.claimants[0]) + E.volcanicBonus(st, k)) + '◇');
        var inc = E.cardIncome(st, k); if (inc) bits.push('income ' + inc + '●');
        if (oc && !c.ruined) bits.push('enemies ' + oc.n + '/' + oc.th);
        if (c.tokens) bits.push('tokens ' + c.tokens);
        if (c.copyOf) bits.push('copying ' + c.copyOf);
        if (E.isCovered(st, k)) bits.push('COVERING a card'); else if (E.isCursed(st, k)) bits.push('CURSED');
        if (st.board[k].length > 1) bits.push('under: ' + st.board[k].slice(1).map(function (x) { return E.rawDef(st, x).name; }).join(', '));
        L.push(k + '  ' + bits.join(' | '));
      });
    }
    if (st.res || st.pending) { L.push(''); L.push('IN PROGRESS'); if (st.res) L.push('effect: ' + JSON.stringify({ card: E.rawDef(st, st.res.src).name, at: st.res.srcKey, step: st.res.i, steps: st.res.steps, phase: st.res.phase })); if (st.pending) L.push('waiting for: ' + JSON.stringify(st.pending)); }
    if (ctx.err) L.push('Last error: ' + ctx.err);
    L.push(''); L.push('LOG'); st.log.forEach(function (l) { L.push(l); });
    L.push(''); L.push('STATE JSON (paste into New game > Load a game from text to reproduce)'); L.push(JSON.stringify(st));
    return L.join('\n');
    function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + ' ' : s + new Array(n - s.length + 1).join(' '); }
  }
  function copyText(txt, cb) {
    function fallback() { var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); cb(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { cb(true); }, fallback); else fallback();
  }
  function copyDebug(ctx) {
    var txt = debugReport(ctx);
    copyText(txt, function (ok) { if (ok) toast('Debug report copied: log, board and full state (' + txt.split('\n').length + ' lines).'); else textModal('Debug report', 'Copying was blocked here. The text is selected: press Ctrl+C (or Cmd+C) to copy it.', txt, null); });
  }
  function textModal(title, msg, text, cb) {
    app._textCb = cb; app._textErr = null;
    app.modal = function () { return modal(title, '<p>' + esc(msg) + '</p><textarea id="bigtext" rows="10" style="width:min(640px,80vw)"' + (cb ? '' : ' readonly') + '>' + esc(text) + '</textarea>' + (app._textErr ? '<div class="err">' + esc(app._textErr) + '</div>' : ''), '<button class="btn" data-act="closeModal">' + (cb ? 'Cancel' : 'Close') + '</button>' + (cb ? '<button class="btn def" data-act="textOK">Load</button>' : '')); };
    render(); var ta = $('#bigtext'); if (ta && !cb) ta.select();
  }

  document.addEventListener('change', function (e) {
    var t = e.target, ctx = cur();
    if (t.hasAttribute('data-tog')) { ctx.ui[t.getAttribute('data-tog')] = t.checked; render(); return; }
    if (t.hasAttribute('data-sel')) {
      var w = t.getAttribute('data-sel');
      if (w === 'sbSuit') dispatch(ctx, { t: 'sbSuit', k: t.getAttribute('data-k'), suit: t.value, check: ctx.kind === 'game' });
      else if (w === 'buryId') { ctx.ui.buryId = t.value; }
      else if (w === 'giveId') { ctx.ui.giveId = t.value; }
      else if (w === 'overlay') { ctx.ui.overlay = t.value; render(); }
      else if (w === 'vpFor') { ctx.ui.vpFor = +t.value; render(); }
      else if (w === 'sbCard') { ctx.ui.sbCard = t.value; render(); }
      return;
    }
    if (t.hasAttribute('data-sbmode')) { ctx.ui.sbMode = t.getAttribute('data-sbmode'); render(); return; }
    if (t.hasAttribute('data-sbn')) { sbSetup.n = +t.value; render(); return; }
    if (t.hasAttribute('data-sbarch')) { sbSetup.arch[+t.getAttribute('data-sbarch')] = t.value; return; }
    if (t.hasAttribute('data-set')) { var f = t.getAttribute('data-set'); setup[f] = t.type === 'checkbox' ? t.checked : (f === 'n' ? +t.value : t.value); render(); return; }
    if (t.hasAttribute('data-parch')) { setup.players[+t.getAttribute('data-parch')].arch = t.value; render(); return; }
    if (t.hasAttribute('data-lib')) { app.libUI[t.getAttribute('data-lib')] = t.value; render(); return; }
    if (t.hasAttribute('data-b')) { if (builderChange(t.getAttribute('data-b'), t.value) || t.tagName === 'SELECT') render(); else render(); return; }
    if (t.hasAttribute('data-bc')) { builderChange(t.getAttribute('data-bc'), t.checked); render(); return; }
    if (t.hasAttribute('data-place')) {
      var c = app.builder.card, s = t.getAttribute('data-place');
      if (s === 'diag') c.place = t.checked ? 'diag' : ['N', 'E', 'S', 'W'];
      else { var pl = c.place === 'diag' ? [] : c.place.slice(); var ix = pl.indexOf(s); if (t.checked && ix < 0) pl.push(s); if (!t.checked && ix >= 0) pl.splice(ix, 1); c.place = ['N', 'E', 'S', 'W'].filter(function (q) { return pl.indexOf(q) >= 0; }); }
      render(); return;
    }
    if (t.hasAttribute('data-art') && t.files && t.files[0]) { downscale(t.files[0], function (url) { app.builder.card.art = url; render(); }); return; }
    if (t.hasAttribute('data-json')) {
      try { var steps = JSON.parse(t.value); if (!Array.isArray(steps)) throw new Error('Steps must be a list.'); app.builder.card.onPlay = steps; app.builder.jsonErr = null; app.builder.json = t.value; }
      catch (err) { app.builder.jsonErr = 'Not valid: ' + err.message; app.builder.json = t.value; }
      render(); return;
    }
  });
  document.addEventListener('toggle', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-keep')) app.open[t.getAttribute('data-keep')] = t.open; }, true);
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-pname')) { setup.players[+t.getAttribute('data-pname')].name = t.value; return; }
    if (t.hasAttribute('data-lib') && t.tagName === 'INPUT') { app.libUI.q = t.value; render(); return; }
    if (t.hasAttribute('data-b') && (t.tagName === 'TEXTAREA' || t.type === 'text')) { builderChange(t.getAttribute('data-b'), t.value); var pv = document.querySelector('.split > .raised.pane:last-child'); if (pv) pv.innerHTML = '<div class="panelhead">Preview</div>' + defFace(app.builder.card, { big: true }); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var ctx = cur(); if (app.modal) { app.modal = null; render(); return; } if (ctx) { ctx.ui.hand = null; ctx.ui.mode = null; ctx.ui.swap = null; render(); } }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && (app.page === 'game' || app.page === 'sandbox') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(cur()); }
  });
  window.addEventListener('resize', function () { var c = cur(); if (c && c.ui.fit) applyZoom(c); });

  /* ---------------- hover magnifier ---------------- */
  var hov = document.createElement('div'); hov.className = 'hovercard'; hov.setAttribute('aria-hidden', 'true'); document.body.appendChild(hov);
  var hovKey = null;
  function hoverHTML(t) {
    var ctx = cur();
    if (t.hasAttribute('data-cell') && ctx) {
      var st = ctx.state, k = t.getAttribute('data-cell'), u = E.top(st, k); if (!u) return null;
      var c = st.cards[u], d = E.def(st, u), val = c.claimants.length && !c.ruined ? E.cardValue(st, k, c.claimants[0]) + E.volcanicBonus(st, k) : null;
      var lines = [];
      if (c.ruined) lines.push(c.overwhelmed ? 'Overwhelmed (treated as Ruined)' : 'Ruined');
      lines.push('Owner: ' + (c.claimants.length ? c.claimants.map(function (p) { return st.players[p].name; }).join(', ') : 'unclaimed'));
      var oc = E.overwhelmCount(st, k); if (oc && !c.ruined) lines.push('Enemy neighbors ' + oc.n + ' of ' + oc.th);
      if (E.isCursed(st, k)) lines.push(E.isCovered(st, k) ? 'Covering a card' : 'Cursed');
      if (st.board[k].length > 1) lines.push('Underneath: ' + st.board[k].slice(1).map(function (x) { return E.rawDef(st, x).name; }).join(', '));
      if (c.banked) Object.keys(c.banked).forEach(function (p) { if (c.banked[p]) lines.push('Banked ' + c.banked[p] + '◇ for ' + st.players[p].name); });
      return 'k:' + k + ':' + u + ':' + JSON.stringify(c) + ':' + st.log.length + '|' + defFace(Object.assign({}, d, { suit: E.suitOf(st, u), art: artOf(c.def) }), { big: true, value: val }) + '<div class="hovinfo">' + lines.map(esc).join('<br>') + '</div>';
    }
    var id = null, stt = ctx && ctx.state;
    if (t.hasAttribute('data-hand')) { if (!stt) return null; id = stt.cards[t.getAttribute('data-hand')] && stt.cards[t.getAttribute('data-hand')].def; }
    else if (t.hasAttribute('data-pick')) { if (!stt) return null; id = stt.cards[t.getAttribute('data-pick')] && stt.cards[t.getAttribute('data-pick')].def; }
    else if (t.hasAttribute('data-row')) { var lc = libById(t.getAttribute('data-row')); return lc ? 'r:' + lc.id + '|' + defFace(lc, { big: true }) : null; }
    if (!id) return null;
    var dd = (stt && stt.defs[id]) || libById(id); if (!dd) return null;
    return 'h:' + id + '|' + defFace(Object.assign({}, dd, { art: artOf(id) }), { big: true });
  }
  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest && e.target.closest('[data-cell],[data-hand],[data-pick],[data-row]');
    var html = t ? hoverHTML(t) : null;
    if (!html) { hov.style.display = 'none'; hovKey = null; return; }
    var i = html.indexOf('|'), key = html.slice(0, i);
    if (key !== hovKey) { hov.innerHTML = html.slice(i + 1); hovKey = key; }
    hov.style.display = 'block';
    var w = hov.offsetWidth, hh = hov.offsetHeight, x = e.clientX + 18, y = e.clientY + 18;
    if (x + w > window.innerWidth - 6) x = e.clientX - w - 18;
    if (y + hh > window.innerHeight - 6) y = Math.max(6, window.innerHeight - hh - 6);
    hov.style.left = Math.max(6, x) + 'px'; hov.style.top = y + 'px';
  });
  document.addEventListener('mouseleave', function () { hov.style.display = 'none'; hovKey = null; });
  document.addEventListener('mousedown', function () { hovKey = null; });

  /* ---------------- boot ---------------- */
  initLibrary();
  var sv = lsGet('ks.game'); if (sv && sv.players && sv.winner == null) { /* offered on New game page */ }
  render();
})();
