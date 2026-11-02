/* Kartenspiel playtest UI. All game logic lives in KEngine; this file only renders state and dispatches actions. */
(function () {
  var E = KEngine, D = KData;
  // The same UI builds two apps: the playtest table (default) and the public site (KConfig.edition === 'online'),
  // which adds online play, a home page and profiles, and drops the card builder, sandbox and library editing.
  var ONLINE = typeof KConfig !== 'undefined' && KConfig.edition === 'online';
  // Player colors by seat, and the board cell size in pixels.
  var COLORS = ['#d42020', '#1f4fd1', '#138a36', '#d39a00', '#8a2be2'];
  var CW = 104, CH = 104, GAP = 10;   // board cells are square; hand cards stay 88 × 118
  // Small helpers: querySelector, HTML escaping, and localStorage calls that never throw.
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  // Player preferences, kept in this browser: hints (on), confirmEnd (ask before ending a turn with moves left; on),
  // botSpeed ('normal'), handSort ('drawn').
  var prefs = lsGet('ks.prefs') || {};
  function setPref(k, v) { prefs[k] = v; lsSet('ks.prefs', prefs); }
  // "Tap" on touch screens, "Click" with a mouse, in the prompts that say what to do.
  function verb() { return (typeof lastPointer !== 'undefined' && lastPointer === 'touch') || (window.matchMedia && matchMedia('(pointer: coarse)').matches && lastPointer !== 'mouse') ? 'Tap' : 'Click'; }

  // Shared with Dithry (src/cardface.js): suit icons, placement and score text, card faces, textures.
  var KF = KFace, ICON = KF.ICON, icon = KF.icon, placeIcon = KF.placeIcon, scoreText = KF.scoreText, artStyle = KF.artStyle, rng = KF.rng, BAYER4 = KF.BAYER4;
  // Custom cursors drawn as inline SVG: a meeple (claiming), a suit icon (burying), a pixel sword (aiming a Ruin).
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
  // Pixel-art Defense token shields shown on a card.
  function shieldStack(n) {
    var show = Math.min(n, 4), w = 10 + (show - 1) * 3, h = 12 + (show - 1) * 2, s = '';
    for (var i = show - 1; i >= 0; i--) s += '<g transform="translate(' + (i * 3) + ',' + ((show - 1 - i) * 2) + ')">' + shieldPixels() + '</g>';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.round(w * 1.7) + '" height="' + Math.round(h * 1.7) + '" shape-rendering="crispEdges" aria-hidden="true">' + s + '</svg>';
  }
  function shieldPixels() { return '<rect x="1" y="0" width="8" height="1" fill="#000"/><rect x="0" y="1" width="1" height="6" fill="#000"/><rect x="9" y="1" width="1" height="6" fill="#000"/><rect x="1" y="1" width="8" height="6" fill="#4a7bd6"/><rect x="1" y="7" width="1" height="2" fill="#000"/><rect x="8" y="7" width="1" height="2" fill="#000"/><rect x="2" y="7" width="6" height="2" fill="#4a7bd6"/><rect x="2" y="9" width="2" height="1" fill="#000"/><rect x="6" y="9" width="2" height="1" fill="#000"/><rect x="4" y="10" width="2" height="1" fill="#000"/><rect x="4" y="9" width="2" height="1" fill="#4a7bd6"/><rect x="2" y="2" width="2" height="2" fill="#bcd2ff"/><rect x="4" y="3" width="2" height="4" fill="#f2c94c"/><rect x="3" y="4" width="4" height="1" fill="#f2c94c"/>'; }
  function shieldIcon() { return '<svg viewBox="0 0 10 12" width="9" height="11" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="8" height="1" fill="#000"/><rect x="0" y="1" width="1" height="6" fill="#000"/><rect x="9" y="1" width="1" height="6" fill="#000"/><rect x="1" y="1" width="8" height="6" fill="#4a7bd6"/><rect x="1" y="7" width="1" height="2" fill="#000"/><rect x="8" y="7" width="1" height="2" fill="#000"/><rect x="2" y="7" width="6" height="2" fill="#4a7bd6"/><rect x="2" y="9" width="2" height="1" fill="#000"/><rect x="6" y="9" width="2" height="1" fill="#000"/><rect x="4" y="10" width="2" height="1" fill="#000"/><rect x="4" y="9" width="2" height="1" fill="#4a7bd6"/><rect x="2" y="2" width="2" height="2" fill="#bcd2ff"/></svg>'; }
  // Inline suit icon.
  /* ----- pixel art for the light medieval touches: drawn from text, one character per pixel ----- */
  // rows: equal-length strings; pal: character → colour ('.' is transparent); px: CSS pixels per pixel.
  function pix(rows, pal, px, cls, label) {
    var w = rows[0].length, h = rows.length, r = '';
    rows.forEach(function (row, y) { for (var x = 0; x < w; x++) { var c = pal[row[x]]; if (c) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + c + '"/>'; } });
    return '<svg class="pix ' + (cls || '') + '" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' + r + '</svg>';
  }
  var ART_PAL = { k: '#2a1600', y: '#f2c230', Y: '#fff2a8', o: '#b07a10', r: '#b01818', b: '#1c3fa0', w: '#8a5a20', g: '#cfe6ee', s: '#e8b838', W: '#ffffff' };
  // the title-bar crest: a shield, per pale gules and azure, edged in gold
  var CREST = ['kkkkkkkkkkk', 'kyyyyyyyyyk', 'kyrrrrbbbyk', 'kyrrrrbbbyk', 'kyrrrrbbbyk', 'kyrrrrbbbyk', 'kyrrrrbbbyk', 'kyrrrrbbbyk', '.kyrrrbbyk.', '..kyrrbyk..', '...kyyyk...', '....kkk....'];
  // the "Next turn" message-box icon: an hourglass, sand running down
  var HOURGLASS = ['kkkkkkkkkk', 'kwwwwwwwwk', 'kkkkkkkkkk', '.kgggggggk', '.kgssssgk.', '..kgssgk..', '...kgsk...', '....ks....', '...kgsk...', '..kggsgk..', '.kggsssgk.', '.ksssssssk', 'kkkkkkkkkk', 'kwwwwwwwwk', 'kkkkkkkkkk'];
  // the winner's crown
  var CROWN = ['.k....k....k.', 'kYk..kYk..kYk', 'kyyk.kyk.kyyk', 'kyyykyyykyyyk', 'kyyyyyyyyyyyk', 'kyryyybyyyryk', 'kyyyyyyyyyyyk', 'kkkkkkkkkkkkk'];
  // a divider: a gold lozenge between two fine rules
  var FLEURON = (function () {
    var w = 61, m = 30, rows = [];
    for (var y = 0; y < 7; y++) { var row = ''; for (var x = 0; x < w; x++) { var d = Math.abs(x - m) + Math.abs(y - 3);
      row += d <= 3 ? (d === 3 ? 'k' : d === 0 ? 'Y' : 'y') : (y === 3 && Math.abs(x - m) > 5 && Math.abs(x - m) < 29 ? 'o' : (y === 3 && (Math.abs(x - m) === 5) ? 'y' : '.')); } rows.push(row); }
    return rows;
  })();
  function crest() { return pix(CREST, ART_PAL, 1, 'crest'); }
  function fleuron() { return '<div class="fleuron">' + pix(FLEURON, ART_PAL, 2) + '</div>'; }
  // the Fraktur logo (assets/logo.png, drawn by tools/art.js and inlined by build.sh as --logo)
  function logoHTML(cls) { return '<h1 class="logo ' + (cls || '') + '"><span class="sr">Kartenspiel</span></h1>'; }

  /* ---------------- app state ---------------- */
  // Everything the UI keeps between renders. `game` and `sandbox` are contexts (see newCtx).
  var app = {
    page: ONLINE ? 'home' : 'new', lib: [], libSource: 'built-in', db: null, dbEmpty: false, libReady: false,
    open: {}, game: null, sandbox: null, libUI: { q: '', suit: '', type: '', sort: 'suit', sel: null }, builder: null, toast: null
  };
  function libById(id) { for (var i = 0; i < app.lib.length; i++) if (app.lib[i].id === id) return app.lib[i]; return null; }
  // Library order: by suit, Foundations first, then cost, then name.
  function sortLib(a) {
    var so = D.SUITS; return a.slice().sort(function (x, y) {
      return so.indexOf(x.suit) - so.indexOf(y.suit) || (x.type === 'Foundation' ? -1 : 0) - (y.type === 'Foundation' ? -1 : 0) || (+x.cost) - (+y.cost) || x.name.localeCompare(y.name);
    });
  }
  // Fill in any fields missing from a stored card.
  function normalizeCard(c) { var d = D.make({}); for (var k in c) d[k] = c[k]; return d; }

  /* ---------------- library persistence ---------------- */
  // Load the card library: the copy cached in this browser, else the built-in starter cards.
  // Where a shared card database is available (window.claude), stay synced with it live.
  function initLibrary() {
    if (ONLINE) { app.lib = sortLib(D.STARTER.map(normalizeCard)); return; }   // the public site's library is fixed
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
  // Save to this browser and, if connected, to the shared library (filling it with every card if it was empty).
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
  // Put the built-in starter cards back, keeping any artwork already added.
  function restoreStarter() {
    var ps = D.STARTER.map(function (c) { var keep = libById(c.id); var n = clone(c); if (keep && keep.art) n.art = keep.art; return n; });
    (function next(i) { if (i >= ps.length) { toast('Starter cards restored.'); render(); return; } saveCard(ps[i]).then(function () { next(i + 1); }); })(0);
  }
  // Show a message in the status bar for 4 seconds.
  function toast(m) { app.toast = m; render(); clearTimeout(toast.t); toast.t = setTimeout(function () { app.toast = null; render(); }, 4000); }

  /* ---------------- contexts (game / sandbox) ---------------- */
  // A context pairs a game state with its undo history and view settings. The game and the sandbox each have one.
  function newCtx(state, kind) {
    return { kind: kind, state: state, hist: [], ui: { sel: null, hand: null, swap: null, mode: null, moveFrom: null, zoom: 1, fit: true, showOW: true, showSeen: true, showSeenBy: false, coords: false, picked: [], passOK: false, sbCard: '', sbMode: 'place', autoCheck: true, revealOK: false } };
  }
  // Send an action to the engine. On success: keep the old state for undo, autosave, animate, re-render.
  // On error: show the message and keep the old state.
  function dispatch(ctx, a) {
    if (ctx.ui) ctx.ui.endAsked = false;
    if (ctx.online) { ctx.err = null; KNet.send({ t: 'act', a: a }); uiAfter(ctx, a); render(); return true; }   // the server answers with a new state
    var r = E.apply(ctx.state, a);
    if (r.error) { ctx.err = r.error; render(); return false; }
    ctx.err = null; ctx.hist.push(ctx.state); if (ctx.hist.length > 80) ctx.hist.shift();
    ctx.state = r;
    if (ctx.kind === 'sandbox' && ctx.ui.autoCheck && /^sb(Place|Suit|Move|Remove|Bury|Unbury)$/.test(a.t)) { var r2 = E.apply(ctx.state, { t: 'sbCheck', quiet: true }); if (!r2.error) ctx.state = r2; }
    uiAfter(ctx, a);
    lsSet(ctx.kind === 'game' ? 'ks.game' : 'ks.sandbox', ctx.state);
    var fx = FX.diff(ctx, ctx.hist[ctx.hist.length - 1], ctx.state, a);
    render(); FX.run(fx); maybeAutoEnd(ctx); return true;
  }
  // Clear selections that an action has used up.
  function uiAfter(ctx, a) {
    if (a.t === 'play' || a.t === 'cast' || a.t === 'answer' || a.t === 'endTurn' || a.t === 'reclaim') { ctx.ui.hand = null; ctx.ui.picked = []; }
    if (a.t === 'endTurn' || a.t === 'reclaim') { ctx.ui.passOK = false; ctx.ui.mode = null; ctx.ui.sel = null; ctx.ui.swap = null; }
  }
  // Bots: a player whose state carries `bot` (a KBots style) is played by the computer (see "bots" below).
  function isBot(st, p) { return !!(st.players[p] && st.players[p].bot); }
  var BOT_SPEED = { slow: 1300, normal: 650, fast: 220, instant: 0 };   // pause between a bot's moves, ms
  function hasBots(st) { return st.players.some(function (q) { return q.bot; }); }
  // A seat the screen always shows: yours online, or the only human's in a game against bots. null = pass the device.
  function fixedSeat(ctx) {
    if (ctx.online) return ctx.me;
    if (ctx.kind !== 'game') return null;
    var humans = ctx.state.players.map(function (q, i) { return q.bot ? -1 : i; }).filter(function (i) { return i >= 0; });
    return humans.length === 1 ? humans[0] : null;
  }
  // Whose eyes the game is drawn through: the fixed seat if there is one, otherwise whoever's turn it is.
  function viewer(ctx) { var f = fixedSeat(ctx); return f != null ? f : ctx.state.cur; }
  // Can the people at this screen act now? Not online on someone else's turn, and never on a bot's turn.
  function myTurn(ctx) { var f = fixedSeat(ctx); return f != null ? ctx.state.cur === f : !isBot(ctx.state, ctx.state.cur); }
  // Can the people at this screen answer prompt pd? (Bots answer their own.)
  function canAnswer(ctx, pd) { return ctx.kind === 'sandbox' || (ctx.online ? pd.player === ctx.me : !isBot(ctx.state, pd.player)); }
  /* ---- auto end turn when out of ● with nothing free to do ---- */
  function canAfford(st, u) {
    var d = E.rawDef(st, u); if (E.playBlock(st, st.cur, u)) return false;
    var ap = E.funds(st.players[st.cur]);
    if (!E.needsPlacement(d)) return (E.isFree(st, u) ? 0 : +d.cost || 0) <= ap;
    var L = E.legalCells(st, u); return Object.keys(L).some(function (k) { return L[k] <= ap; });
  }
  // True when the current player has no ● and nothing free left to do.
  function stuck(st) {
    if (!st.turn || !st.turn.started || st.pending || st.res || st.winner != null || st.reveal) return false;
    var pl = st.players[st.cur]; if (E.funds(pl) > 0) return false;
    if (E.claimOptions(st, st.cur).length) return false;
    if (pl.hand.some(function (u) { return canAfford(st, u); })) return false;
    if (E.keys(st).some(function (k) { return E.abilityReady(st, k); })) return false;
    if (!pl.foundationPlaced) return false;
    return true;
  }
  // If stuck, end the turn after a short pause (the player can stop it with "Wait, I'm not done").
  function maybeAutoEnd(ctx) {
    clearTimeout(maybeAutoEnd.t);
    if (ctx.kind !== 'game' || !myTurn(ctx) || ctx.state.opts.autoEnd === false || !stuck(ctx.state) || ctx.ui.holdTurn === ctx.state.log.length) { ctx.ui.autoEnding = false; return; }
    ctx.ui.autoEnding = true; render();
    var mark = ctx.state.log.length;
    maybeAutoEnd.t = setTimeout(function () { if (ctx.ui.autoEnding && ctx.state.log.length === mark && stuck(ctx.state)) { ctx.ui.autoEnding = false; dispatch(ctx, { t: 'endTurn' }); } }, 1600);
  }
  // Go back to the previous state in the history.
  function undo(ctx) { if (ctx.online || !ctx.hist.length) return; ctx.state = ctx.hist.pop();
    if (hasBots(ctx.state)) { while (ctx.hist.length && botToAct(ctx.state) != null) ctx.state = ctx.hist.pop(); clearTimeout(ctx.botTimer); ctx.botTimer = null; ctx.botQueue = null; } ctx.err = null; ctx.ui.hand = null; ctx.ui.picked = []; lsSet(ctx.kind === 'game' ? 'ks.game' : 'ks.sandbox', ctx.state); render(); }
  // The context for the page on screen.
  function cur() { return app.page === 'sandbox' ? app.sandbox : app.page === 'online' ? (N.room && N.room.status !== 'lobby' ? N.ctx : null) : app.page === 'game' ? app.game : null; }

  /* ---------------- effects: crumble, ◇ and ● flying to their piles ---------------- */
  var FX = (function () {
    var layer = document.createElement('div'); layer.className = 'fxlayer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
    // With reduced motion on, skip the flying and crumbling; the text popups stay.
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function topUid(st, k) { return E.top(st, k); }
    function valuesByUid(st) {
      var m = {}; st.players.forEach(function (p, i) { E.kingdom(st, i).forEach(function (k) { var u = E.top(st, k), q = E.valueParts(st, k, i); m[u + ':' + i] = { k: k, v: q.base + q.tokens, p: i }; }); }); return m;
    }
    // Compare the states before and after an action and list the animations to play.
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
    // Animation pieces: floating text, gems and marbles flying to the score piles, crumbling cards, the Curse flare.
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
    // Play the listed animations, slightly staggered.
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
  // The board's backdrop, in the same two-tone dither: a windswept prairie at night under a crescent moon, a walled
  // city on the horizon, and a river winding toward you. Drawn at the board's size (one pixel = 2 CSS pixels),
  // grey in light mode and dark grey in dark mode, and redrawn only when that size or the theme changes.
  var SCENE = {}, SCENE_TONES = { light: ['#c9c9c9', '#b9b9b9'], dark: ['#262a2a', '#1c1f1f'] };
  function isDark() { var t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)); }
  function sceneTex(W, H, dark) {
    var key = W + 'x' + H + (dark ? 'd' : 'l'); if (SCENE[key]) return SCENE[key];
    var R = rng('prairie'), hz = Math.round(H * .4), cx = W * (.38 + R() * .24), toneA = SCENE_TONES[dark ? 'dark' : 'light'];
    var sky = new Float32Array(W * H), solid = new Uint8Array(W * H);   // darkness 0..1, and 1 = drawn solid (city), 2 = drawn light (stars, moon)
    function rect(x0, y0, x1, y1) { for (var y = Math.max(0, y0); y < Math.min(H, y1); y++) for (var x = Math.max(0, x0); x < Math.min(W, x1); x++) solid[y * W + x] = 1; }
    // the walled city: curtain walls between towers with pointed roofs, a gatehouse, a keep and a church spire
    var wh = Math.max(5, Math.round(H * .022)), cw = Math.max(56, Math.round(W * .22)), cl = Math.round(cx - cw / 2);
    function crenels(x0, x1, top) { for (var x = x0; x < x1; x += 3) rect(x, top - 1, x + 2, top); }
    function roof(x0, w, top, h) { for (var r = 0; r < h; r++) { var inset = Math.round(r * (w / 2) / h); rect(x0 + inset, top - r - 1, x0 + w - inset, top - r); } }
    rect(cl, hz - wh, cl + cw, hz + 1); crenels(cl, cl + cw, hz - wh);                                           // the curtain wall
    var nT = 5; for (var i = 0; i < nT; i++) {                                                                      // towers along it
      var tx = Math.round(cl + i * (cw - 6) / (nT - 1)), th = wh + 5 + Math.round(R() * 3);
      rect(tx, hz - th, tx + 6, hz); if (R() < .6) roof(tx - 1, 8, hz - th, 5); else crenels(tx, tx + 6, hz - th); }
    var gx = Math.round(cl + cw * .3), gh = wh + 4; rect(gx, hz - gh, gx + 10, hz); crenels(gx, gx + 10, hz - gh); // the gatehouse
    var kx = Math.round(cl + cw * (.55 + R() * .1)), kh = wh * 3; rect(kx, hz - kh, kx + 12, hz); crenels(kx, kx + 12, hz - kh);   // the keep
    rect(kx + 4, hz - kh - 4, kx + 8, hz - kh); roof(kx + 3, 6, hz - kh - 4, 4);                                    // its turret
    var sx = Math.round(cl + cw * .82); rect(sx, hz - wh * 2, sx + 4, hz); roof(sx - 1, 6, hz - wh * 2, 9); rect(sx + 1, hz - wh * 2 - 11, sx + 3, hz - wh * 2 - 9);   // a church spire
    var rx = Math.round(cl - 16 - R() * 10); rect(rx, hz - 7, rx + 3, hz); roof(rx - 1, 5, hz - 7, 3);              // a lone watchtower out on the plain
    // the moon: a crescent, high up on the side away from the city
    var mx = cx < W / 2 ? W * .78 : W * .22, my = H * .12, mr = Math.max(6, H * .035);
    for (var y = 0; y < hz; y++) for (var x = 0; x < W; x++) {
      var u = x / W, v = y / hz, k = y * W + x;
      var f = .78 - .55 * v * v + .07 * Math.sin(x * .045 + y * .5 + Math.sin(x * .013) * 3) * (1 - v);        // night sky, glowing at the horizon, wisps of cloud
      if (Math.hypot(x - mx, y - my) < mr && Math.hypot(x - mx - mr * .45, y - my + mr * .2) > mr * .85) solid[k] = 2;
      sky[k] = f;
      if (!solid[k] && v < .7 && R() < .004) solid[k] = 2;                                                       // stars
    }
    // the ground: darker toward you; the river narrows and winds into the distance toward the city gate
    for (var y = hz; y < H; y++) { var t = (y - hz) / (H - hz), wobble = Math.sin(1.6 / (t + .06) + 1.3) * W * .2 * t + Math.sin(.5 / (t + .03)) * W * .02;
      var rc = cx + wobble, rw = 1 + W * .11 * Math.pow(t, 1.4);
      for (var x = 0; x < W; x++) { var k = y * W + x;
        if (Math.abs(x - rc) < rw) { sky[k] = .12 + .2 * t + (Math.sin(y * 1.7 + x * .2) > .6 ? .35 : 0); continue; }   // water: lit by the sky, with ripples
        sky[k] = .42 + .45 * t + .12 * Math.sin(x * .07 + Math.sin(y * .3) * 2) * t; } }
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    var A = toneA.map(function (c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; });
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var k = y * W + x, on;
      if (solid[k]) on = solid[k] === 1;
      else if (y < hz) on = sky[k] > (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16;
      else { var q = (y - x * .28 + 2.5 * Math.sin(x * .06 + y * .02)) / 4, tri = Math.abs(2 * (q - Math.floor(q)) - 1);   // grass bent by the wind
        on = sky[k] > tri * .6 + (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16 * .4; }
      var c = A[on ? 1 : 0], i = k * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (SCENE[key] = 'url(' + cv.toDataURL() + ')');
  }
  function paintScene(wrap) {
    var W = Math.ceil(wrap.clientWidth / 2), H = Math.ceil(wrap.clientHeight / 2); if (W < 8 || H < 8) return;
    var key = W + 'x' + H + (isDark() ? 'd' : 'l'); if (wrap.getAttribute('data-scene') === key) return;
    wrap.setAttribute('data-scene', key); wrap.style.backgroundImage = sceneTex(W, H, isDark()); wrap.style.backgroundSize = W * 2 + 'px ' + H * 2 + 'px';
  }


  // Painted faces (from Dithry), by card id; refreshed when Dithry saves in another tab.
  var FACES = KF.faces(), TEX = {};
  window.addEventListener('storage', function (e) { if (e.key === 'ks.faces') { FACES = KF.faces(); TEX = {}; render(); } });
  // The card's background: its painted face if it has one, else its suit texture (seeded by seed; in hand and on the
  // board, each card instance's id, so no two look alike).
  function cardTex(suit, seed, w, h) {
    var key = suit + '|' + seed + '|' + w + 'x' + h; if (TEX[key] !== undefined) return TEX[key];
    if (typeof document === 'undefined') return (TEX[key] = '');
    var gw = w >> 1, gh = h >> 1, cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
    var g = cv.getContext('2d'), img = g.createImageData(gw, gh); img.data.set(KF.texPixels(suit, seed, gw, gh)); g.putImageData(img, 0, 0);
    return (TEX[key] = KF.picCSS(cv.toDataURL()));
  }
  function handStyle(d, seed, big) { var f = FACES[d.id]; return f && f.hand ? KF.picCSS(f.hand, big ? 'cover' : null) : seed ? cardTex(d.suit, seed, 150, 206) : ''; }   // the desktop hand card's size, so its pixels are square there
  // face for a card definition (hand, library, builder); opts: {big, mid, value, cost, tex (a seed for the texture)}
  function inkOf(id) { var f = FACES[id]; return f && f.hand && f.text === 'light' ? 'light' : ''; }   // light text over a dark painting
  function defFace(d, o) { o = o || {}; return KF.handFace(d, Object.assign({}, o, { art: d.art || artOf(d.id), style: handStyle(d, o.tex, o.big), ink: inkOf(d.id) })); }
  // face for a card on the board
  function boardFace(st, k, ctx) {
    var u = E.top(st, k), c = st.cards[u], d = E.def(st, u), suit = E.suitOf(st, u), stack = st.board[k];
    var ruined = c.ruined, covered = E.isCovered(st, k);
    var noOW = c.ascended || !!(E.rawDef(st, u).mods || {}).immune;
    var h = '<div class="card s-' + esc(suit) + (ruined ? ' ruined' : '') + (!ruined && !c.ascended && inkOf(c.def) ? ' lighttext' : '') + '' + (E.rawDef(st, u).type === 'Foundation' ? ' found' : '') + (c.ascended && !ruined ? ' ascended' : '') + (E.isCursed(st, k) && !ruined ? ' cursed' : '') + '"' + (ruined || c.ascended ? '' : ' style="' + (FACES[c.def] && FACES[c.def].board ? KF.picCSS(FACES[c.def].board) : cardTex(suit, u, CW, CH)) + '"') + '>';
    h += '<div class="top"><span>' + esc(d.cost) + '●</span>' + icon(suit) + '</div>';
    var art = artOf(c.def); if (art && !ruined) h += '<div class="art" style="' + artStyle(art) + '"></div>';
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

  /* ---------------- Overwhelm pressure ---------------- */
  // Shows where the pressure on a card comes from: a chevron in the gutter on each side held by an enemy-suit card
  // (the cards Overwhelm counts), pointing at the pressured card, in the colour of the suit doing the pressing.
  // Foundations also count diagonals: smaller chevrons where the gutters cross. Two cards that pressure each
  // other get one chevron each way, side by side. One step from Overwhelm, a card's chevrons grow and go solid.
  var DIRS8 = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1] };
  var OPP = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
  var SUITCOLOR = { Sceptre: '#e0a800', Goblet: '#c03aa8', Sword: '#e01010', Bone: '#7a7a7a', Leaf: '#16b416', Tome: '#2a62e0' };
  // The sides of the card at k held by an enemy-suit card: [{ d, suit }], plus its Overwhelm count.
  function pressure(st, k) {
    var u = E.top(st, k), xy = E.XY(k), en = E.enemies(st, E.suitOf(st, u)), found = E.rawDef(st, u).type === 'Foundation';
    var out = { oc: E.overwhelmCount(st, k), sides: [] };
    (found ? ['N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW'] : ['N', 'E', 'S', 'W']).forEach(function (d) {
      var t = E.top(st, E.K(xy[0] + DIRS8[d][0], xy[1] + DIRS8[d][1])); if (!t) return;
      var hit = en.filter(function (s) { return E.hasSuit(st, t, s); })[0]; if (hit) out.sides.push({ d: d, suit: hit });
    });
    return out;
  }
  // Cards that can't be Overwhelmed show no pressure.
  function canPress(st, k) {
    var u = E.top(st, k), c = u && st.cards[u];
    return !!c && !c.ruined && !c.ascended && !(E.rawDef(st, u).mods || {}).immune && !E.isCovered(st, k) && !E.protectedStack(st, k);
  }
  // All the board's pressure chevrons, positioned in board pixels. b is the board's bounds.
  function pressMarks(st, b) {
    var half = CW / 2, h = '';
    for (var y = b.minY; y <= b.maxY; y++) for (var x = b.minX; x <= b.maxX; x++) {
      var k = x + ',' + y; if (!canPress(st, k)) continue;
      var pr = pressure(st, k); if (!pr.sides.length) continue;
      var hot = pr.oc.n >= pr.oc.th - 1, cx = GAP + (x - b.minX) * (CW + GAP) + half, cy = GAP + (y - b.minY) * (CH + GAP) + half;
      pr.sides.forEach(function (sd) {
        var dv = DIRS8[sd.d], diag = !!(dv[0] && dv[1]), m = E.K(x + dv[0], y + dv[1]);
        var mutual = !diag && canPress(st, m) && pressure(st, m).sides.some(function (s2) { return s2.d === OPP[sd.d]; });
        // mid-gutter (or where the gutters cross), nudged along the edge when the pair press each other;
        // the nudge is the same in each card's own frame, so the two chevrons land on opposite sides
        var u0 = half + GAP / 2, ov = mutual ? 12 : 0;
        var px = Math.round(cx + dv[0] * u0 - dv[1] * ov), py = Math.round(cy + dv[1] * u0 + dv[0] * ov);
        var ang = Math.atan2(-dv[1], -dv[0]) * 180 / Math.PI;
        h += '<i class="gchev' + (hot ? ' hot' : '') + (diag ? ' dg' : '') + '" data-k="' + k + '" data-d="' + sd.d + '" data-suit="' + sd.suit + '" style="left:' + px + 'px;top:' + py + 'px;background:' + SUITCOLOR[sd.suit] + ';transform:translate(-50%,-50%) rotate(' + ang + 'deg)"></i>';
      });
    }
    return h;
  }

  /* ---------------- suits: who pressures whom ---------------- */
  // Each archetype is weak to one suit: that suit pressures the archetype's own suit (it counts toward Overwhelm,
  // and the archetype can't play it). Sword also pressures every other suit (engine: enemies()). Read from the
  // Foundations, so the wheel stays right if the cards change.
  function suitRelations(defs) {
    var arch = {}, edges = [];   // edges: [from, to] = from pressures to
    defs.forEach(function (d) { if (d.type === 'Foundation' && d.archetype && d.weakTo) { arch[d.suit] = d.archetype; edges.push([d.weakTo, d.suit, 'arch']); } });
    D.SUITS.forEach(function (sv) { if (sv !== 'Sword' && !edges.some(function (e) { return e[0] === 'Sword' && e[1] === sv; })) edges.push(['Sword', sv, 'sword']); });
    return { arch: arch, edges: edges };
  }
  // The wheel: Sword in the middle, the other suits on a ring in the order the chain runs.
  function suitWheelSVG(defs) {
    var rel = suitRelations(defs), next = {}, ring = [], cur0 = null;
    rel.edges.forEach(function (e) { if (e[2] === 'arch') next[e[0]] = e[1]; });
    D.SUITS.forEach(function (sv) { if (next.Sword === sv) cur0 = sv; });
    for (var x = cur0, guard = 0; x && x !== 'Sword' && ring.indexOf(x) < 0 && guard++ < 8; x = next[x]) ring.push(x);
    D.SUITS.forEach(function (sv) { if (sv !== 'Sword' && ring.indexOf(sv) < 0) ring.push(sv); });
    var W = 440, cx = W / 2, cy = 176, R = 118, pos = { Sword: [cx, cy] };
    ring.forEach(function (sv, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / ring.length; pos[sv] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    // two suits that pressure each other (Bone and Sword) get two parallel arrows, nudged apart
    var mutual = function (a, b) { return rel.edges.some(function (e) { return e[0] === b && e[1] === a; }); };
    function line(a, b, cls) {
      var p = pos[a], q = pos[b], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), r0 = 26, r1 = 30;
      var off = mutual(a, b) ? 5 : 0, ox = -dy / L * off, oy = dx / L * off;
      return '<line class="' + cls + '" x1="' + (p[0] + dx / L * r0 + ox).toFixed(1) + '" y1="' + (p[1] + dy / L * r0 + oy).toFixed(1) + '" x2="' + (q[0] - dx / L * r1 + ox).toFixed(1) + '" y2="' + (q[1] - dy / L * r1 + oy).toFixed(1) + '" marker-end="url(#wh-' + cls + ')"/>';
    }
    // labels sit on the outside of each suit, clear of the arrows; Sword's beside the centre
    function label(sv) {
      var p = pos[sv], name = sv, arch = rel.arch[sv] ? esc(rel.arch[sv]) : '', x, y1, y2, anchor = 'middle';
      if (sv === 'Sword') { x = p[0] + 30; y1 = p[1] - 2; y2 = p[1] + 11; anchor = 'start'; }
      else {
        var ux = (p[0] - cx) / R, uy = (p[1] - cy) / R;
        if (Math.abs(ux) > 0.6) { x = p[0] + ux * 30; y1 = p[1] - 2; y2 = p[1] + 11; anchor = ux > 0 ? 'start' : 'end'; }
        else if (uy < 0) { x = p[0]; y1 = p[1] - 46; y2 = p[1] - 33; var t = name; name = arch; arch = t; }
        else { x = p[0]; y1 = p[1] + 38; y2 = p[1] + 51; }
      }
      var cls1 = sv === 'Sword' || (Math.abs((p[0] - cx) / R) > 0.6) || (p[1] >= cy) ? ['wh-name', 'wh-arch'] : ['wh-arch', 'wh-name'];
      return '<text x="' + x + '" y="' + y1 + '" text-anchor="' + anchor + '" class="' + cls1[0] + '">' + name + '</text>' + (arch ? '<text x="' + x + '" y="' + y2 + '" text-anchor="' + anchor + '" class="' + cls1[1] + '">' + arch + '</text>' : '');
    }
    var h = '<svg class="suitwheel" viewBox="0 0 ' + W + ' 360" role="img" aria-label="Suit wheel: each arrow points from a suit to the suit it pressures">' +
      '<defs>' + ['arch', 'sword'].map(function (c) { return '<marker id="wh-' + c + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="wh-head ' + c + '"/></marker>'; }).join('') + '</defs>';
    rel.edges.forEach(function (e) { if (pos[e[0]] && pos[e[1]]) h += line(e[0], e[1], e[0] === 'Sword' ? 'sword' : 'arch'); });
    Object.keys(pos).forEach(function (sv) {
      var p = pos[sv];
      h += '<g class="wh-node"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="24"/><g transform="translate(' + (p[0] - 12) + ',' + (p[1] - 13) + ') scale(1.5)" fill="none" stroke="' + (SUITINK[sv] || '#000') + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICON[sv] || '') + '</g>' +
        label(sv) + '</g>';
    });
    return h + '</svg>';
  }
  function suitWheelHTML(defs, me) {
    var rel = suitRelations(defs), mine = me && Object.keys(rel.arch).filter(function (sv) { return rel.arch[sv] === me.arch; })[0];
    var weak = mine && rel.edges.filter(function (e) { return e[1] === mine && e[2] === 'arch'; })[0];
    return '<div class="wheelbox">' + suitWheelSVG(defs) + '<p class="small">Each arrow points from a suit to the suit it <b>pressures</b>: next to it, it counts toward that card’s Overwhelm, and that suit’s archetype can’t play it. <b style="color:#b01010">Sword</b> pressures every other suit, and only Bone pressures Sword.</p>' +
      (weak ? '<p class="small"><b>You</b> (' + esc(me.arch) + ', ' + esc(mine) + ') are weak to <b>' + esc(weak[0]) + '</b>' + (weak[0] !== 'Sword' ? ' and Sword' : '') + '.</p>' : '') + '</div>';
  }
  function suitsModal() {
    var ctx = cur(), st = ctx && ctx.state, defs = st ? Object.keys(st.defs).map(function (id) { return st.defs[id]; }) : app.lib;
    var me = st && st.players[viewer(ctx)];
    app.modal = function () { return modal('Suits: who pressures whom', suitWheelHTML(defs, me), '<button class="btn def" data-act="closeModal">Close</button>'); }; render();
  }
  // While a Structure or Foundation is about to go on space k: green chevrons point from the space toward cards it
  // would pressure, red ones from cards that would pressure it toward the space. Directions follow Overwhelm:
  // diagonals count only for a Foundation (theirs or the one being placed).
  function placeChevrons(st, k, pc) {
    var xy = E.XY(k), h = '';
    Object.keys(DIRS8).forEach(function (d) {
      var nk = E.K(xy[0] + DIRS8[d][0], xy[1] + DIRS8[d][1]), t = E.top(st, nk); if (!t) return;
      var diag = d.length === 2, c = st.cards[t], td = E.rawDef(st, t), tFound = td.type === 'Foundation';
      var g = (!diag || tFound) && !c.ruined && !c.ascended && !(td.mods || {}).immune && !E.isCovered(st, nk) && !E.protectedStack(st, nk) && E.enemies(st, E.suitOf(st, t)).indexOf(pc.suit) >= 0;
      var r = (!diag || pc.found) && E.enemies(st, pc.suit).some(function (sv) { return E.hasSuit(st, t, sv); });
      if (g) h += '<i class="chev g d-' + d + (r ? ' both' : '') + '" title="Would pressure ' + esc(td.name) + '"></i>';
      if (r) h += '<i class="chev r d-' + d + (g ? ' both' : '') + '" title="' + esc(td.name) + ' would pressure it"></i>';
    });
    return h;
  }

  /* ---------------- board ---------------- */
  // Draw the board. Cells are absolutely positioned; only occupied cells and cells that matter
  // right now (legal spots, targets, highlights) get drawn.
  function boardHTML(ctx) {
    var st = ctx.state, ui = ctx.ui, b = E.bounds(st), ks = E.keys(st);
    if (!ks.length) b = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    var pad = 1; b = { minX: b.minX - pad, maxX: b.maxX + pad, minY: b.minY - pad, maxY: b.maxY + pad };
    // extend for legal cells
    var legal = {}, pd = st.pending, optSet = {}, placing = null;
    var buryingSuit = pd && pd.kind === 'cell' && pd.verb === 'bury' && st.res && st.res.src ? E.suitOf(st, st.res.src) : null;
    if (ctx.kind === 'game' && myTurn(ctx) && ui.hand && st.turn && st.turn.started && !st.pending && !st.res && E.needsPlacement(E.rawDef(st, ui.hand))) legal = E.legalCells(st, ui.hand);
    if (pd && pd.kind === 'cell' && canAnswer(ctx, pd)) pd.options.forEach(function (k) { optSet[k] = 1; });
    if (Object.keys(legal).length) { var hd = E.rawDef(st, ui.hand); if (hd.type === 'Structure' || hd.type === 'Foundation') placing = { suit: hd.suit, found: hd.type === 'Foundation' }; }
    Object.keys(legal).concat(Object.keys(optSet)).forEach(function (k) { var p = E.XY(k); b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0]); b.minY = Math.min(b.minY, p[1]); b.maxY = Math.max(b.maxY, p[1]); });
    var cols = b.maxX - b.minX + 1, rows = b.maxY - b.minY + 1, W = cols * (CW + GAP) + GAP, Hh = rows * (CH + GAP) + GAP;
    var see = {}, counted = {}, seenBy = {};
    if (ui.sel && E.top(st, ui.sel) && ui.showSeen) { var sg = E.sight(st, ui.sel); sg.cells.forEach(function (k) { see[k] = 1; }); sg.counted.forEach(function (k) { counted[k] = 1; }); }
    if (ui.sel && ui.showSeenBy) ks.forEach(function (k) { if (k !== ui.sel && E.sight(st, k).cells.indexOf(ui.sel) >= 0) seenBy[k] = 1; });
    var claimSet = {};
    if (ctx.kind === 'game' && myTurn(ctx) && st.turn && st.turn.started && !st.pending && !st.res && !ui.hand && !ui.mode && !ui.swap && st.winner == null) E.claimOptions(st, st.cur).forEach(function (k) { optSet[k] = 1; claimSet[k] = 1; });
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
      if (u && ctx.kind === 'game' && myTurn(ctx) && E.abilityReady(st, k)) cls += ' ready';
      var ov = u ? overlayFor(ctx, k) : null; if (ov) cls += ov.on ? ' ovl-on ovl-full' : ' ovl-dim';
      if (!u && legal[k] == null && !optSet[k] && !see[k] && !(ctx.kind === 'sandbox' || ui.mode === 'move')) { if (!ui.coords) continue; }
      h += '<div class="' + cls + '" style="left:' + lx + 'px;top:' + ly + 'px">';
      if (u) h += boardFace(st, k, ctx);
      if (ov && ov.on) h += '<div class="ovl full ' + ov.cls + '">' + ov.html + '</div>';
      if (legal[k] != null && placing) h += placeChevrons(st, k, placing);
      if (legal[k] != null) h += '<div class="cost">' + (legal[k] > E.funds(st.players[st.cur]) ? '<span>' + legal[k] + '●<br>Not enough AP</span>' : legal[k] + '●') + '</div>';
      if (ui.coords) h += '<span class="coord">' + k + '</span>';
      h += '<button class="cellbtn" data-cell="' + k + '" aria-label="' + (u ? esc(E.def(st, u).name) + ' at ' + k : 'Empty space ' + k) + '"></button></div>';
    }
    if (ctx.ui.showOW) h += pressMarks(st, b);
    var aiming = pd && pd.kind === 'cell' && pd.verb === 'ruin';
    return { html: '<div class="boardsizer' + (claiming ? ' claiming' : '') + (aiming ? ' aiming' : '') + (buryingSuit ? ' burying' : '') + '" style="' + (claiming ? '--meep:' + meepCursor(st.players[st.cur].color) + ';' : '') + (aiming ? '--sword:' + swordCursor() + ';' : '') + (buryingSuit ? '--bury:' + suitCursor(buryingSuit) + ';' : '') + 'width:' + W + 'px;height:' + Hh + 'px"><div class="boardinner" style="width:' + W + 'px;height:' + Hh + 'px">' + h + '</div></div>', W: W, H: Hh };
  }
  // Optional overlay that covers each card. Quickview: ● production and ◇ value in the owner's meeple colour
  // (unclaimed: ● in grey). War: one strip per point of the Overwhelm number, filled from the bottom for each
  // enemy-suit neighbour, in the owner's colour. Returns { on, cls, html }, or { on: false } to dim the card.
  var GREY = '#7a7a7a';
  function overlayFor(ctx, k) {
    var st = ctx.state, mode = ctx.ui.overlay; if (mode !== 'quick' && mode !== 'war') return null;
    var u = E.top(st, k), c = st.cards[u];
    if (c.ruined || E.isCovered(st, k)) return { on: false };
    // owners: everyone whose Kingdom holds the card (claimants, plus e.g. The Wise Old Tree's Gardener)
    var owners = st.players.map(function (q, i) { return i; }).filter(function (i) { return E.kingdom(st, i).indexOf(k) >= 0; });
    if (mode === 'quick') {
      var inc = E.cardIncome(st, k);
      if (!owners.length) return inc ? { on: true, cls: 'quick', html: '<div class="qv" style="color:' + GREY + '"><b>+' + inc + '●</b></div>' } : { on: false };
      return { on: true, cls: 'quick', html: owners.map(function (p) {
        var v = E.cardValue(st, k, p) + E.volcanicBonus(st, k);
        return '<div class="qv" style="color:' + st.players[p].color + '" title="' + esc(st.players[p].name) + '">' + (inc ? '<b>+' + inc + '●</b>' : '') + '<b>' + v + '◇</b></div>';
      }).join('') };
    }
    var col = owners.length ? st.players[owners[0]].color : GREY;
    var safe = c.ascended ? 'Ascended' : (E.rawDef(st, u).mods || {}).immune ? 'Immune' : E.protectedStack(st, k) ? 'Protected' : '';
    if (safe) return { on: true, cls: 'war safe', html: '<span class="wn" style="color:' + col + '">' + safe + '</span>' };
    var oc = E.overwhelmCount(st, k), n = Math.min(oc.n, oc.th), strips = '';
    for (var i = oc.th - 1; i >= 0; i--) strips += '<i class="strip"' + (i < n ? ' style="background:' + col + '"' : '') + '></i>';
    return { on: true, cls: 'war' + (n > 0 && n >= oc.th - 1 ? ' hot' : ''), html: strips + '<span class="wn">' + oc.n + '/' + oc.th + '</span>' };
  }
  // What the board bar shows while an overlay is on: each player's ● per turn and ◇, or the War key.
  function overlayTotal(ctx) {
    var st = ctx.state, mode = ctx.ui.overlay;
    if (mode === 'quick') { var sc = E.scores(st); return st.players.map(function (pl, i) { return pl.out ? '' : '<b class="qtot" style="color:' + pl.color + '">' + esc(pl.name) + ' +' + E.income(st, i) + '● · ' + sc[i].total + '◇</b>'; }).join(' ') + ' <span class="muted">(◇ totals include banked tokens; unclaimed cards in grey)</span>'; }
    if (mode === 'war') return '<span class="muted">Each strip is one enemy-suit neighbour needed to Overwhelm the card, filled in its owner’s colour (grey = unclaimed). Red outline: one away.</span>';
    return '';
  }
  // Scale the board to fit, or to the chosen zoom. Runs after render because it needs real element sizes.
  function applyZoom(ctx) {
    var wrap = $('.boardwrap'); if (!wrap || !ctx) return;
    var sizer = $('.boardsizer', wrap), inner = $('.boardinner', wrap); if (!sizer) return;
    var W = parseFloat(inner.style.width), Hh = parseFloat(inner.style.height);
    if (ctx.ui.fit) { var z = Math.min((wrap.clientWidth - 4) / W, (wrap.clientHeight - 4) / Hh, 1.15); ctx.ui.zoom = Math.max(0.25, z); }
    var zz = ctx.ui.zoom; inner.style.transform = 'scale(' + zz + ')'; sizer.style.width = W * zz + 'px'; sizer.style.height = Hh * zz + 'px';
    var zl = $('#zoomlbl'); if (zl) zl.textContent = Math.round(zz * 100) + '%';
    paintScene(wrap);
  }
  // Toolbar above the board: zoom, highlight toggles, overlays, debug report.
  function boardBar(ctx) {
    var u = ctx.ui;
    return '<div class="boardbar raised row small">' +
      '<button class="btn sm" data-act="zoomout" title="Zoom out">−</button><span id="zoomlbl" style="min-width:38px;text-align:center">100%</span><button class="btn sm" data-act="zoomin" title="Zoom in">+</button>' +
      '<button class="btn sm' + (u.fit ? ' on' : '') + '" data-act="fit">Fit board</button>' +
      '<label><input type="checkbox" data-tog="showSeen"' + (u.showSeen ? ' checked' : '') + '> What it sees</label>' +
      '<label><input type="checkbox" data-tog="showSeenBy"' + (u.showSeenBy ? ' checked' : '') + '> What sees it</label>' +
      '<label><input type="checkbox" data-tog="showOW"' + (u.showOW ? ' checked' : '') + '> Overwhelm pressure</label>' +
      '<label><input type="checkbox" data-tog="coords"' + (u.coords ? ' checked' : '') + '> Grid</label>' +
      (ctx.kind === 'game' && hasBots(ctx.state) ? '<label title="How fast the bots play">Bots <select data-pref="botSpeed">' + [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']].map(function (o) { return '<option value="' + o[0] + '"' + ((prefs.botSpeed || 'normal') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' : '') +
      '<button class="btn sm" data-act="debug" title="Copy the log and board state to the clipboard">Copy debug report</button>' +
      '<button class="btn sm" data-act="keys" title="Keyboard shortcuts">Keys</button>' +
      '<button class="btn sm" data-act="suits" title="Which suits pressure which">Suits</button>' +
      '<label>Overlay <select data-sel="overlay">' + [['none', 'None'], ['quick', 'Quickview (● and ◇)'], ['war', 'War (Overwhelm)']].map(function (o) { return '<option value="' + o[0] + '"' + ((u.overlay || 'none') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      overlayTotal(ctx) +
      '<span class="muted legend">Yellow: what the selected card sees (filled = counted). Blue: cards that see it.</span></div>';
  }

  /* ---------------- inspector ---------------- */
  // Right-hand panel: the selected hand card, or the selected board card with its details and buttons.
  function inspector(ctx) {
    var st = ctx.state, ui = ctx.ui, h = '';
    if (ui.hand && !ui.sel) {
      var hu = ui.hand, hd = E.rawDef(st, hu); h += '<div class="panelhead">In hand</div>' + defFace(Object.assign({}, hd, { art: artOf(hd.id) }), { big: true });
      var why = E.playBlock(st, viewer(ctx), hu); if (why) h += '<p class="err">' + esc(why) + '</p>';
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
      if (myTurn(ctx) && st.turn && st.turn.started && !st.pending && !st.res && st.winner == null) {
        if (E.claimOptions(st, p).indexOf(k) >= 0) btns += '<button class="btn def" data-act="claim" data-k="' + k + '">Claim (' + st.players[p].meeples + ' meeples left)</button>';
        if (d.ability && (c.claimants.indexOf(p) >= 0 || d.ability.anyPlayer) && !c.ruined) btns += '<button class="btn" data-act="ability" data-k="' + k + '"' + (st.turn.used[u] ? ' disabled' : '') + '>' + esc(abilityLabel(d.ability)) + '</button>';
      }
      if (btns) h += '<div class="row">' + btns + '</div>';
      if (!ctx.online) h += '<details style="margin-top:8px" data-keep="reftools"' + (app.open.reftools ? ' open' : '') + '><summary>Referee tools</summary>' + refTools(ctx, k) + '</details>';
    } else h += '<fieldset><legend>Sandbox tools</legend>' + refTools(ctx, k) + '</fieldset>';
    return h;
  }
  // Button text for a card's ability.
  function abilityLabel(ab) {
    if (ab.kind === 'exchange') return 'Exchange ' + ab.pay + '● for ' + ab.gain + '◇';
    if (ab.kind === 'convert') return 'Convert a neighbor (' + ab.pay + '●)';
    if (ab.kind === 'move') return 'Move to an adjacent space';
    if (ab.kind === 'buryHand') return 'Bury a card from your hand here';
    if (ab.kind === 'confess') return 'Confess a Curse (+' + (ab.gain || 4) + '◇)';
    if (ab.kind === 'swapMeeple') return 'Offer a meeple swap';
    return 'Use ability';
  }
  // Referee / sandbox tools for one board card: Ruin, move, remove, change suit, tokens, claims, bury.
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
  // <option> list of every card in this game's library.
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
  // Players panel. The table below the first line is an older layout that no longer runs; playerCards is the one in use.
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
      h += '<div class="pcard' + (isCur ? ' cur' : '') + (pl.out ? ' out' : '') + '"><div class="pname"><span class="swatch" style="background:' + pl.color + '"></span> <b>' + esc(pl.name) + (i === fixedSeat(ctx) ? ' (you)' : '') + '</b> <span class="small">' + esc(pl.arch) + (pl.out ? ' (out)' : '') + (ctx.online && !isConnected(pl.name) ? ' · offline' : '') + (pl.bot ? ' · ' + esc(BOT_NAMES[pl.bot] || pl.bot) : '') + (ctx.thinking === i ? ' · <i>thinking…</i>' : '') + '</span>' + (isCur ? '<span class="turnmark">◀ turn</span>' : '') + '</div>' +
        '<div class="pbody"><span data-fx="pile-' + i + '">' + jewelPile(sc[i].total) + '</span><div class="pstats"><div class="bignum" title="Victory points: cards ' + sc[i].cards + ' + tokens ' + sc[i].tokens + '">' + sc[i].total + '<span class="unit">◇</span></div>' +
        '<div class="small">♟ ' + pl.meeples + ' meeples' + (ctx.kind === 'game' ? ' · ' + pl.hand.length + ' in hand' : '') + (pl.reserve > 0 ? ' · ' + pl.reserve + '● Reserves' : '') + '</div></div></div></div>';
    });
    h += '</div>';
    if (ctx.kind === 'game') h += '<p class="small muted" style="margin:4px 0 0">First to ' + st.opts.target + '◇ at the end of their turn wins. Banked tokens are included.</p>';
    return h;
  }
  // Pick a color for a log line by matching its text.
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
  // Redraw the whole app from `app`. A render requested during a render runs once the current one finishes.
  function render() {
    if (rendering) { rerender = true; return; }
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
    if (rerender) { rerender = false; setTimeout(render, 0); }
  }
  // Build the HTML, swap it in, then restore the scroll positions and input focus that the swap loses.
  function renderNow() {
    var root = $('#app');
    var scrollLog = $('.log'); var atBottom = !scrollLog || scrollLog.scrollTop + scrollLog.clientHeight >= scrollLog.scrollHeight - 20;
    var bw = $('.boardwrap'), bsx = bw ? bw.scrollLeft : 0, bsy = bw ? bw.scrollTop : 0;
    var focusSel = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-focus-key');
    var hs = $('.bottom .hand, .mhand .hand'), hsl = hs ? hs.scrollLeft : 0;
    var tabs = ONLINE ? [['home', 'Home'], ['new', 'Play locally'], ['game', 'Local game'], ['online', 'Online'], ['profile', 'Profile'], ['library', 'Cards'], ['help', 'Help']]
      : [['new', 'New game'], ['game', 'Game'], ['sandbox', 'Sandbox'], ['library', 'Library'], ['builder', 'Card builder'], ['help', 'Help']];
    var h = '<div class="win raised' + (isMobile() && inGame() ? ' mwin' : '') + '"><div class="titlebar">' + crest() + '<span>' + (ONLINE ? 'Kartenspiel' : 'Kartenspiel — playtest table') + '</span><span class="grow"></span><span class="small" style="font-weight:400">' + esc(ONLINE ? (N.user ? (N.guest ? 'Playing as ' + N.user + ' (guest)' : 'Signed in as ' + N.user) : '') : 'Library: ' + app.libSource + ', ' + app.lib.length + ' cards') + '</span></div>';
    h += '<div class="menubar" role="tablist">' + tabs.map(function (t) { var dis = t[0] === 'game' && !app.game; return '<button class="tab' + (app.page === t[0] ? ' on' : '') + '" role="tab" data-page="' + t[0] + '"' + (dis ? ' disabled style="opacity:.5"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="content">' + pageHTML() + '</div>';
    var st = cur() && cur().state;
    h += '<div class="statusbar small"><div class="sunken grow">' + esc(statusText()) + '</div>' + (st && app.page !== 'library' && app.page !== 'builder' && app.page !== 'help' && app.page !== 'new' && app.page !== 'home' && app.page !== 'profile' ? '<div class="sunken">Deck ' + st.deck.length + ' · Discard ' + st.discard.length + '</div>' : '') + '</div></div>';
    h += modalHTML();
    root.innerHTML = h;
    var lg = $('.log'); if (lg && atBottom) lg.scrollTop = lg.scrollHeight;
    var hs2 = $('.bottom .hand, .mhand .hand'); if (hs2) hs2.scrollLeft = hsl;
    var bw2 = $('.boardwrap'); if (bw2) { applyZoom(cur()); if (!cur().ui.fit) { bw2.scrollLeft = bsx; bw2.scrollTop = bsy; } }
    if (app.page === 'game') botDriver(app.game);
    keyHints();
    if (focusSel) { var f = document.querySelector('[data-focus-key="' + focusSel + '"]'); if (f) { f.focus(); if (f.setSelectionRange && f.value != null) { try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { } } } }
  }
  function statusText() {
    if (app.toast) return app.toast;
    var c = cur();
    if (app.page === 'online' && !c) return N.status === 'on' ? 'Connected to the game server.' : N.status === 'none' ? 'No game server set.' : 'Connecting to the game server…';
    if ((app.page === 'game' || app.page === 'sandbox' || app.page === 'online') && c) {
      var st = c.state;
      if (c.err) return c.err;
      if (st.winner != null) return st.players[st.winner].name + ' wins.';
      if (c.online) return (N.room ? N.room.name + ' — ' : '') + 'round ' + st.round + ', ' + (st.cur === c.me ? 'your turn' : st.players[st.cur].name + '’s turn') + (N.status === 'on' ? '' : ' (reconnecting…)');
      if (isBot(st, st.cur)) return st.players[st.cur].name + ' is playing — round ' + st.round;
      if (app.page === 'game') return st.players[st.cur].name + ' — round ' + st.round + (st.turn.started ? ', ' + st.players[st.cur].ap + '● to spend' + (st.turn.claimed ? ', claim used' : ', claim available') : ', waiting to start the turn');
      return 'Sandbox: free placement, no costs or turns.';
    }
    return 'Ready.';
  }
  // The page to draw, from app.page.
  function pageHTML() {
    switch (app.page) {
      case 'game': return app.game ? gamePage(app.game) : newGamePage();
      case 'sandbox': return sandboxPage();
      case 'library': return libraryPage();
      case 'builder': return ONLINE ? homePage() : builderPage();
      case 'home': return homePage();
      case 'online': return onlinePage();
      case 'profile': return profilePage();
      case 'new': return newGamePage();
      case 'help': return helpPage();
      case 'notes': return notesPage();
      default: return ONLINE ? homePage() : newGamePage();
    }
  }

  /* ----- new game ----- */
  // New game page options, kept for the next game.
  var setup = { n: 2, players: [], handSize: 4, drawPerTurn: 2, meeples: 8, target: 48, enforceWeak: true, foundationBy: 3, autoEnd: true, seatStart: true, burySuitOW: true, defense: true, adjDiscount: true, noWander: true, ascension: true };
  (function () { var s = lsGet('ks.setup'); if (s && s.players && s.players.length) for (var k in s) setup[k] = s[k]; })();   // the last game's setup
  function archetypes() { return sortLib(app.lib.filter(function (c) { return c.type === 'Foundation' && c.archetype; })); }
  function ensureSetup() {
    var A = archetypes().map(function (c) { return c.archetype; });
    for (var i = 0; i < 5; i++) { if (!setup.players[i]) setup.players[i] = { name: 'Player ' + (i + 1), arch: A[i] || A[0], kind: 'human' }; }
  }
  function newGamePage() {
    ensureSetup();
    var A = archetypes(), saved = lsGet('ks.game');
    var h = '<div class="page scroll"><div class="pane" style="max-width:720px">' + (ONLINE ? '' : logoHTML('small') + fleuron());
    if (saved && saved.players && saved.winner == null && !app.game) h += '<div class="banner row" style="margin-bottom:8px">A game in progress was saved in this browser (round ' + saved.round + ', ' + esc(saved.players.map(function (p) { return p.name; }).join(', ')) + '). <button class="btn" data-act="resume">Resume it</button></div>';
    if (app.game) h += '<div class="banner row" style="margin-bottom:8px">A game is running. Starting a new one replaces it. <button class="btn" data-page="game">Back to the game</button></div>';
    h += '<fieldset><legend>Players</legend><div class="row" style="margin-bottom:6px">Number of players <select data-set="n">' + [2, 3, 4, 5].map(function (n) { return '<option' + (n === setup.n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><span class="muted small">Each archetype can be taken by only one player. Turn order goes top to bottom.</span></div>' +
      '<p class="small muted" style="margin:0 0 6px">Bots: <b>Greedy</b> takes the best move for itself right now. <b>Tactician</b> also uses every card ability. <b>Warlord</b> plays for War and Conquest, aiming Ruins and Overwhelms at rivals. <b>Genius</b> thinks each turn through and how rivals might answer, using only what a player could see; it takes a second or two per move. Every bot plays for its archetype’s goal.</p>';
    for (var i = 0; i < setup.n; i++) {
      var p = setup.players[i], taken = setup.players.slice(0, setup.n).map(function (q, j) { return j !== i ? q.arch : null; });
      h += '<div class="row" style="margin:3px 0"><span class="swatch" style="background:' + COLORS[i] + ';width:14px;height:14px"></span>' +
        '<select data-pkind="' + i + '" title="Who plays this seat">' + [['human', 'Human']].concat(BOT_CHOICES.map(function (b) { return [b, BOT_NAMES[b]]; })).map(function (o) { return '<option value="' + o[0] + '"' + ((p.kind || 'human') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<input type="text" data-focus-key="pn' + i + '" data-pname="' + i + '" value="' + esc(p.name) + '" style="width:150px">' +
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
  // Game page: players, ● and log on the left, board in the middle, inspector on the right, hand at the bottom.
  function gamePage(ctx) {
    if (isMobile()) return gamePageMobile(ctx);
    var st = ctx.state, ui = ctx.ui, pl = st.players[st.cur];
    var h = '<div class="page"><div class="gamegrid">';
    h += '<div class="left"><div class="pane raised" style="flex:0 0 auto">' + playersPanel(ctx) + '</div>';
    h += '<div class="pane raised col" style="flex:0 0 auto"><div class="apbox"><span data-fx="jar">' + apJar(st.turn.started ? pl.ap : 0) + '</span><div><div class="bignum">' + (st.turn.started ? pl.ap : '—') + '<span class="unit">●</span></div><div class="small">' + (st.turn.started ? (myTurn(ctx) ? 'Aktion points left' : esc(pl.name) + '’s ● left') : 'Turn not started') + '</div>' + (pl.debt > 0 ? '<div class="reserve" title="Owed for reactions; taken from your next turn">− ' + pl.debt + '● owed next turn</div>' : '') + (pl.reserve > 0 ? '<div class="reserve" title="Reserves are spent like ● after your ● runs out, and stay between turns">+ ' + pl.reserve + '● Reserves</div>' : '') +
      (st.turn.started ? (function () { var co = E.claimOptions(st, st.cur).length; return '<div class="claimstate' + (co ? ' avail' : '') + '">' + (st.turn.claimed ? 'Claim used' : co ? meepleChip(ctx) + ' Claim available' : 'Claim: nothing to claim yet') + '</div>'; })() : '') + '</div></div>' +
      '<div class="row"><button class="btn def big" data-act="endTurn"' + (myTurn(ctx) && st.turn.started && !st.pending && !st.res && st.winner == null ? '' : ' disabled') + '>End turn</button>' +
      (ctx.online ? '' : '<button class="btn big" data-act="undo"' + (ctx.hist.length ? '' : ' disabled') + ' title="Undo the last action">Undo</button>') + '</div>' +
      (ctx.online ? '' : '<details class="small" data-keep="ref"' + (app.open.ref ? ' open' : '') + '><summary>Referee</summary><div class="col" style="margin-top:4px"><div class="row">● <button class="btn sm" data-act="apAdj" data-d="-1">−</button><button class="btn sm" data-act="apAdj" data-d="1">+</button> ◇ tokens <button class="btn sm" data-act="tokAdj" data-d="-1">−</button><button class="btn sm" data-act="tokAdj" data-d="1">+</button></div>' +
      '<select data-sel="giveId" style="max-width:100%">' + cardOptions(st, ui.giveId) + '</select><button class="btn sm" data-act="give">Give to ' + esc(pl.name) + '’s hand</button></div></details>') + '</div>';
    h += '<div class="raised" style="flex:1;min-height:0;display:flex;flex-direction:column;padding:3px"><div class="panelhead" style="margin:0 0 3px">Log</div><div class="log sunken">' + logPanel(st) + '</div></div></div>';
    h += '<div class="center">' + (ctx.online ? onlineBar(ctx) : '') + boardBar(ctx) + promptBar(ctx) + '<div class="boardwrap sunken">' + boardHTML(ctx).html + '</div></div>';
    h += '<div class="right raised pane">' + inspector(ctx) + '</div>';
    h += '<div class="bottom raised">' + handHTML(ctx) + '</div>';
    return h + '</div></div>';
  }
  // The yellow bar above the board that says what the game is waiting for.
  function promptBar(ctx) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (ctx.err) return '<div class="prompt">' + esc(ctx.err) + ' <button class="btn sm" data-act="clearErr">OK</button></div>';
    if (ctx.kind === 'sandbox') {
      if (ui.mode === 'move') return '<div class="prompt">Click an empty space to move the card from ' + esc(ui.moveFrom) + '. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
      return '';
    }
    if (st.winner != null) return '<div class="prompt winner">' + pix(CROWN, ART_PAL, 2, '', 'Crown') + '<b>' + esc(st.players[st.winner].name) + ' wins!</b> ' + (ctx.online ? onlineAfterGame() : '<button class="btn sm def" data-act="rematch" title="Same players and rules, new shuffle">Rematch</button><button class="btn sm" data-page="new">New game</button>') + '</div>';
    if (ctx.online || hasBots(st)) { var ow = waitingPrompt(ctx); if (ow) return ow; }
    if (pd && pd.kind === 'cell') return '<div class="prompt"><b>' + esc(st.players[pd.player].name) + ':</b> ' + esc(pd.prompt) + ' ' + verb() + ' an orange-outlined ' + (pd.empty ? 'space' : 'card') + '.' + (pd.optional ? ' <button class="btn sm" data-act="skip">Skip</button>' : '') + (st.res && !ctx.online ? ' <button class="btn sm" data-act="cancelEffect" title="Referee: stop resolving this effect">Cancel effect</button>' : '') + '</div>';
    if (ui.autoEnding) return '<div class="prompt"><b>Out of ●.</b> Nothing left to play, claim or use, so your turn ends in a moment. <button class="btn sm" data-act="holdTurn">Wait, I’m not done</button></div>';
    if (ui.endAsked) { var lt = leftToDo(ctx); if (lt) return '<div class="prompt">You can still ' + lt.text + ' (' + E.funds(st.players[st.cur]) + '● left). End your turn anyway? <button class="btn sm def" data-act="endTurn">End turn</button><button class="btn sm" data-act="keepPlaying">Keep playing</button><button class="linkbtn small" data-act="noEndAsk">Don’t ask again</button></div>'; }
    if (ui.mode === 'reclaim') return '<div class="prompt">' + verb() + ' one of your claimed cards to take its meeple back. This ends your turn. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
    if (ui.mode === 'move') return '<div class="prompt">Referee move: click an empty space for the card from ' + esc(ui.moveFrom) + '. <button class="btn sm" data-act="cancelMode">Cancel</button></div>';
    if (ui.swap) return '<div class="prompt">Choose 2 cards to discard, then draw 1. <button class="btn sm def" data-act="doSwap"' + (ui.swap.length === 2 ? '' : ' disabled') + '>Discard 2, draw 1</button><button class="btn sm" data-act="cancelSwap">Cancel</button></div>';
    if (ui.hand && !E.needsPlacement(E.rawDef(st, ui.hand))) { var ic = +E.rawDef(st, ui.hand).cost || 0, iok = ic <= E.funds(st.players[st.cur]), iwhy = E.playBlock(st, st.cur, ui.hand); return '<div class="prompt">' + esc(E.rawDef(st, ui.hand).name) + ' is played straight from your hand. <button class="btn sm def" data-act="cast"' + (iok && !iwhy ? '' : ' disabled') + '>' + (iwhy ? esc(iwhy) : iok ? 'Play it (' + ic + '●)' : 'Not enough AP (' + ic + '●)') + '</button> <button class="btn sm" data-act="deselect">Cancel</button></div>'; }
    if (ui.hand) { var LC = E.legalCells(st, ui.hand), canPay = Object.keys(LC).some(function (x) { return LC[x] <= E.funds(st.players[st.cur]); }); return '<div class="prompt">' + (canPay ? verb() + ' a green space to play ' + esc(E.rawDef(st, ui.hand).name) + '.' : 'Not enough AP to play ' + esc(E.rawDef(st, ui.hand).name) + ' anywhere (you have ' + st.players[st.cur].ap + '●).') + ' <button class="btn sm" data-act="deselect">Cancel</button></div>'; }
    var co = st.turn.started && !pd && !st.res ? E.claimOptions(st, st.cur) : [];
    if (co.length) return '<div class="prompt">Claim available: ' + (verb() === 'Tap' ? 'drag your meeple onto an orange-outlined card, or tap the card' : 'your cursor is a meeple. Click an orange-outlined card') + ' to claim it (' + st.players[st.cur].meeples + ' meeples left), or keep playing.</div>';
    return hintBar(ctx);
  }
  // What a player can still do this turn: { n (cards they can afford to play), claim (a claim is available), text }, or null.
  function leftToDo(ctx) {
    var st = ctx.state; if (!myTurn(ctx) || !st.turn || !st.turn.started || st.pending || st.res || st.winner != null) return null;
    var n = st.players[st.cur].hand.filter(function (u) { return canAfford(st, u); }).length, claim = E.claimOptions(st, st.cur).length > 0 && st.players[st.cur].meeples > 0;
    if (!n && !claim) return null;
    return { n: n, claim: claim, text: (n ? 'play ' + n + ' card' + (n > 1 ? 's' : '') : '') + (n && claim ? ' and ' : '') + (claim ? 'claim a card' : '') };
  }
  // A gentle next step for a player whose turn it is and who has nothing selected. Off with "Hide hints".
  function hintBar(ctx) {
    var st = ctx.state, pl = st.players[st.cur];
    if (prefs.hints === false || ctx.kind !== 'game' || !myTurn(ctx) || !st.turn || !st.turn.started || st.pending || st.res || st.winner != null || ctx.ui.hand || ctx.ui.mode || ctx.ui.swap) return '';
    var touch = verb() === 'Tap', h = '', small = isMobile();
    var fu = pl.hand.filter(function (u) { return E.rawDef(st, u).type === 'Foundation' && !E.playBlock(st, st.cur, u); })[0];
    if (small) {   // a phone: the same hints, shorter, so the board keeps its room
      if (fu && !pl.foundationPlaced) h = 'First, drag your Foundation (<b>' + esc(E.rawDef(st, fu).name) + '</b>) onto the board.';
      else if (!leftToDo(ctx)) h = E.funds(pl) > 0 ? 'Nothing affordable: end turn, or discard 2 to draw 1.' : 'Out of ●: end your turn when ready.';
      else if (pl.turns <= 2) h = 'Green-bordered cards are affordable: drag one onto the board.';
      return h ? '<div class="prompt hint"><span>💡 ' + h + '</span><button class="linkbtn small" data-act="hideHints">Hide</button></div>' : '';
    }
    if (fu && !pl.foundationPlaced) h = 'Start by playing your Foundation, <b>' + esc(E.rawDef(st, fu).name) + '</b>: drag it onto the board, or ' + (touch ? 'tap' : 'click') + ' it and then the green space.' + (st.opts.foundationBy ? ' It must be down by turn ' + st.opts.foundationBy + '.' : '');
    else if (!leftToDo(ctx)) h = E.funds(pl) > 0 ? 'Nothing in your hand fits your ● right now. End your turn, or discard 2 cards to draw 1.' : 'You’re out of ●. End your turn when you’re ready' + (touch ? '.' : ' (E).');
    else if (pl.turns <= 2) h = 'Cards with a green border are ones you can afford. Drag one onto the board, or ' + (touch ? 'tap' : 'click') + ' it to see where it can go.';
    if (!h) return '';
    return '<div class="prompt hint"><span>💡 ' + h + '</span><button class="linkbtn small" data-act="hideHints">Hide hints</button></div>';
  }
  // The hand in the player's chosen order (only the display changes, never the game).
  function handOrder(st, hand) {
    var by = prefs.handSort || 'drawn'; if (by === 'drawn') return hand;
    var S = KData.SUITS, T = ['Foundation', 'Structure', 'Grounds', 'Action', 'Blessing', 'Curse'];
    return hand.slice().sort(function (a, b) { var x = E.rawDef(st, a), y = E.rawDef(st, b);
      return by === 'suit' ? S.indexOf(x.suit) - S.indexOf(y.suit) || T.indexOf(x.type) - T.indexOf(y.type) || (+x.cost || 0) - (+y.cost || 0) : (+x.cost || 0) - (+y.cost || 0) || S.indexOf(x.suit) - S.indexOf(y.suit); });
  }
  // A short label for why a card can't be played (the full reason is its tooltip).
  function blockShort(why) { return /not your Foundation/.test(why) ? 'Not your Foundation' : /cannot play/.test(why) ? 'Your weak suit' : /reaction/.test(why) ? 'Reaction only' : /own more/.test(why) ? 'You own too many' : 'Can’t play now'; }
  // The current player's hand. A green border means it can be afforded right now.
  function handHTML(ctx) {
    var st = ctx.state, ui = ctx.ui, pl = st.players[viewer(ctx)];
    var fixed = fixedSeat(ctx) != null;
    if ((!fixed && (!st.turn.started || isBot(st, st.cur))) || st.winner != null) return '<div class="hand"><span class="muted">' + (st.winner != null ? 'Game over.' : isBot(st, st.cur) ? esc(st.players[st.cur].name) + ' is playing.' : 'Hand hidden until ' + esc(pl.name) + ' starts their turn.') + '</span></div>';
    var h = '<div class="row small" style="padding:4px 6px 0"><b>' + (fixed ? 'Your hand' : esc(pl.name) + '’s hand') + '</b> <span class="muted handinfo">(' + esc(pl.arch) + ', weak to ' + esc((E.archInfo(st)[pl.arch] || {}).weakTo || '—') + ')</span>' +
      '<button class="btn sm" data-act="handSort" title="Order your hand: as drawn, by suit or by cost">⇅ ' + ({ drawn: 'As drawn', suit: 'By suit', cost: 'By cost' }[prefs.handSort || 'drawn']) + '</button>' +
      '<button class="btn sm" data-act="startSwap"' + (pl.hand.filter(function (x) { return E.rawDef(st, x).type !== 'Foundation'; }).length >= 2 && !st.pending && !ui.swap && myTurn(ctx) ? '' : ' disabled') + '>Discard 2, draw 1…</button>' +
      (st.turn.played === 0 && !st.turn.claimed ? '' : '') + '</div><div class="hand">';
    handOrder(st, pl.hand).forEach(function (u) {
      var d = E.rawDef(st, u), cls = 'hcard', blocked = E.playBlock(st, viewer(ctx), u);
      if (ui.hand === u) cls += ' sel'; if (blocked) cls += ' blocked'; if (ui.swap && ui.swap.indexOf(u) >= 0) cls += ' pick';
      if (!blocked && myTurn(ctx) && !st.pending && !st.res && canAfford(st, u)) cls += ' afford';
      var free = E.isFree(st, u); if (free) cls += ' free';
      h += '<div class="' + cls + '"' + (blocked ? ' title="' + esc(blocked) + '"' : '') + '>' + defFace(Object.assign({}, d, { art: artOf(d.id) }), free ? { mid: true, cost: 0, tex: u } : { mid: true, tex: u }) + (blocked ? '<span class="blocktag">' + esc(blockShort(blocked)) + '</span>' : '') + (free ? '<span class="freetag">Free this turn</span>' : '') + '<button class="cellbtn" data-hand="' + u + '" aria-label="' + esc(d.name) + '"></button></div>';
    });
    if (pl.aside && pl.aside.length) h += '<span class="muted small" style="align-self:center">Set aside for next turn: ' + pl.aside.length + ' card' + (pl.aside.length > 1 ? 's' : '') + '</span>';
    if (!pl.hand.length) h += '<span class="muted">No cards in hand.</span>';
    return h + '</div>';
  }

  /* ----- modals ----- */
  // What everyone else did since this player's last turn, from the log: shown when their next turn comes round,
  // so nobody has to dig through the log (which a phone keeps in a sheet).
  function recapHTML(st, p) {
    var L = st.log, mine = '— ' + st.players[p].name + '’s turn', end = L.length, last = -1, from = -1, i;
    if (end && L[end - 1].indexOf(mine) === 0) end--;   // the header for the turn that's about to start
    for (i = end - 1; i >= 0; i--) if (L[i].indexOf(mine) === 0) { last = i; break; }
    for (i = last + 1; i < end; i++) if (L[i].indexOf('— ') === 0) { from = i; break; }
    if (from < 0) return '';
    var lines = L.slice(from, end).filter(function (l) { return logClass(l) !== 'lg-ref' && !/^New game/.test(l); });
    if (!lines.some(function (l) { return l.indexOf('— ') !== 0; })) return '';
    var more = Math.max(0, lines.length - 12); lines = lines.slice(-12);
    return '<div class="recap"><div class="small muted">Since your last turn' + (more ? ' (the last 12 things; ' + more + ' more in the log)' : '') + ':</div><div class="log sunken">' +
      lines.map(function (l) { return '<div class="' + logClass(l) + '">' + esc(l.replace(/^— (.*) —$/, '$1')) + '</div>'; }).join('') + '</div></div>';
  }
  /* ----- modals ----- */
  function modal(title, body, btns) { return '<div class="modalbg"><div class="modal raised" role="dialog" aria-label="' + esc(title) + '"><div class="titlebar">' + crest() + '<span>' + esc(title) + '</span></div><div class="body">' + body + '</div><div class="btns">' + (btns || '') + '</div></div></div>'; }
  // Dialogs: app.modal for one-off ones; otherwise revealed hands, "pass the device" between turns,
  // and engine prompts that aren't answered by clicking the board.
  function modalHTML() {
    if (app.modal) return app.modal();
    var ctx = cur(); if (!ctx || (app.page !== 'game' && app.page !== 'sandbox' && app.page !== 'online')) return '';
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (st.reveal && (ctx.online ? st.reveal.to === ctx.me : !isBot(st, st.reveal.to))) {
      var rv = st.reveal;
      return modal(st.players[rv.of].name + '’s hand', '<p>Shown to ' + esc(st.players[rv.to].name) + ' only.</p><div class="hand">' + rv.cards.map(function (u) { return '<div class="hcard">' + defFace(E.rawDef(st, u), { mid: true, tex: u }) + '</div>'; }).join('') + (rv.cards.length ? '' : '<span class="muted">Their hand is empty.</span>') + '</div>', '<button class="btn def" data-act="closeReveal">Close</button>');
    }
    if (ctx.kind !== 'game') { if (pd && pd.kind !== 'cell') return pendingModal(ctx); return ''; }
    var me = fixedSeat(ctx);
    if (me != null) {
      if (st.winner == null && myTurn(ctx) && !st.turn.started && ui.mode !== 'reclaim' && !st.players[me].out) {
        var mine = E.keys(st).some(function (k) { var c = st.cards[E.top(st, k)]; return !c.fixed && c.claimants.indexOf(me) >= 0; });
        return modal('Your turn', '<div class="msgbox">' + pix(HOURGLASS, ART_PAL, 3) + '<div><p style="font-size:15px">It’s your turn, ' + esc(st.players[me].name) + '.</p><p class="small muted">Starting the turn gains ● and draws cards. Taking back a meeple replaces the whole turn: no ●, no draw, no plays.</p></div></div>' + recapHTML(st, me),
          (!ctx.online && ctx.hist.length ? '<button class="btn" data-act="undo">Undo my last action</button>' : '') + '<button class="btn" data-act="reclaimMode"' + (mine ? '' : ' disabled') + '>Take back a meeple instead</button><button class="btn def big" data-act="startTurn">Start my turn</button>');
      }
      return pd && pd.kind !== 'cell' && st.winner == null ? pendingModal(ctx) : '';
    }
    if (st.winner != null) return '';
    if (!st.turn.started && ui.mode !== 'reclaim' && !isBot(st, st.cur)) {
      var pl = st.players[st.cur];
      var hasClaims = E.keys(st).some(function (k) { var c = st.cards[E.top(st, k)]; return !c.fixed && c.claimants.indexOf(st.cur) >= 0; });
      return modal('Next turn', '<div class="msgbox">' + pix(HOURGLASS, ART_PAL, 3) + '<div><p style="font-size:15px"><span class="swatch" style="background:' + pl.color + ';width:14px;height:14px"></span> Pass the device to <b>' + esc(pl.name) + '</b> (' + esc(pl.arch) + ').</p><p class="small muted">Starting the turn gains ● and draws ' + (st.opts.drawPerTurn != null ? st.opts.drawPerTurn : 1) + ' card' + ((st.opts.drawPerTurn != null ? +st.opts.drawPerTurn : 1) === 1 ? '' : 's') + '. Taking back a meeple replaces the whole turn: no ●, no draw, no plays.</p></div></div>' + recapHTML(st, st.cur),
        (ctx.hist.length ? '<button class="btn" data-act="undo">Undo last action</button>' : '') + '<button class="btn" data-act="reclaimMode"' + (hasClaims ? '' : ' disabled') + '>Take back a meeple instead</button><button class="btn def big" data-act="startTurn">Start ' + esc(pl.name) + '’s turn</button>');
    }
    if (pd && pd.kind !== 'cell') return pendingModal(ctx);
    return '';
  }
  // Dialog for an engine prompt: choose cards, a suit, a player, yes/no, or resolve by hand. Asks to pass the device first if someone else must answer.
  function pendingModal(ctx) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending, who = st.players[pd.player];
    if (!canAnswer(ctx, pd)) return '';
    if (fixedSeat(ctx) == null && pd.kind !== 'cell' && pd.player !== st.cur && ui.passFor !== pd.player + ':' + st.log.length)
      return modal('Pass the device', '<p>Pass the device to <b>' + esc(who.name) + '</b> for a decision.</p>', '<button class="btn def" data-act="passOK" data-v="' + pd.player + ':' + st.log.length + '">I’m ' + esc(who.name) + '</button>');
    if (pd.kind === 'hand') {
      var hand = pd.options || who.hand, picked = ui.picked;
      return modal(who.name + ': choose cards', '<p>' + esc(pd.prompt) + ' (' + picked.length + ' of ' + pd.count + ' chosen)</p><div class="hand" style="flex-wrap:wrap">' + hand.map(function (u) {
        var weak = (E.archInfo(st)[who.arch] || {}).weakTo, isWeak = weak && E.rawDef(st, u).suit === weak;
        return '<div class="hcard' + (picked.indexOf(u) >= 0 ? ' pick' : '') + (isWeak ? ' weak' : '') + '"' + (isWeak ? ' title="Your weak suit: you can’t play this card"' : '') + '>' + defFace(E.rawDef(st, u), { mid: true, tex: u }) + (isWeak ? '<span class="weaktag">Weak suit</span>' : '') + '<button class="cellbtn" data-pick="' + u + '" aria-label="' + esc(E.rawDef(st, u).name) + '"></button></div>';
      }).join('') + '</div>', (st.res && !ctx.online ? '<button class="btn" data-act="cancelEffect">Cancel effect</button>' : '') + '<button class="btn def" data-act="answerHand"' + (picked.length === pd.count ? '' : ' disabled') + '>Confirm</button>');
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
  // Sandbox players, set from the Reset sandbox dialog.
  var sbSetup = { n: 2, arch: [] };
  // Create the sandbox, reusing the one saved in this browser unless a reset was asked for.
  function newSandbox() {
    var A = archetypes().map(function (c) { return c.archetype; });
    var ps = []; for (var i = 0; i < sbSetup.n; i++) ps.push({ name: 'Player ' + (i + 1), arch: sbSetup.arch[i] || A[i], color: COLORS[i] });
    var saved = lsGet('ks.sandbox');
    var st = saved && saved.opts && saved.opts.sandbox && !app._sbReset ? saved : E.newGame(app.lib, { players: ps, sandbox: true });
    app._sbReset = false;
    app.sandbox = newCtx(st, 'sandbox'); app.sandbox.ui.sbCard = Object.keys(st.defs)[0];
  }

  /* ----- library ----- */
  // Library page: filterable card table plus a preview.
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
      '<span class="grow" style="flex:1"></span><a class="btn" href="' + (ONLINE ? 'dithry/#cards' : 'dithry.html#cards') + '" target="_blank" rel="noopener" title="Paint the cards’ faces in Dithry">Paint cards</a><button class="btn" data-act="suits">Suit wheel</button>' + (ONLINE ? '<span class="muted small">' + app.lib.length + ' cards</span>' : '<button class="btn" data-act="newCard">New card</button><button class="btn" data-act="exportLib">Export…</button><button class="btn" data-act="importLib">Import…</button><button class="btn" data-act="restoreAsk">Restore starter cards…</button>') + '</div>';
    h += '<div class="split"><div class="sunken scroll"><table class="list small"><thead><tr>' +
      [['name', 'Name'], ['suit', 'Suit'], ['type', 'Type'], ['cost', 'Cost'], ['', 'Value'], ['', 'Income'], ['', 'Copies'], ['', 'Automation']].map(function (c) { return '<th' + (c[0] ? ' data-sort="' + c[0] + '"' : '') + '>' + c[1] + (L.sort === c[0] ? ' ▾' : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (c) {
      h += '<tr data-row="' + esc(c.id) + '" class="' + (L.sel === c.id ? 'sel' : '') + '"><td>' + esc(c.name) + '</td><td>' + icon(c.suit) + ' ' + esc(c.suit) + '</td><td>' + esc(c.type) + '</td><td>' + esc(c.cost) + '●</td><td>' + esc(scoreText(c.score)) + '</td><td>' + (+c.income ? c.income + '●' : '') + '</td><td>' + (c.type === 'Foundation' ? '—' : esc(c.copies)) + '</td><td>' + esc(autoSummary(c)) + '</td></tr>';
    });
    h += '</tbody></table>' + (rows.length ? '' : '<p class="pane muted">No cards match. Clear the filters or add a new card.</p>') + '</div>';
    var sel = L.sel && libById(L.sel);
    h += '<div class="raised pane">' + (sel ? '<div class="panelhead">Preview</div>' + defFace(sel, { big: true }) + (ONLINE ? '' : '<div class="row" style="margin-top:6px"><button class="btn def" data-act="editCard" data-id="' + esc(sel.id) + '">Edit</button><button class="btn" data-act="dupCard" data-id="' + esc(sel.id) + '">Duplicate</button><button class="btn" data-act="delCard" data-id="' + esc(sel.id) + '">Delete…</button></div>') : '<p class="muted">Select a card to preview it.</p>') + '</div></div></div>';
    return h;
  }
  // Short tag for how much of a card the engine automates.
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
  // Effect presets for the card builder: menu labels here, and the onPlay steps each one stands for in PRESET_STEPS.
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
  // Menu labels for score kinds and sight areas. A new kind also needs handling in engine.js.
  var SCORE_KINDS = { none: 'No ◇ value', flat: 'Flat value', perAdjacentSuit: 'Per adjacent card of a suit', perSuitInKingdom: 'Per card of a suit in your Kingdom', perSuitSplit: 'Per suit card in / outside your Kingdom', perBuriedInKingdom: 'Per buried card in your Kingdom', perDistinctSuitInKingdom: 'Per different suit in your Kingdom', largestRegion: 'Per card in largest Kingdom region', perCardNorth: 'Per card north in its column', flatDoubledIfSurrounded: 'Flat, doubled if fully surrounded', flatMinusPerAdjacentNotOwned: 'Flat minus per neighbor you don’t own', flatMinusPerExtraClaimant: 'Flat minus per extra claimant', flatPlusTokens: 'Flat plus tokens on the card' };
  var SEES = { none: 'Nothing', adjacent: 'Adjacent (4 sides)', surround8: 'All 8 around', north: 'Column to the north', east1: 'Card directly east', ring3: 'Cards 3 spaces away', kingdom: 'Owner’s Kingdom', adjacentToOwn: 'Cards next to the owner’s cards', westOfOwn: 'Cards west of the owner’s cards', board: 'Whole board' };
  // Which preset matches a card's steps ("custom" if none does).
  function presetOf(steps) { var s = JSON.stringify(steps || []); if (s === '[]') return ''; for (var k in PRESET_STEPS) if (JSON.stringify(PRESET_STEPS[k]) === s) return k; return 'custom'; }
  function openBuilder(card) { app.builder = { card: normalizeCard(clone(card)), orig: card.id || null, json: JSON.stringify(card.onPlay || [], null, 1), jsonErr: null }; app.page = 'builder'; render(); }
  // Card builder form. Inputs carry data-b="field.path"; builderChange applies each edit.
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
    h += '<label>Artwork</label><span class="row"><input type="file" accept="image/*" data-art="1">' + (c.art ? '<button class="btn sm" data-act="clearArt">Remove art</button>' : '') + '<span class="small muted">Scaled down to fit in the library. Pixel art stays crisp: <a href="dithry.html" target="_blank" rel="noopener">draw some in Dithry</a>.</span></span>' +
      '<label>Card face</label><span class="small">' + (FACES[c.id] ? 'Painted. ' : 'The plain suit texture. ') + (B.orig ? '<a href="dithry.html#card=' + encodeURIComponent(c.id) + '" target="_blank" rel="noopener">Paint this card in Dithry</a>: the whole face, in hand and on the board, behind its text.' : 'Save the card, then you can paint its whole face in Dithry.') + '</span>';
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
  // Apply one form edit to the card being built. Returns true when the form needs redrawing.
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
  // The "Extra ● once" field is stored as a gainAP step at the start of onPlay.
  function gainOf(c) { var g = (c.onPlay || []).filter(function (s) { return s.do === 'gainAP'; })[0]; return g ? g.n : ''; }
  function withGain(steps, g) { steps = (steps || []).filter(function (s) { return s.do !== 'gainAP'; }); if (g) steps.unshift({ do: 'gainAP', n: g }); return steps; }
  // Turn a name into an id: lowercase letters, digits and dashes.
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  // Check and save the card being built (under a new id when saving a copy).
  function commitBuilder(asCopy) {
    var B = app.builder, c = clone(B.card);
    if (!c.name.trim()) { toast('Give the card a name before saving.'); return; }
    if (asCopy || !B.orig) { var base = slug(c.id || c.name) || 'card', id = base, n = 2; while (libById(id) && (asCopy || id !== B.orig)) id = base + '-' + (n++); c.id = id; if (asCopy) c.name = c.name + (B.card.name === c.name && libById(B.card.id) ? ' (copy)' : ''); }
    if (!c.id) { toast('The card needs an id.'); return; }
    if (c.place !== 'diag' && (!c.place || !c.place.length)) { toast('Allow at least one side to touch.'); return; }
    var p = saveCard(c); B.orig = c.id; B.card = normalizeCard(clone(c)); app.libUI.sel = c.id;
    p.then(function () { toast('Saved ' + c.name + '.'); });
  }
  // Shrink an uploaded image so the library stays small. Pixel art (256 colours or fewer, like Dithry's exports) is
  // kept as a PNG, scaled down by whole steps without smoothing so its pixels stay sharp; photos become a 320px JPEG.
  function isPixelArt(cx, w, h) {
    if (w * h > 1024 * 1024) return false;
    var d = cx.getImageData(0, 0, w, h).data, seen = {}, n = 0;
    for (var i = 0; i < d.length; i += 4) { var k = d[i] << 24 ^ d[i + 1] << 16 ^ d[i + 2] << 8 ^ d[i + 3]; if (!seen[k]) { seen[k] = 1; if (++n > 256) return false; } }
    return true;
  }
  function downscale(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image(); img.onload = function () {
        var max = 320, cv = document.createElement('canvas'), cx = cv.getContext('2d');
        cv.width = img.width; cv.height = img.height; cx.drawImage(img, 0, 0);
        if (isPixelArt(cx, cv.width, cv.height)) {
          var step = Math.ceil(Math.max(img.width, img.height) / max);
          if (step > 1) { var sm = document.createElement('canvas'), sx = sm.getContext('2d'); sm.width = Math.ceil(img.width / step); sm.height = Math.ceil(img.height / step); sx.imageSmoothingEnabled = false; sx.drawImage(img, 0, 0, sm.width, sm.height); cv = sm; }
          return cb(cv.toDataURL('image/png'));
        }
        var s = Math.min(1, max / Math.max(img.width, img.height));
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.72));
      }; img.onerror = function () { toast('That file could not be read as an image.'); }; img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ----- patch notes ----- */
  // KPatch (src/patchnotes.js) lists the updates, newest first. Players who've played before see the newest one in
  // a small "What's new" window the first time they open the game after an update, unless they've turned it off.
  function patchToggle() {
    return prefs.patchNotes === false ? 'Update messages are off. <button class="btn sm" data-act="patchOn">Show what’s new after updates</button>'
      : 'After an update, a short “What’s new” appears when you open the game. <button class="btn sm" data-act="patchOff">Don’t show these</button>';
  }
  function notesList(list) { return list.map(function (n) { return '<section class="patch"><h2>' + esc(n.title) + '</h2><div class="small muted">' + esc(n.date) + '</div><ul>' + n.notes.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></section>'; }).join(''); }
  function notesPage() {
    lsSet('ks.seenPatch', KPatch[0].v); hidePatchPop();
    return '<div class="page scroll"><div class="pane help notes"><h2 class="plain" style="font-size:20px">Patch notes</h2><p class="small">' + patchToggle() + '</p>' + notesList(KPatch) + '</div></div>';
  }
  // The "What's new" window: shown once per update, to returning players, unless turned off.
  var patchPop = null;
  function maybePatchPopup() {
    var seen = lsGet('ks.seenPatch'), latest = KPatch[0].v;
    if (seen === latest) return;
    var returning = seen != null || ['ks.game', 'ks.setup', 'ks.lib', 'ks.faces', 'ks.token'].some(function (k) { return lsGet(k) != null; });
    if (!returning || prefs.patchNotes === false) { lsSet('ks.seenPatch', latest); return; }   // a first visit: nothing to catch up on
    var newer = KPatch.filter(function (n) { return seen == null ? n === KPatch[0] : n.v > seen; }).slice(0, 2);
    patchPop = document.createElement('div'); patchPop.className = 'patchpop raised'; patchPop.setAttribute('role', 'status');
    patchPop.innerHTML = '<div class="titlebar">' + crest() + '<span>What’s new</span><span class="grow"></span><button class="btn tb" data-act="notesDismiss" aria-label="Close">×</button></div><div class="body">' + notesList(newer) + '</div>' +
      '<div class="btns"><label class="small"><input type="checkbox" id="patchOffBox"> Don’t show patch notes</label><span class="grow"></span><button class="btn" data-page="notes">All patch notes</button><button class="btn def" data-act="notesDismiss">Got it</button></div>';
    document.body.appendChild(patchPop);
  }
  function hidePatchPop() {
    if (!patchPop) return;
    var off = patchPop.querySelector('#patchOffBox'); if (off && off.checked) setPref('patchNotes', false);
    patchPop.remove(); patchPop = null; lsSet('ks.seenPatch', KPatch[0].v);
  }

  /* ----- help ----- */
  // The Help page (static text).
  /* ----- help ----- */
  // Help is a list of short sections with a table of contents; each section says which edition it belongs to
  // (online: the public site only; table: the playtest table only).
  function helpSections() {
    var tap = 'Click (or tap)', dithry = ONLINE ? 'dithry/' : 'dithry.html';
    var S = [
      { id: 'start', title: 'Quick start', html: '<ol>' +
        (ONLINE ? '<li>On <b>Home</b>, choose <b>Single player</b> (against bots), <b>Pass-and-Play</b> (one device) or <b>Online</b>.</li>' : '<li>Open <b>New game</b>, pick 2–5 players and their archetypes, and press <b>Start game</b>.</li>') +
        '<li>On your first turn, play your <b>Foundation</b>: drag it onto the board.</li>' +
        '<li>Play more cards next to your cards, then <b>claim</b> one with a meeple.</li>' +
        '<li>Press <b>End turn</b>. The first to <b>48◇</b> at the end of their turn wins.</li></ol>' +
        '<p class="muted">The hint line above the board suggests a next step while you learn.</p>' },
      { id: 'turn', title: 'A turn', html: '<ol>' +
        '<li><b>Start your turn.</b> You gain ● from your Kingdom (3● before your Foundation is down) and draw 2 cards. Or take back one meeple instead: that is your whole turn.</li>' +
        '<li><b>Play cards</b> while your ● lasts. Green-bordered cards in your hand are ones you can afford.</li>' +
        '<li><b>Claim once:</b> the card you just placed, or an unclaimed card next to it. It produces its ● right away.</li>' +
        '<li>Any time: <b>Discard 2, draw 1</b>.</li>' +
        '<li><b>End turn.</b> At 48◇ or more, you win.</li></ol>' },
      { id: 'play', title: 'Playing cards', html: '<ul>' +
        '<li><b>Placing:</b> drag a card onto a <b>green space</b>, or ' + tap.toLowerCase() + ' the card, then the space. The number on the space is the cost there.</li>' +
        '<li><b>Where it fits:</b> next to another card, on a side its placement icon allows (✛ any side; arrows for some sides; ✕ corners only). The other sides must be clear.</li>' +
        '<li><b>Your Foundation</b> must be down by turn 3. It is always yours and needs no meeple.</li>' +
        '<li><b>Weak suit:</b> your archetype can’t play the suit it is weak to.</li>' +
        '<li><b>Actions and Blessings</b> either go in a space or are played straight from hand (<b>Play it</b>); then they are buried under a card they affected. <b>Curses</b> tuck under their target.</li>' +
        '<li>A card you can’t play says why on the card.</li></ul>' },
      { id: 'claim', title: 'Claiming and meeples', html: '<ul>' +
        '<li>When a claim is open, cards you can claim have an <b>orange outline</b>. Drag your meeple onto one, or ' + tap.toLowerCase() + ' it.</li>' +
        '<li>A claimed card is in your <b>Kingdom</b>: it scores ◇ for you and produces ● each turn.</li>' +
        '<li>Out of meeples? <b>Take one back</b> at the start of a turn, instead of taking the turn.</li></ul>' },
      { id: 'suits', title: 'Suits and Overwhelm', html: suitWheelHTML(app.lib) + '<ul>' +
        '<li>A card is <b>Overwhelmed</b> when enough cards of suits that pressure it surround it: 3 (Encampment 4; a Foundation 8, counting diagonals). Different pressuring suits add up.</li>' +
        '<li>Ruined and Overwhelmed cards keep their suit but lose their effects and owner; meeples go home. An Overwhelmed Foundation knocks its player out.</li></ul>' },
      { id: 'board', title: 'Reading the board', html: '<ul>' +
        '<li><b>Select a card</b> to see it full size. Yellow outlines show what its rules look at (filled = counted now); <b>What sees it</b> outlines, in blue, the cards that look at it.</li>' +
        '<li>The <b>n/3 tag</b> counts a card’s enemy neighbours against its Overwhelm number; it turns red one step before.</li>' +
        '<li><b>Chevrons</b> in the gaps show pressure: they point at the card being pressed, in the colour of the suit pressing it. One step from Overwhelm they grow and go solid.</li>' +
        '<li>A <b>bright green border</b> on a board card: an ability you can use now. Select it and use the button in the card panel.</li>' +
        '<li><b>Overlays:</b> <b>Quickview</b> shows each card’s ● and ◇ in its owner’s colour; <b>War</b> fills one strip per enemy it takes to Overwhelm a card.</li>' +
        '<li><b>Log colours:</b> blue plays, green claims, amber ●, gold ◇, red Ruin and Overwhelm, purple Curses, grey card movement.</li></ul>' },
      { id: 'controls', title: 'Controls', html: '<h3>Mouse</h3><p>Hover any card for a magnified copy. Drag cards from your hand onto the board, your meeple onto a card to claim it, and two cards onto the discard pile to discard 2 and draw 1. Clicking works for all of it.</p>' +
        '<h3>Phones and tablets</h3><p>Your numbers and <b>End turn</b> are along the top, your hand along the bottom, and <b>Players</b>, <b>Log</b>, <b>Card</b> and <b>Menu</b> are tabs. Pinch to zoom, drag the board to move, tap a card for its details, and press and hold a card to read it.</p>' +
        '<h3>Keyboard shortcuts</h3>' + keysTable() },
      { id: 'comforts', title: 'Hints and settings', html: '<ul>' +
        '<li><b>Hints</b> suggest a next step on your turn.</li>' +
        '<li>Ending a turn while you could still play or claim a card <b>asks once</b>.</li>' +
        '<li>When your turn comes round, the dialog shows <b>what everyone else did</b>.</li>' +
        '<li><b>⇅ Sort</b> orders your hand as drawn, by suit or by cost.</li>' +
        '<li>Against bots, <b>Bots</b> above the board sets how fast they play. A finished game offers a <b>Rematch</b>.</li></ul>' +
        '<p>' + patchToggle() + '</p>' +
        '<p>Hints and the end-turn check are ' + (prefs.hints === false || prefs.confirmEnd === false ? 'off. <button class="btn sm" data-act="showHints">Turn them back on</button>' : 'on. <button class="btn sm" data-act="hideHintsAll">Turn them off</button>') + '</p>' },
      { id: 'modes', title: 'Ways to play', only: 'online', html: '<ul>' +
        '<li><b>Single player:</b> on <b>Play locally</b>, set any seat to a greedy, tactician, warlord or genius bot.</li>' +
        '<li><b>Pass-and-Play:</b> one device, passed between turns.</li>' +
        '<li><b>Online:</b> join a public table or start a private one and share its code. Archetypes are first come, first served; the host starts. You only see your own hand. Lose your connection and you have two minutes to return; leaving a game counts as a loss.</li>' +
        '<li><b>Profile</b> keeps your record, most played archetypes and cards, and recent games. <b>Cards</b> lists every card.</li></ul>' },
      { id: 'modes', title: 'Ways to play', only: 'table', html: '<ul>' +
        '<li><b>New game:</b> hot-seat on one device; any seat can be a bot.</li>' +
        '<li><b>Sandbox:</b> place any card anywhere and watch scores and Overwhelm update.</li>' +
        '<li><b>Library</b> lists every card; <b>Card builder</b> edits one: how it scores, what it sees, where it may touch, its Overwhelm number, what it does when played, and any ability. Saved cards go to the shared library when there is one, otherwise to this browser. Games keep the card set they started with.</li></ul>' },
      { id: 'app', title: 'Install as an app', only: 'online', html: '<p>Play full screen from your home screen: <b>Install app</b> on the Home page (Android, or Chrome and Edge on a computer), or on iPhone and iPad tap <b>Share → Add to Home Screen</b>. Single player and pass-and-play then work offline.</p>' },
      { id: 'art', title: 'Card art', html: '<p><a href="' + dithry + '" target="_blank" rel="noopener">Dithry</a> is a pixel-art paint tool in the game’s dithered style. Its card mode (<b>Paint cards</b> in the ' + (ONLINE ? 'Cards' : 'Library') + ' page) paints each card’s face, in hand and on the board, behind its text; saving shows it here straight away.</p>' +
        (ONLINE ? '' : '<p>For a card’s small art band, export a 64 × 24 picture from Dithry at 1× and choose it under <b>Artwork</b> in the Card builder.</p>') },
      { id: 'referee', title: 'Referee and undo', html: '<p>' + (ONLINE ? 'In pass-and-play games, every' : 'Every') + ' card on the board has <b>Referee tools</b>: Ruin or flip back, change suit, move, remove, bury, tokens and claims, for anything the rules don’t automate. <b>Undo</b> steps back one action at a time. ' + (ONLINE ? 'Online games have neither: the server enforces the rules.' : 'An effect can be cancelled from the prompt bar.') + '</p>' },
      { id: 'saving', title: 'Saving and bug reports', html: '<ul><li>The current game' + (ONLINE ? '' : ' and the sandbox') + ' are kept in this browser and survive a reload.</li>' +
        (ONLINE ? '' : '<li><b>Copy current game as text</b> on the New game page gives a save you can paste back later.</li>') +
        '<li><b>Copy debug report</b> above the board copies the log, the board and every card’s state, ready to paste into a bug report.</li></ul>' },
      { id: 'variants', title: 'Rule variants', html: '<p class="muted">On by default; each can be switched off when you set up a game.</p><ul>' +
        '<li><b>Seat start:</b> later seats get more ● on their first turn (3, 6, 9, 12, 15).</li>' +
        '<li><b>Deep foundations:</b> each same-suit card buried under a card raises its Overwhelm number by 1.</li>' +
        '<li><b>Defense tokens:</b> every 2 same-suit cards buried under a card give it a token that stops one Ruin or Curse.</li>' +
        '<li><b>Building discount:</b> placing next to a card you own costs 3● less.</li>' +
        '<li><b>No wandering:</b> a card can’t move to a space that touches no other card.</li>' +
        '<li><b>Ascension:</b> a stack holding five different suits Ascends: invulnerable, every suit, +8◇ and +12●.</li></ul>' },
      { id: 'notes', title: 'Patch notes', html: '<p>What changed in each update: <button class="linkbtn" data-page="notes">Patch notes</button>. The newest is <b>' + esc(KPatch[0].title) + '</b> (' + esc(KPatch[0].date) + ').</p>' },
      { id: 'rulings', title: 'Rulings in this version', html: '<p class="muted">Where a card’s text left room for doubt, the game does this:</p><ul>' +
        '<li><b>Foundations</b> can’t be targeted by other cards; only Overwhelm takes one down.</li>' +
        '<li><b>Cathedral</b> counts Sceptre cards in your Kingdom. <b>Gluttony</b> stays a Blessing.</li>' +
        '<li><b>Spice Caravan</b> moves at the end of its owner’s turn, East first, then West; unclaimed, it stays. <b>Acorn</b> gains a token (1◇ and 1●) at the end of its owner’s turn.</li>' +
        '<li><b>Sleeping Giant</b> moves into the space of the card that moved or was Ruined. Burying a card ends its claims.</li>' +
        '<li><b>Rear Guard</b> swaps in automatically for its owner’s cards. <b>Ballroom</b>’s draw is automatic.</li>' +
        '<li><b>Revenge</b> can only be revealed when a card you own is Overwhelmed, and is then discarded.</li>' +
        '<li><b>Confessional</b> removes a Curse from a card on the board or from your hand. A refused <b>University</b> swap parks one of your meeples on it until it leaves play.</li>' +
        '<li>A card set aside by <b>Last Will and Testament</b> comes back at the start of your next turn, free that turn only.</li>' +
        '<li><b>Seizure</b> puts the other revealed cards on the bottom of the deck; <b>Inquisition</b> discards them.</li>' +
        '<li><b>Topiary</b> copies value, income and abilities, not one-time effects. <b>Watchtower</b>’s extra cost applies to the 4 spaces beside it. <b>Living Death</b> takes the card directly under the top card.</li></ul>' }
    ];
    return S.filter(function (x) { return !x.only || (x.only === 'online') === ONLINE; });
  }
  function helpPage() {
    var S = helpSections();
    var toc = '<nav class="helptoc raised" aria-label="Help contents"><div class="panelhead">Contents</div><ol>' + S.map(function (x) { return '<li><button class="linkbtn" data-help="' + x.id + '">' + esc(x.title) + '</button></li>'; }).join('') + '</ol></nav>';
    var body = S.map(function (x) { return '<section class="helpsec" id="help-' + x.id + '"><h2>' + esc(x.title) + '</h2>' + x.html + '<p class="totop"><button class="linkbtn small" data-help="top">↑ Contents</button></p></section>'; }).join('');
    return '<div class="page scroll" id="helpscroll"><div class="helpwrap">' + toc + '<div class="pane help">' + body + '</div></div></div>';
  }

  /* ---------------- bots (single player) ---------------- */
  // Bot styles a seat can be given on the New game page (KBots also has 'raider', used by the simulator).
  var BOT_CHOICES = ['greedy', 'tactician', 'warlord', 'genius'];
  var BOT_NAMES = { greedy: 'Greedy bot', tactician: 'Tactician bot', warlord: 'Warlord bot', raider: 'Raider bot', genius: 'Genius bot' };
  // The bot that must act now, or null: whoever a prompt or a revealed hand waits on, else the current player.
  function botToAct(st) {
    if (st.winner != null) return null;
    var p = st.pending ? st.pending.player : st.reveal ? st.reveal.to : st.cur;
    return isBot(st, p) ? p : null;
  }
  // Keep the bots moving: one action per tick, so each play shows up on the board and in the log.
  // window.ksBotDelay (ms) overrides the pause, e.g. 0 in tests.
  function botDriver(ctx) {
    if (!ctx || ctx.online || ctx.kind !== 'game' || ctx !== app.game || ctx.botTimer || botToAct(ctx.state) == null) return;
    ctx.botTimer = setTimeout(function () { botStep(ctx); }, typeof window.ksBotDelay === 'number' ? window.ksBotDelay : BOT_SPEED[prefs.botSpeed] != null ? BOT_SPEED[prefs.botSpeed] : 650);
  }
  // A bot plans its whole turn once (KBots.plan), then plays it out an action at a time. The plan is dropped when
  // anything else changed the game in between (a human answered a prompt), and the bot plans again from there.
  function botStep(ctx) {
    ctx.botTimer = null;
    if (app.game !== ctx || app.page !== 'game') return;
    var st = ctx.state, p = botToAct(st); if (p == null) { ctx.botQueue = null; return; }
    var pd = st.pending, a = null;
    if (ctx.botQueue && ctx.botQueue.length && ctx.botExpect === st) a = ctx.botQueue.shift();
    if (a && a.t === 'answer' && !(pd && pd.player === ctx.botQueueFor)) a = null;   // the plan answered for someone else: they answer themselves
    if (!a) {
      ctx.botQueue = null;
      // The Genius thinks for a second or two: show it, then think on the next tick.
      var who = pd ? pd.player : p;
      if (!(st.reveal && !pd) && st.players[who].bot === 'genius' && ctx.thinkFor !== st) { ctx.thinkFor = st; ctx.thinking = who; render(); ctx.botTimer = setTimeout(function () { botStep(ctx); }, 30); return; }
      if (st.reveal && !pd) a = { t: 'closeReveal' };
      else if (pd) a = { t: 'answer', v: KBots.choose(st, pd.player, st.players[pd.player].bot) };
      else { ctx.botQueue = KBots.plan(st, st.players[p].bot); ctx.botQueueFor = p; a = ctx.botQueue.shift(); }
    }
    if (E.apply(st, a).error) {          // shouldn't happen; fall back to something legal rather than stall
      ctx.botQueue = null;
      a = pd ? { t: 'answer', v: pd.kind === 'cell' ? (pd.options[0] || null) : pd.kind === 'confirm' ? false : pd.kind === 'hand' ? (pd.options || st.players[pd.player].hand).slice(0, pd.count) : pd.options ? pd.options[0] : true }
        : { t: st.turn.started ? 'endTurn' : 'startTurn' };
      if (E.apply(st, a).error) { ctx.err = st.players[p].name + ' is stuck. Use the referee tools or Undo.'; render(); return; }
    }
    ctx.thinking = null; dispatch(ctx, a); ctx.botExpect = ctx.state;
  }

  /* ---------------- online play (public site only) ---------------- */
  // Connection, account, server list and room. N.ctx is the running online game: a normal game context
  // with ctx.online = true and ctx.me = your seat. Its state comes from the server, already redacted.
  var N = app.net = { started: false, status: 'off', server: '', user: null, token: lsGet('ks.token'), lobbies: [], room: null, defs: null, ctx: null,
    form: { name: '', pw: '', table: '', priv: false, max: '4', code: '', server: '' }, authErr: null, profile: null, profileFor: null, viewing: null, joinCode: null };

  function netStart() {
    if (N.started) return; N.started = true;
    N.server = KNet.connect(onNet);
    N.status = N.server ? 'connecting' : 'none';
  }
  // Every message from the server lands here.
  function onNet(m) {
    switch (m.t) {
      case '_open': N.status = 'on'; KNet.send({ t: 'hello', token: N.token }); break;
      case '_close': N.status = 'down'; break;
      case 'welcome':
        N.user = m.user; N.guest = !!m.guest; N.room = null;          // the server re-sends the room if we're still in one
        if (!m.user && N.token) { N.token = null; lsDel('ks.token'); }
        if (m.user && N.joinCode) { KNet.send({ t: 'join', code: N.joinCode }); N.joinCode = null; }
        break;
      case 'lobbies': N.lobbies = m.list; break;
      case 'room': N.room = m.room; if (m.room.status === 'lobby') N.ctx = null; break;
      case 'left': N.room = null; N.ctx = null; N.defs = null; break;
      case 'defs': N.defs = m.defs; N.ctx = null; break;
      case 'state': onlineState(m.state, m.seat); return;
      case 'error': if (N.ctx && N.room && N.room.status !== 'lobby') { N.ctx.err = m.msg; break; } toast(m.msg); return;
    }
    render();
  }
  // A new game state from the server: animate the difference, like a local move.
  function onlineState(st, seat) {
    st.defs = N.defs || {};
    var ctx = N.ctx, prev = ctx && ctx.state;
    if (!ctx) { ctx = N.ctx = newCtx(st, 'game'); ctx.online = true; ctx.me = seat; }
    else ctx.state = st;
    if (prev && prev.cur !== st.cur) { ctx.ui.hand = null; ctx.ui.mode = null; ctx.ui.swap = null; }
    var fx = prev ? FX.diff(ctx, prev, st, { t: 'remote' }) : [];
    render(); if (app.page === 'online') FX.run(fx); maybeAutoEnd(ctx);
  }
  function isConnected(name) { var p = N.room && N.room.players.filter(function (q) { return q.name === name; })[0]; return !p || p.connected; }

  function netAuth(kind) {
    var f = N.form; N.authErr = null;
    KNet.api('/api/' + kind, { name: f.name.trim(), password: f.pw }).then(function (r) {
      if (r.error) { N.authErr = r.error; render(); return; }
      N.token = r.token; lsSet('ks.token', r.token); f.pw = ''; N.profileFor = null;
      KNet.send({ t: 'hello', token: r.token });
    }).catch(function () { N.authErr = 'Can’t reach the game server.'; render(); });
  }
  // Host options in the lobby: read every option field and send them together.
  function sendOpts() {
    var o = {}, max = null;
    document.querySelectorAll('[data-netopt]').forEach(function (el) { var k = el.getAttribute('data-netopt'); if (k === 'max') max = +el.value; else o[k] = el.type === 'checkbox' ? el.checked : el.value; });
    KNet.send({ t: 'opts', opts: o, max: max });
  }
  function inviteLink() { return location.origin + location.pathname + location.search + '#join=' + (N.room && N.room.code); }
  function netAct(a, t) {
    var f = N.form;
    switch (a) {
      case 'netLogin': case 'netRegister': netAuth(a === 'netLogin' ? 'login' : 'register'); return;
      case 'netGuest': netAuth('guest'); return;
      case 'netLogout':
        if (N.room) KNet.send({ t: 'leave' });
        KNet.api('/api/logout', { token: N.token }).catch(function () { });
        N.token = null; lsDel('ks.token'); N.user = null; N.room = null; N.ctx = null; N.viewing = null; N.profileFor = null;
        KNet.send({ t: 'hello', token: null }); render(); return;
      case 'netCreate': KNet.send({ t: 'create', name: f.table, private: !!f.priv, max: +f.max || 4 }); return;
      case 'netJoin': KNet.send({ t: 'join', id: t.getAttribute('data-id') }); return;
      case 'netJoinCode': if (f.code.trim()) KNet.send({ t: 'join', code: f.code.trim() }); return;
      case 'netRefresh': KNet.send({ t: 'list' }); return;
      case 'netPick': KNet.send({ t: 'pick', arch: t.getAttribute('data-arch') || null }); return;
      case 'netStart': KNet.send({ t: 'start' }); return;
      case 'netAgain': KNet.send({ t: 'again' }); return;
      case 'netLeave':
        if (N.room && N.room.status === 'playing' && N.ctx && !N.ctx.state.players[N.ctx.me].out) {
          app.modal = function () { return modal('Leave the game?', '<p>Leaving now counts as a loss, and you can’t come back to this game.</p>', '<button class="btn" data-act="closeModal">Stay</button><button class="btn def" data-act="netLeaveYes">Leave</button>'); };
          render(); return;
        }
        KNet.send({ t: 'leave' }); return;
      case 'netLeaveYes': app.modal = null; KNet.send({ t: 'leave' }); render(); return;
      case 'netServer': KNet.setServer((f.server || '').trim()); location.reload(); return;
      case 'netServerReset': KNet.setServer(''); location.reload(); return;
      case 'viewProfile': N.viewing = t.getAttribute('data-name'); N.profileFor = null; app.page = 'profile'; render(); return;
      case 'myProfile': N.viewing = null; N.profileFor = null; render(); return;
      case 'copyInvite': copyText(inviteLink(), function (ok) { toast(ok ? 'Invite link copied.' : 'Invite link: ' + inviteLink()); }); return;
    }
  }

  /* ----- home ----- */
  function homePage() {
    var saved = !app.game && lsGet('ks.game'), resume = app.game ? '<button class="btn big" data-page="game">Back to your game</button>' : saved && saved.players && saved.winner == null ? '<button class="btn big" data-act="resume">Resume saved game</button>' : '';
    return '<div class="page scroll"><div class="home">' + logoHTML() + fleuron() +
      '<p>An asymmetric tableau-building card game for 2–5 players. Six archetypes share one board: build your Kingdom, claim cards with your meeples, and Overwhelm your rivals. First to the victory target wins.</p>' +
      '<div class="choices"><div class="choice raised"><h2>Single player</h2><p>Play against the computer. Choose each opponent: greedy, tactician, warlord or genius bot.</p><div class="row"><button class="btn def big" data-act="soloSetup">Play vs bots</button>' + resume + '</div></div>' +
      '<div class="choice raised"><h2>Pass-and-Play</h2><p>Everyone plays on this device and passes it between turns. Nothing to sign up for.</p><div class="row"><button class="btn def big" data-act="hotseatSetup">New game</button></div></div>' +
      '<div class="choice raised"><h2>Online Multiplayer</h2><p>Join a public table from the server list, or start a private one and share its code. Your profile tracks your record.</p><div class="row"><button class="btn def big" data-page="online">Play online</button></div></div></div>' +
      appBox() +
      '<p class="small muted">New here? Read the <button class="linkbtn" data-page="help">rules and help</button> (and <button class="linkbtn" data-page="notes">what’s new</button>) or browse the <button class="linkbtn" data-page="library">cards</button>. Want to draw in this style? Try <a href="dithry/" target="_blank" rel="noopener">Dithry</a>, the pixel-art and dithered-gradient paint tool.</p></div></div>';
  }

  /* ----- online: sign in, server list, lobby, game ----- */
  function onlinePage() {
    netStart();
    var h = '<div class="page scroll"><div class="pane online">', end = '</div></div>';
    if (N.status === 'none') return h + '<h2>Online play</h2><p>This copy of the site isn’t connected to a game server yet.</p>' + serverForm(true) + end;
    if (N.status !== 'on' && !N.room) return h + '<h2>Online play</h2><p>' + (N.status === 'down' ? 'Can’t reach the game server at <code>' + esc(N.server) + '</code>. Retrying…' : 'Connecting to the game server…') + '</p>' + serverForm(false) + end;
    if (!N.user) return h + '<h2>Sign in to play online</h2><p class="muted">Your profile keeps your win/loss record, most played archetypes and cards, and recent games.</p>' + authForm() + end;
    if (N.room && N.room.status !== 'lobby') return N.ctx ? gamePage(N.ctx) : h + '<p>Loading the game…</p>' + end;
    if (N.room) return h + roomHTML() + end;
    return h + serverListHTML() + end;
  }
  function serverForm(open) {
    return '<details' + (open ? ' open' : '') + ' class="small" style="margin-top:8px"><summary>Game server</summary><div class="row" style="margin-top:4px"><input type="text" data-nf="server" data-focus-key="nf-server" placeholder="https://your-server.example.com" style="width:300px" value="' + esc(N.form.server || N.server) + '">' +
      '<button class="btn" data-act="netServer">Use this server</button>' + (N.server ? '<button class="btn" data-act="netServerReset">Reset</button>' : '') + '</div></details>';
  }
  function authForm() {
    var f = N.form;
    return '<div class="form" style="max-width:420px"><label>Name</label><input type="text" data-nf="name" data-focus-key="nf-name" autocomplete="username" value="' + esc(f.name) + '">' +
      '<label>Password</label><input type="password" data-nf="pw" data-focus-key="nf-pw" autocomplete="current-password" value="' + esc(f.pw) + '"></div>' +
      (N.authErr ? '<p class="err">' + esc(N.authErr) + '</p>' : '') +
      '<div class="row" style="margin-top:8px"><button class="btn def" data-act="netLogin">Sign in</button><button class="btn" data-act="netRegister">Create profile</button>' +
      '<span class="small muted">Names: 3–16 letters, digits, _ or -. Passwords: 6 or more characters.</span></div>' +
      '<div class="row guestrow"><button class="btn" data-act="netGuest">Log in as guest</button><span class="small muted">No sign-up: jump straight in under a made-up name. Guests don’t get a profile or saved stats.</span></div>';
  }
  function serverListHTML() {
    var f = N.form, h = '<div class="row spread"><h2>Server list</h2><span class="small">' + (N.guest ? 'Playing as guest <b>' + esc(N.user) + '</b>' : 'Signed in as <button class="linkbtn" data-act="viewProfile" data-name="' + esc(N.user) + '">' + esc(N.user) + '</button>') + ' · <button class="linkbtn" data-act="netLogout">Sign out</button></span></div>';
    h += '<table class="list small"><thead><tr><th>Table</th><th>Host</th><th>Players</th><th>Status</th><th><button class="btn sm" data-act="netRefresh">Refresh</button></th></tr></thead><tbody>';
    if (!N.lobbies.length) h += '<tr><td colspan="5" class="muted">No public tables right now. Start one below.</td></tr>';
    N.lobbies.forEach(function (r) {
      var open = r.status === 'lobby' && r.players < r.max;
      h += '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.host) + '</td><td>' + r.players + '/' + r.max + '</td><td>' + (r.status === 'lobby' ? (open ? 'Waiting for players' : 'Full') : r.status === 'playing' ? 'Playing' : 'Finished') + '</td>' +
        '<td><button class="btn sm' + (open ? ' def' : '') + '" data-act="netJoin" data-id="' + esc(r.id) + '"' + (open ? '' : ' disabled') + '>Join</button></td></tr>';
    });
    h += '</tbody></table><div class="split2"><fieldset><legend>Start a table</legend><div class="form">' +
      '<label>Name</label><input type="text" data-nf="table" data-focus-key="nf-table" maxlength="40" placeholder="' + esc(N.user + '’s table') + '" value="' + esc(f.table) + '">' +
      '<label>Seats</label><select data-nf="max">' + ['2', '3', '4', '5'].map(function (n) { return '<option' + (n === String(f.max) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
      '<label>Visibility</label><span class="col" style="gap:2px"><label><input type="radio" name="vis" data-nf="priv" value="0"' + (f.priv ? '' : ' checked') + '> Public: shown in the server list</label>' +
      '<label><input type="radio" name="vis" data-nf="priv" value="1"' + (f.priv ? ' checked' : '') + '> Private: join with a code</label></span></div>' +
      '<div class="row" style="margin-top:6px"><button class="btn def" data-act="netCreate">Create table</button></div></fieldset>' +
      '<fieldset><legend>Join a private table</legend><div class="row"><input type="text" data-nf="code" data-focus-key="nf-code" maxlength="6" placeholder="CODE" class="codein" value="' + esc(f.code) + '"><button class="btn def" data-act="netJoinCode">Join</button></div>' +
      '<p class="small muted">Ask the host for the 6-character code, or open their invite link.</p></fieldset></div>';
    return h;
  }
  function roomHTML() {
    var r = N.room, me = N.user, host = r.host === me, h = '', o = r.opts, dis = host ? '' : ' disabled';
    h += '<div class="row spread"><h2 class="plain">' + esc(r.name) + '</h2><button class="btn" data-act="netLeave">Leave table</button></div>';
    h += '<p class="small">' + (r.private ? 'Private table. Share the code <b class="code">' + esc(r.code) + '</b> or <button class="linkbtn" data-act="copyInvite">copy an invite link</button>.' : 'Public table: anyone can join from the server list.') + '</p>';
    h += '<fieldset><legend>Players ' + r.players.length + '/' + r.max + ' (turn order, top to bottom)</legend>' + r.players.map(function (p, i) {
      return '<div class="row" style="margin:2px 0"><span class="swatch" style="background:' + COLORS[i] + '"></span><button class="linkbtn" data-act="viewProfile" data-name="' + esc(p.name) + '">' + esc(p.name) + '</button>' +
        (p.name === r.host ? '<span class="tag">host</span>' : '') + (p.connected ? '' : '<span class="tag off">offline</span>') + '<span class="muted">' + (p.arch ? esc(p.arch) : 'choosing…') + '</span></div>';
    }).join('') + '</fieldset>';
    h += '<fieldset><legend>Choose your archetype: first come, first served</legend><div class="archpick">' + archetypes().map(function (c) {
      var by = r.players.filter(function (p) { return p.arch === c.archetype; })[0], mine = by && by.name === me, taken = by && !mine;
      return '<div class="hcard' + (mine ? ' pick' : '') + (taken ? ' blocked' : '') + '" data-row="' + esc(c.id) + '">' + defFace(c, { mid: true }) +
        '<span class="archtag">' + esc(c.archetype) + (taken ? ': ' + esc(by.name) : mine ? ' (you)' : '') + '</span>' +
        (taken ? '' : '<button class="cellbtn" data-act="netPick" data-arch="' + esc(mine ? '' : c.archetype) + '" aria-label="' + esc(c.archetype) + '"></button>') + '</div>';
    }).join('') + '</div><p class="small muted">Click your archetype again to give it back. Each archetype is weak to one suit and can’t play it.</p></fieldset>';
    function num(k, label, lo, hi) { return '<label>' + label + '</label><input type="number" min="' + lo + '" max="' + hi + '" data-netopt="' + k + '" value="' + esc(o[k]) + '"' + dis + '>'; }
    function box(k, label, text) { return '<label>' + label + '</label><label><input type="checkbox" data-netopt="' + k + '"' + (o[k] ? ' checked' : '') + dis + '> ' + text + '</label>'; }
    h += '<fieldset><legend>Options' + (host ? '' : ' (the host sets these)') + '</legend><div class="form">' +
      '<label>Seats</label><select data-netopt="max"' + dis + '>' + [2, 3, 4, 5].map(function (n) { return '<option' + (n === r.max ? ' selected' : '') + (n < r.players.length ? ' disabled' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
      num('target', 'Victory target ◇', 1, 999) + num('handSize', 'Hand size', 1, 10) + num('drawPerTurn', 'Cards drawn per turn', 0, 5) + num('meeples', 'Meeples each', 1, 30) + num('foundationBy', 'Foundation deadline', 0, 10) +
      box('enforceWeak', 'Weak-to rule', 'Players can’t play their weak suit') + box('autoEnd', 'Auto end turn', 'End the turn when a player is out of ● with nothing free to do') +
      box('seatStart', 'Seat start', 'Later seats get more ● on their first turn') + box('burySuitOW', 'Deep foundations', 'Same-suit burials raise a card’s Overwhelm number') +
      box('defense', 'Defense tokens', 'Every 2 same-suit burials give a Defense token') + box('adjDiscount', 'Building discount', 'Placing next to your own card costs 3● less') +
      box('noWander', 'No wandering', 'Cards can’t move away from every other card') + box('ascension', 'Ascension', 'Five suits in one stack Ascends') + '</div></fieldset>';
    var ready = r.players.length >= 2 && r.players.every(function (p) { return p.arch; });
    h += '<div class="row">' + (host ? '<button class="btn def big" data-act="netStart"' + (ready ? '' : ' disabled') + '>Start game</button>' : '') + '<span class="muted">' +
      (r.players.length < 2 ? 'Waiting for at least one more player…' : !ready ? 'Waiting for everyone to choose an archetype…' : host ? 'Everyone is ready.' : 'Waiting for ' + esc(r.host) + ' to start the game.') + '</span></div>';
    return h;
  }
  // Bits of the game page that only exist online.
  function onlineBar(ctx) {
    var r = N.room || {}, out = ctx.state.players[ctx.me].out;
    return '<div class="raised row small" style="padding:2px 6px"><b>' + esc(r.name || 'Online game') + '</b>' + (r.private ? '<span class="muted">code ' + esc(r.code) + '</span>' : '') +
      (N.status === 'on' ? '' : '<span class="err">Reconnecting…</span>') + '<span class="grow" style="flex:1"></span>' +
      '<button class="btn sm" data-act="netLeave">' + (r.status === 'playing' && !out ? 'Leave game (forfeit)' : 'Leave table') + '</button></div>';
  }
  function onlineAfterGame() {
    return N.room && N.room.host === N.user ? '<button class="btn sm def" data-act="netAgain">Back to the lobby</button> <button class="btn sm" data-act="netLeave">Leave table</button>'
      : '<span class="muted">The host can reopen the table for another game.</span> <button class="btn sm" data-act="netLeave">Leave table</button>';
  }
  // Prompt bar text while someone else (another player online, or a bot) is acting, or '' when it's up to you.
  function waitingPrompt(ctx) {
    var st = ctx.state, pd = st.pending, me = fixedSeat(ctx), nm = function (i) { return '<b>' + esc(st.players[i].name) + '</b>'; };
    if (pd && !canAnswer(ctx, pd)) return '<div class="prompt">' + (isBot(st, pd.player) ? nm(pd.player) + ' is deciding…' : 'Waiting for ' + nm(pd.player) + ' to decide…') + '</div>';
    if (st.reveal && (ctx.online ? st.reveal.to !== ctx.me : isBot(st, st.reveal.to))) return '<div class="prompt">' + nm(st.reveal.to) + ' is looking at ' + nm(st.reveal.of) + '’s hand…</div>';
    if (!myTurn(ctx)) return '<div class="prompt">' + (me != null && st.players[me].out ? 'You’re out of this game. ' : '') + nm(st.cur) + (isBot(st, st.cur) ? ' is playing…' : '’s turn' + (st.turn.started ? '.' : ': starting…')) + '</div>';
    return '';
  }

  /* ----- profiles ----- */
  function profilePage() {
    netStart();
    var who = N.viewing || N.user, h = '<div class="page scroll"><div class="pane online">', end = '</div></div>';
    if (N.status === 'none') return h + '<h2>Profile</h2><p>Profiles live on the game server, and this copy of the site isn’t connected to one.</p>' + end;
    if (N.guest && !N.viewing) return h + '<h2>You’re playing as a guest</h2><p>Guests don’t have a profile, so ' + esc(N.user) + '’s games aren’t saved. Create a profile to keep your win/loss record, favourite archetypes and cards, and game history from now on.</p>' +
      (N.room ? '<p class="small muted">Finish or leave your current table first: creating a profile signs you in afresh.</p>' : authForm().replace(/<div class="row guestrow">[\s\S]*$/, '')) + end;
    if (!who) return h + '<h2>Your profile</h2>' + (N.status === 'on' ? '<p class="muted">Sign in or create a profile to play online and track your games.</p>' + authForm() : '<p>Connecting to the game server…</p>') + end;
    if (N.profileFor !== who) {
      N.profileFor = who; N.profile = null;
      KNet.api('/api/profile/' + encodeURIComponent(who)).then(function (p) { if (N.profileFor === who) { N.profile = p; render(); } })
        .catch(function () { if (N.profileFor === who) { N.profile = { error: 'Can’t reach the game server.' }; render(); } });
    }
    var p = N.profile;
    if (!p) return h + '<p>Loading ' + esc(who) + '’s profile…</p>' + end;
    if (p.error) return h + '<p class="err">' + esc(p.error) + '</p>' + end;
    var pct = function (w, n) { return n ? Math.round(100 * w / n) + '%' : '—'; }, same = function (a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); };
    h += '<div class="row spread"><h2 class="plain">' + esc(p.name) + '</h2>' + (N.user && same(p.name, N.user) ? '<button class="btn" data-act="netLogout">Sign out</button>' : N.user ? '<button class="btn" data-act="myProfile">My profile</button>' : '') + '</div>';
    h += '<p class="small muted">Playing since ' + esc(new Date(p.created).toLocaleDateString()) + '</p>';
    h += '<div class="stats"><div class="stat raised"><div class="bignum">' + p.wins + '–' + p.losses + '</div><div class="small">Wins – losses</div></div>' +
      '<div class="stat raised"><div class="bignum">' + pct(p.wins, p.games) + '</div><div class="small">Win rate</div></div>' +
      '<div class="stat raised"><div class="bignum">' + p.games + '</div><div class="small">Games played</div></div></div>';
    h += '<div class="split2"><fieldset><legend>Most played archetypes</legend>' + (p.archetypes.length ? '<table class="list small"><thead><tr><th>Archetype</th><th>Played</th><th>Won</th><th>Win rate</th></tr></thead><tbody>' +
      p.archetypes.map(function (a) { return '<tr><td>' + esc(a.name) + '</td><td>' + a.played + '</td><td>' + a.won + '</td><td>' + pct(a.won, a.played) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">No games yet.</p>') + '</fieldset>' +
      '<fieldset><legend>Most played cards</legend>' + (p.cards.length ? '<table class="list small"><thead><tr><th>Card</th><th>Times played</th></tr></thead><tbody>' +
      p.cards.map(function (c) { var d = libById(c.id); return '<tr data-row="' + esc(c.id) + '"><td>' + (d ? icon(d.suit) + ' ' : '') + esc(c.name) + '</td><td>' + c.count + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted small">No cards played yet.</p>') + '</fieldset></div>';
    h += '<fieldset><legend>Recent games</legend>' + (p.history.length ? '<table class="list small"><thead><tr><th>Date</th><th>Table</th><th>Players</th><th>Rounds</th><th>Result</th></tr></thead><tbody>' +
      p.history.map(function (g) {
        var mine = g.players.filter(function (q) { return same(q.name, p.name); })[0];
        return '<tr><td>' + esc(new Date(g.date).toLocaleDateString()) + '</td><td>' + esc(g.room) + '</td><td class="wrap">' + g.players.map(function (q) { return (q.won ? '<b>' : '') + esc(q.name) + ' (' + esc(q.arch) + ', ' + q.score + '◇)' + (q.won ? '</b>' : ''); }).join(', ') + '</td>' +
          '<td>' + g.rounds + '</td><td>' + (mine && mine.won ? '<b class="won">Won</b>' : 'Lost') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted small">No games yet.</p>') + '</fieldset>';
    return h + end;
  }

  /* ---------------- phones: game layout ---------------- */
  // Phones (and short landscape screens) get their own game layout: a top bar with your numbers and End turn,
  // the board filling the middle, your hand along the bottom, and Players / Log / Card / Menu as sheets that
  // slide up from a tab bar. Same pieces as the desktop page, arranged differently.
  var MOBILE_Q = '(max-width: 900px), (max-height: 520px)';
  function isMobile() { return !!(window.matchMedia && window.matchMedia(MOBILE_Q).matches); }
  function inGame() { return (app.page === 'game' && !!app.game) || (app.page === 'online' && !!cur()); }
  function gamePageMobile(ctx) {
    var st = ctx.state, me = viewer(ctx), pl = st.players[me], sc = E.scores(st)[me], ov = ctx.ui.overlay || 'none';
    var canEnd = myTurn(ctx) && st.turn.started && !st.pending && !st.res && st.winner == null;
    var h = '<div class="page mgame">';
    h += '<div class="mtop raised"><span class="swatch" style="background:' + pl.color + '"></span><b class="mname">' + esc(pl.name) + '</b>' +
      '<span class="mstat" title="Aktion points">' + (st.turn.started && st.cur === me ? pl.ap : '–') + '●</span><span class="mstat" title="Victory points">' + sc.total + '◇</span>' +
      '<span class="mstat small" title="Meeples left">♟' + pl.meeples + '</span>' + meepleChip(ctx) + '<span class="grow"></span>' +
      '<button class="btn' + (ov === 'quick' ? ' on' : '') + '" data-act="ovQuick" title="Quickview overlay">◇●</button><button class="btn' + (ov === 'war' ? ' on' : '') + '" data-act="ovWar" title="War overlay">War</button>' +
      (ctx.online ? '' : '<button class="btn" data-act="undo"' + (ctx.hist.length ? '' : ' disabled') + '>Undo</button>') +
      '<button class="btn def" data-act="endTurn"' + (canEnd ? '' : ' disabled') + '>End turn</button></div>';
    h += (ctx.online ? onlineBar(ctx) : '') + promptBar(ctx);
    h += '<div class="boardwrap sunken">' + boardHTML(ctx).html + '</div>';
    h += '<div class="mhand raised">' + handHTML(ctx) + '</div>';
    var sheet = app.sheet;
    if (sheet === 'players') h += '<div class="msheet raised">' + playersPanel(ctx) + '</div>';
    if (sheet === 'log') h += '<div class="msheet raised"><div class="log sunken">' + logPanel(st) + '</div></div>';
    if (sheet === 'card') h += '<div class="msheet raised pane">' + inspector(ctx) + '</div>';
    if (sheet === 'menu') h += '<div class="msheet raised pane">' + menuSheet(ctx) + '</div>';
    h += '<div class="mtabs">' + [['players', 'Players'], ['log', 'Log'], ['card', 'Card'], ['menu', 'Menu']].map(function (t) {
      return '<button class="btn' + (sheet === t[0] ? ' on' : '') + '" data-act="sheet" data-sheet="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    return h + '</div>';
  }
  // The Menu sheet: the pages (the tab bar is hidden on phones during a game), then the board toolbar.
  function menuSheet(ctx) {
    var tabs = (ONLINE ? [['home', 'Home'], ['new', 'Play locally'], ['online', 'Online'], ['profile', 'Profile'], ['library', 'Cards'], ['help', 'Help']]
      : [['new', 'New game'], ['sandbox', 'Sandbox'], ['library', 'Library'], ['builder', 'Card builder'], ['help', 'Help']]).concat([['notes', 'Patch notes']]);
    return '<div class="panelhead">Go to</div><div class="row">' + tabs.map(function (t) { return '<button class="btn" data-page="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (document.fullscreenEnabled && !isStandalone() ? '<div class="row" style="margin-top:6px"><button class="btn" data-act="fullscreen">' + (document.fullscreenElement ? 'Leave full screen' : 'Full screen') + '</button></div>' : '') +
      '<div class="panelhead" style="margin-top:8px">Board</div>' + boardBar(ctx) +
      '<p class="small muted">Drag a card from your hand onto a green space to play it, and your meeple onto an orange-outlined card to claim it. Pinch to zoom, drag the board to move around, and press and hold any card to read it.</p>';
  }
  // A meeple you can drag onto a claimable card (shown while a claim is available on your turn).
  function meepleChip(ctx) {
    var st = ctx.state;
    if (ctx.kind !== 'game' || !myTurn(ctx) || !st.turn || !st.turn.started || st.pending || st.res || st.winner != null || !E.claimOptions(st, st.cur).length) return '';
    return '<span class="meepchip" data-meeple="1" title="Drag onto an orange-outlined card to claim it"><span class="meep" style="background:' + st.players[st.cur].color + '"></span></span>';
  }

  /* ---------------- touch and drag ---------------- */
  // Built on pointer events, so one code path serves mouse, touch and pen. A drop sends the same engine action
  // a click would (play, cast, claim, swap), so online games, bots and Undo need nothing new.
  var dragLayer = document.createElement('div'); dragLayer.className = 'draglayer'; dragLayer.setAttribute('aria-hidden', 'true'); document.body.appendChild(dragLayer);
  var drag = null, lastPointer = 'mouse', swallowAt = null, lp = null, bt = { pts: {}, moved: false, pinch: null, ctx: null };
  function el(cls, html) { var d = document.createElement('div'); d.className = cls; d.innerHTML = html || ''; dragLayer.appendChild(d); return d; }
  // Eat the click that follows a drag, a pan or a long press, so it doesn't also select or place something.
  // That click is stamped within a few ms of the pointerup; a real later tap is stamped when it happens, even if
  // the page was too busy to handle it at once (a timer could fire too late and eat it).
  function swallow(e) { var at = swallowAt = e.timeStamp; setTimeout(function () { if (swallowAt === at) swallowAt = null; }, 0); }   // that click, if any, comes before this timer
  document.addEventListener('click', function (e) {
    var eat = swallowAt != null && e.timeStamp >= swallowAt - 5 && e.timeStamp - swallowAt < 120; swallowAt = null;
    if (eat) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  document.addEventListener('pointerdown', function (e) {
    lastPointer = e.pointerType;
    if (e.pointerType === 'touch' && e.isPrimary) {   // a fresh touch: forget any finger iOS left looking stuck (see boardTouchStart)
      bt.pts = {}; bt.pinch = null; bt.moved = false;
      if (drag) { var sd = drag; drag = null; if (sd.active) { endDragVisuals(sd); sd.ctx.ui.hand = sd.prevHand || null; render(); } }
    }
    if (e.button > 0 || drag) return;
    var ctx = cur(), t = e.target, c = function (sel) { return t.closest ? t.closest(sel) : null; };
    var hand = c('.bottom [data-hand], .mhand [data-hand]'), meep = c('[data-meeple]'), cell = c('[data-cell]'), wrap = c('.boardwrap');
    if (ctx && ctx.kind === 'game' && (hand || meep)) drag = { kind: hand ? 'hand' : 'meeple', uid: hand && hand.getAttribute('data-hand'), x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', active: false, ctx: ctx };
    if (e.pointerType === 'touch' && (hand || cell)) startLongPress(hand || cell, e);
    if (e.pointerType === 'touch' && wrap && ctx) boardTouchStart(e, ctx);
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) cancelLongPress();
    if (drag && e.pointerId === drag.id) {
      drag.x = e.clientX; drag.y = e.clientY;
      if (!drag.active) {
        var dx = drag.x - drag.x0, dy = drag.y - drag.y0;
        if (Math.hypot(dx, dy) < (drag.touch ? 10 : 6)) return;
        if (drag.touch && drag.kind === 'hand' && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }   // sideways: scroll the hand
        if (!startDrag()) { drag = null; return; }
      }
      e.preventDefault(); moveDrag(); return;
    }
    boardTouchMove(e);
  }, { passive: false });
  document.addEventListener('pointerup', function (e) {
    if (lp && lp.shown) swallow(e); cancelLongPress();
    if (drag && e.pointerId === drag.id) { var d = drag; drag = null; if (d.active) { swallow(e); dropDrag(d); } }
    boardTouchEnd(e);
  });
  document.addEventListener('pointercancel', function (e) {
    cancelLongPress();
    if (drag && e.pointerId === drag.id) { var d = drag; drag = null; if (d.active) { endDragVisuals(d); d.ctx.ui.hand = d.prevHand || null; render(); } }
    boardTouchEnd(e);
  });

  // Picking a card or the meeple up: the ghost follows the pointer, and the board lights up where it can go.
  function startDrag() {
    var ctx = drag.ctx, st = ctx.state;
    if (!(myTurn(ctx) && st.turn && st.turn.started && !st.pending && !st.res && st.winner == null)) return false;
    if (drag.kind === 'hand') {
      drag.def = E.rawDef(st, drag.uid); drag.cast = !E.needsPlacement(drag.def); drag.prevHand = ctx.ui.hand;
      drag.blocked = E.playBlock(st, st.cur, drag.uid);     // a card you can't play can still go to the discard pile
      if (!drag.blocked) ctx.ui.hand = drag.uid; ctx.ui.sel = null;
      drag.ghost = el('dragghost', defFace(Object.assign({}, drag.def, { art: artOf(drag.def.id) }), { tex: drag.uid }));
      var others = st.players[st.cur].hand.filter(function (u) { return u !== drag.uid && E.rawDef(st, u).type !== 'Foundation'; });
      if (drag.def.type !== 'Foundation' && others.length) {
        var first = (ctx.ui.swap || []).filter(function (u) { return u !== drag.uid; }).length;
        drag.zone = el('dropzone', first ? 'Drop here: discard both, draw 1' : 'Discard pile: drop 2 cards here to draw 1');
      }
      if (drag.blocked && !drag.zone) { toast(drag.blocked); drag.ghost.remove(); return false; }
    } else {
      if (!E.claimOptions(st, st.cur).length) return false;
      drag.ghost = el('dragghost meepghost', '<span class="meep" style="background:' + st.players[st.cur].color + '"></span>');
    }
    drag.active = true; document.body.classList.add('dragging'); app.sheet = null; render(); moveDrag();
    return true;
  }
  function moveDrag() {
    var px = drag.x, py = drag.y - (drag.touch ? 64 : 0);     // on touch the card floats above the finger so you can see the target
    var w = drag.kind === 'hand' ? 88 : 30, hgt = drag.kind === 'hand' ? 118 : 34;
    drag.ghost.style.transform = 'translate(' + (px - w / 2) + 'px,' + (py - hgt / 2) + 'px)';
    var tgt = findTarget(px, py);
    if (drag.tgtEl !== tgt.el) { if (drag.tgtEl) drag.tgtEl.classList.remove('drophover'); if (tgt.el) tgt.el.classList.add('drophover'); drag.tgtEl = tgt.el; }
    drag.tgt = tgt; drag.ghost.setAttribute('data-tip', tgt.tip || '');
  }
  // Where a drop at (px, py) would go. Legal spaces within a finger's width count, so small spaces are easy to hit.
  function findTarget(px, py) {
    var inRect = function (r) { return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; };
    if (drag.zone && inRect(drag.zone.getBoundingClientRect())) return { kind: 'discard', el: drag.zone, tip: 'Discard' };
    if (drag.blocked) return { kind: 'none', el: null };
    if (!drag.cast) {
      var best = null, bd = 1e9;
      document.querySelectorAll(drag.kind === 'meeple' ? '.cell.claimable' : '.cell.legal:not(.poor)').forEach(function (cl) {
        var r = cl.getBoundingClientRect(), d = Math.hypot(px - Math.max(r.left, Math.min(px, r.right)), py - Math.max(r.top, Math.min(py, r.bottom)));
        if (d < bd) { bd = d; best = cl; } });
      if (best && bd <= (drag.touch ? 36 : 12)) {
        var k = best.querySelector('[data-cell]').getAttribute('data-cell');
        return { kind: drag.kind === 'meeple' ? 'claim' : 'place', k: k, el: best, tip: drag.kind === 'meeple' ? 'Claim' : 'Play here · ' + E.legalCells(drag.ctx.state, drag.uid)[k] + '●' };
      }
    }
    var wrap = $('.boardwrap');
    if (drag.cast && wrap && inRect(wrap.getBoundingClientRect())) return { kind: 'cast', el: wrap, tip: 'Play it · ' + (E.isFree(drag.ctx.state, drag.uid) ? 0 : +drag.def.cost || 0) + '●' };
    var under = document.elementFromPoint(px, py), cell = under && under.closest && under.closest('[data-cell]');
    return { kind: 'none', k: cell && wrap && wrap.contains(cell) ? cell.getAttribute('data-cell') : null, el: null };
  }
  function endDragVisuals(d) { if (d.tgtEl) d.tgtEl.classList.remove('drophover'); if (d.ghost) d.ghost.remove(); if (d.zone) d.zone.remove(); document.body.classList.remove('dragging'); }
  function dropDrag(d) {
    var ctx = d.ctx, st = ctx.state, t = d.tgt || { kind: 'none' };
    endDragVisuals(d);
    if (t.kind === 'place') { ctx.ui.sel = t.k; dispatch(ctx, { t: 'play', uid: d.uid, k: t.k }); return; }
    if (t.kind === 'cast') { dispatch(ctx, { t: 'cast', uid: d.uid }); return; }
    if (t.kind === 'claim') { ctx.ui.sel = t.k; dispatch(ctx, { t: 'claim', k: t.k }); return; }
    if (t.kind === 'discard') {            // first card waits on the pile; the second discards both
      var first = (ctx.ui.swap || []).filter(function (u) { return u !== d.uid && st.players[st.cur].hand.indexOf(u) >= 0; })[0];
      ctx.ui.hand = null;
      if (first) { ctx.ui.swap = null; dispatch(ctx, { t: 'swap', uids: [first, d.uid] }); }
      else { ctx.ui.swap = [d.uid]; toast('Drag one more card to the discard pile to draw 1.'); render(); }
      return;
    }
    ctx.ui.hand = d.prevHand || null;     // missed: put things back and say why
    if (d.blocked) toast(d.blocked + ' It can still be discarded.');
    else if (d.kind === 'hand' && t.k) { var L = E.legalCells(st, d.uid); toast(t.k in L ? 'Not enough ● to play ' + d.def.name + ' there (' + L[t.k] + '●).' : d.def.name + ' can’t go there: it must touch a card on a side its placement allows.'); }
    else if (d.kind === 'meeple' && t.k) toast('You can claim the card you just placed, or an unclaimed card next to it.');
    else if (d.kind === 'hand') toast(d.cast ? 'Drop it on the board to play it.' : 'Drop it on a green space to play it.');
    else toast('Drop the meeple on an orange-outlined card to claim it.');
    render();
  }

  // Press and hold a card on a touch screen to read it (the desktop hover magnifier, for fingers).
  function startLongPress(target, e) {
    cancelLongPress();
    lp = { x: e.clientX, y: e.clientY, t: setTimeout(function () {
      var html = hoverHTML(target); if (!html || !lp) return;
      hov.innerHTML = html.slice(html.indexOf('|') + 1); hov.style.display = 'block';
      hov.style.left = Math.max(6, (innerWidth - hov.offsetWidth) / 2) + 'px'; hov.style.top = Math.max(6, Math.min(lp.y - hov.offsetHeight - 30, innerHeight - hov.offsetHeight - 6)) + 'px';
      lp.shown = true; if (drag && !drag.active) drag = null;
    }, 450) };
  }
  function cancelLongPress() { if (!lp) return; clearTimeout(lp.t); if (lp.shown) hov.style.display = 'none'; lp = null; }

  // One finger drags the board around; two fingers pinch to zoom around the point between them.
  // iOS drops the pointerup of a finger whose element was redrawn away mid-touch (the event goes to the
  // detached element and never reaches us), so a finger can look stuck down. A fresh touch (isPrimary: no other
  // finger is down) clears the board gesture (in the pointerdown handler), and a pinch uses the two newest fingers.
  function boardTouchStart(e, ctx) {
    bt.pts[e.pointerId] = { x: e.clientX, y: e.clientY, travel: 0, at: e.timeStamp }; bt.ctx = ctx;
    var ids = Object.keys(bt.pts).sort(function (i, j) { return bt.pts[i].at - bt.pts[j].at; });
    ids.slice(0, Math.max(0, ids.length - 2)).forEach(function (i) { delete bt.pts[i]; });
    if (ids.length >= 2) startPinch(ctx);
  }
  // A pinch remembers the board point under the fingers' midpoint and the zoom it started at; each frame puts
  // that point back under the current midpoint at start zoom × spread change, so it never drifts.
  function startPinch(ctx) {
    var ids = Object.keys(bt.pts), a = bt.pts[ids[0]], b = bt.pts[ids[1]], wrap = $('.boardwrap'); if (!wrap) return;
    var r = wrap.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, z = ctx.ui.zoom;
    bt.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: z, bx: (wrap.scrollLeft + mx) / z, by: (wrap.scrollTop + my) / z };
    cancelLongPress(); if (drag && !drag.active) drag = null;
  }
  var pinchFrame = null;
  function pinchStep() {
    pinchFrame = null;
    var wrap = $('.boardwrap'), ids = Object.keys(bt.pts), ctx = bt.ctx; if (!wrap || !bt.pinch || ids.length < 2 || !ctx) return;
    var a = bt.pts[ids[0]], b = bt.pts[ids[1]], r = wrap.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    var z = Math.max(0.25, Math.min(2.5, bt.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / bt.pinch.d));
    ctx.ui.fit = false; ctx.ui.zoom = z; applyZoom(ctx); wrap.scrollLeft = bt.pinch.bx * z - mx; wrap.scrollTop = bt.pinch.by * z - my;
  }
  function boardTouchMove(e) {
    var q = bt.pts[e.pointerId], wrap = $('.boardwrap'); if (!q || !wrap || !bt.ctx || (drag && drag.active)) return;
    var dx = e.clientX - q.x, dy = e.clientY - q.y; q.x = e.clientX; q.y = e.clientY; q.travel += Math.abs(dx) + Math.abs(dy);
    e.preventDefault();
    if (bt.pinch && Object.keys(bt.pts).length >= 2) { bt.moved = true; if (!pinchFrame) pinchFrame = requestAnimationFrame(pinchStep); return; }
    if (!bt.moved && q.travel < 8) return;
    bt.moved = true; cancelLongPress(); wrap.scrollLeft -= dx; wrap.scrollTop -= dy;
  }
  function boardTouchEnd(e) {
    if (!bt.pts[e.pointerId]) return;
    delete bt.pts[e.pointerId]; bt.pinch = null;
    if (bt.moved) swallow(e);
    if (!Object.keys(bt.pts).length) bt.moved = false;
  }
  // iOS also runs its own scroll and page zoom unless the touch events themselves are cancelled.
  document.addEventListener('touchmove', function (e) {
    if (Object.keys(bt.pts).length || (drag && drag.active) || (e.target.closest && e.target.closest('.mgame .boardwrap'))) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { if (inGame()) e.preventDefault(); });


  /* ---------------- installable app (public site) ---------------- */
  // build.sh gives the public site a manifest, icons and a service worker (src/sw.js), so it installs as an app
  // that opens full screen and works offline. Android and desktop Chrome hand us an install prompt to show from a
  // button; iPhones and iPads install only from Share → Add to Home Screen, so there the Home page says how.
  var installPrompt = null;
  function isStandalone() { return !!(window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true; }
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ONLINE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; render(); });
  window.addEventListener('appinstalled', function () { installPrompt = null; toast('Kartenspiel is installed: open it from your home screen or app list.'); });
  document.addEventListener('fullscreenchange', function () { render(); });
  // Home page box: install (or how to, on iPhone), and full screen in the browser. Hidden once running as the app.
  function appBox() {
    if (!ONLINE || isStandalone()) return '';
    var how = installPrompt ? '<button class="btn def big" data-act="installApp">Install app</button>'
      : isIOS ? '<span>On iPhone or iPad, in Safari: tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</span>'
      : '<span class="small muted">In Chrome or Edge, use the install icon in the address bar, or the browser menu’s <b>Install app</b> / <b>Add to Home screen</b>.</span>';
    var fs = document.fullscreenEnabled ? '<button class="btn big" data-act="fullscreen">' + (document.fullscreenElement ? 'Leave full screen' : 'Full screen') + '</button>' : '';
    return '<div class="choice raised appbox"><h2>Play it like an app</h2><p>Install Kartenspiel to open it full screen from your home screen, with no browser bars. Single player and pass-and-play then work offline too.</p><div class="row">' + how + fs + '</div></div>';
  }

  /* ---------------- keyboard shortcuts ---------------- */
  // Most keys press the same on-screen button a click would, so they follow its rules (a disabled button = no effect).
  var KEYS = [['Space', 'Start your turn, or the highlighted button in a dialog or the prompt bar'], ['E', 'End turn'], ['1–9', 'Pick a card in your hand, or an option in a dialog'],
    ['C', 'Claim (if only one card can be claimed; otherwise the options light up)'], ['A', 'Use the selected card’s ability'], ['D', 'Discard 2, draw 1'], ['U or Ctrl+Z', 'Undo'],
    ['Y / N', 'Answer yes / no'], ['S', 'Skip an optional choice'], ['Esc', 'Cancel: deselect, close a dialog, leave a mode'],
    ['Q (hold)', 'Quickview overlay while held'], ['W (hold)', 'War overlay while held'], ['O', 'Cycle the overlay: None, Quickview, War'],
    ['F', 'Fit the board'], ['+ / −', 'Zoom'], ['G', 'Grid'], ['?', 'This list']];
  var KEYHINT = { endTurn: 'E', undo: 'U or Ctrl+Z', startSwap: 'D', skip: 'S', answerYes: 'Y', answerNo: 'N', startTurn: 'Space', claim: 'C', ability: 'A', fit: 'F', zoomin: '+', zoomout: '−', keys: '?' };
  function keysTable() { return '<table class="list small keys">' + KEYS.map(function (r) { return '<tr><td><span class="kbd">' + esc(r[0]) + '</span></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table><p class="small muted">Keys do nothing while you type in a text box. Turn keys only work when it’s your turn.</p>'; }
  function keysModal() { app.modal = function () { return modal('Keyboard shortcuts', keysTable(), '<button class="btn def" data-act="closeModal">Close</button>'); }; render(); }
  // Tooltips name each button's key (run after every render).
  function keyHints() {
    document.querySelectorAll('[data-act]').forEach(function (el) { var key = KEYHINT[el.getAttribute('data-act')]; if (key && !/\(\S+.*\)$/.test(el.title || '')) el.title = (el.title || el.textContent.trim()) + ' (' + key + ')'; });
    document.querySelectorAll('.modal .btn.def, .prompt .btn.def').forEach(function (el) { if (!/\(Space\)$/.test(el.title || '')) el.title = (el.title || el.textContent.trim()) + ' (Space)'; });
    var ov = document.querySelector('[data-sel="overlay"]'); if (ov) ov.title = 'O cycles the overlay; hold Q or W to peek';
  }
  function press(sel) { var b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; }
  function claimKey(ctx) {
    var st = ctx.state; if (ctx.kind !== 'game' || !myTurn(ctx) || !st.turn || !st.turn.started || st.pending || st.res) return;
    var co = E.claimOptions(st, st.cur);
    if (co.length === 1) { ctx.ui.sel = co[0]; dispatch(ctx, { t: 'claim', k: co[0] }); }
    else toast(co.length ? 'Claim: click one of the ' + co.length + ' orange-outlined cards.' : 'Nothing to claim right now.');
  }
  // Hold Q or W to see an overlay; letting go puts the previous one back.
  var peek = null;
  function endPeek() { var c = cur(); if (c) c.ui.overlay = peek; peek = null; render(); }
  // Returns true when the key was used.
  function onKey(e) {
    var t = e.target, k = e.key, lower = k.length === 1 ? k.toLowerCase() : k;
    if ((t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (k === '?') { keysModal(); return true; }
    if (k === ' ') return t && t.tagName === 'BUTTON' ? false : press('.modal .btn.def') || press('.prompt .btn.def');
    if (document.querySelector('.modal')) {          // a dialog is open: only its own keys
      if (/^[1-9]$/.test(k)) { var o = document.querySelectorAll('.modal [data-pick], .modal [data-answer], .modal [data-answer-p]')[+k - 1]; if (o) { o.click(); return true; } return false; }
      if (lower === 'y') return press('.modal [data-act="answerYes"]');
      if (lower === 'n') return press('.modal [data-act="answerNo"]');
      if (lower === 'u') return press('.modal [data-act="undo"]');
      return false;
    }
    var ctx = cur(); if (!ctx) return false;
    if (/^[1-9]$/.test(k)) { var hc = document.querySelectorAll('.bottom [data-hand]')[+k - 1]; if (hc) { hc.click(); return true; } return false; }
    switch (lower) {
      case 'e': return press('[data-act="endTurn"]');
      case 'u': return press('[data-act="undo"]');
      case 'd': return press('[data-act="startSwap"]');
      case 's': return press('[data-act="skip"]');
      case 'a': return press('[data-act="ability"]');
      case 'c': claimKey(ctx); return true;
      case 'f': return press('[data-act="fit"]');
      case '+': case '=': return press('[data-act="zoomin"]');
      case '-': case '_': return press('[data-act="zoomout"]');
      case 'g': ctx.ui.coords = !ctx.ui.coords; render(); return true;
      case 'o': var order = ['none', 'quick', 'war']; ctx.ui.overlay = order[(order.indexOf(ctx.ui.overlay || 'none') + 1) % order.length]; peek = null; render(); return true;
      case 'q': case 'w': if (!e.repeat) { if (peek == null) peek = ctx.ui.overlay || 'none'; ctx.ui.overlay = lower === 'q' ? 'quick' : 'war'; render(); } return true;
    }
    return false;
  }

  /* ---------------- events ---------------- */
  // One click handler for the whole app. Elements say what they do through data- attributes (data-act, data-cell, data-hand, ...).
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-page],[data-act],[data-cell],[data-hand],[data-pick],[data-answer],[data-answer-p],[data-row],[data-sort],[data-help]');
    if (!t) return;
    if (t.hasAttribute('data-help')) {   // Help's table of contents
      var hid = t.getAttribute('data-help'), sc = $('#helpscroll'), tg = hid === 'top' ? null : document.getElementById('help-' + hid);
      if (!sc) return; if (tg) { tg.scrollIntoView({ behavior: 'smooth', block: 'start' }); tg.classList.add('flash'); setTimeout(function () { tg.classList.remove('flash'); }, 900); } else sc.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.hasAttribute('data-page')) { if (t.disabled) return; app.page = t.getAttribute('data-page'); app.modal = null; app.sheet = null; if (app.page === 'profile') { N.viewing = null; N.profileFor = null; } render(); return; }
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
  // Clicking a board cell: answer a prompt, finish a move, reclaim, claim, place the selected hand card,
  // or just select it. In the sandbox it places or buries the chosen card.
  function cellClick(ctx, k) {
    var st = ctx.state, ui = ctx.ui, pd = st.pending;
    if (pd && pd.kind === 'cell' && pd.options.indexOf(k) >= 0 && canAnswer(ctx, pd)) { dispatch(ctx, { t: 'answer', v: k }); return; }
    if (ui.mode === 'move') { if (!E.top(st, k)) { ui.mode = null; dispatch(ctx, { t: 'sbMove', from: ui.moveFrom, to: k }); ui.sel = k; } else { ui.sel = k; render(); } return; }
    if (ctx.kind === 'game') {
      if (ui.mode === 'reclaim') { ui.mode = null; if (!dispatch(ctx, { t: 'reclaim', k: k })) ui.mode = 'reclaim'; return; }
      if (myTurn(ctx) && !ui.hand && !pd && !st.res && !ui.swap && st.turn && st.turn.started && E.claimOptions(st, st.cur).indexOf(k) >= 0) { ui.sel = k; dispatch(ctx, { t: 'claim', k: k }); return; }
      if (ui.hand && !pd && myTurn(ctx)) { var L = E.legalCells(st, ui.hand); if (k in L) { var h = ui.hand; ui.sel = k; dispatch(ctx, { t: 'play', uid: h, k: k }); return; } }
      ui.sel = E.top(st, k) ? k : null; ui.hand = null; if (ui.sel && isMobile()) app.sheet = 'card'; render(); return;
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
  // What each data-act button does.
  function act(a, t, ctx) {
    if (/^net|^(viewProfile|myProfile|copyInvite)$/.test(a)) return netAct(a, t);
    if (ONLINE && /^(newCard|editCard|dupCard|delCard|delYes|saveCard|saveCopy|restoreAsk|restore|importLib)$/.test(a)) return;   // no library editing on the public site
    var k = t.getAttribute('data-k');
    switch (a) {
      case 'zoomin': ctx.ui.fit = false; ctx.ui.zoom = Math.min(2.5, ctx.ui.zoom * 1.25); applyZoom(ctx); render(); return;
      case 'zoomout': ctx.ui.fit = false; ctx.ui.zoom = Math.max(0.2, ctx.ui.zoom / 1.25); applyZoom(ctx); render(); return;
      case 'fit': ctx.ui.fit = true; render(); return;
      case 'start': {
        var players = []; for (var i = 0; i < setup.n; i++) players.push({ name: setup.players[i].name.trim() || ('Player ' + (i + 1)), arch: setup.players[i].arch, color: COLORS[i] });
        var st = E.newGame(app.lib, { seed: window.ksSeed, players: players, handSize: +setup.handSize || 4, meeples: +setup.meeples || 8, target: +setup.target || 48, enforceWeak: setup.enforceWeak, foundationBy: +setup.foundationBy, drawPerTurn: setup.drawPerTurn === '' || setup.drawPerTurn == null ? 2 : +setup.drawPerTurn, autoEnd: setup.autoEnd, seatStart: setup.seatStart, burySuitOW: setup.burySuitOW, defense: setup.defense, adjDiscount: setup.adjDiscount, noWander: setup.noWander, ascension: setup.ascension });
        st.players.forEach(function (pl, i) { var kind = setup.players[i].kind; if (kind && kind !== 'human') pl.bot = kind; });
        app.game = newCtx(st, 'game'); lsSet('ks.game', st); lsSet('ks.setup', setup); app.page = 'game'; render(); return;
      }
      case 'rematch': {   // the same players, archetypes, seats and rules, with a fresh shuffle
        var old = ctx.state, rp = old.players.map(function (q) { return { name: q.name, arch: q.arch, color: q.color }; }), ro = {};
        for (var ok in old.opts) ro[ok] = old.opts[ok]; ro.players = rp; ro.seed = window.ksSeed;
        var rs = E.newGame(app.lib, ro); rs.players.forEach(function (q, i) { if (old.players[i].bot) q.bot = old.players[i].bot; });
        app.game = newCtx(rs, 'game'); lsSet('ks.game', rs); render(); toast('Rematch: same players and rules, new shuffle.'); return;
      }
      case 'soloSetup': case 'hotseatSetup': {   // home page shortcuts: preset the seats, then the New game page
        ensureSetup(); var solo = a === 'soloSetup';
        setup.players.forEach(function (sp, i) { var kind = solo && i > 0 ? (sp.kind && sp.kind !== 'human' ? sp.kind : 'tactician') : 'human';
          if (/^Player \d$/.test(sp.name) || sp.name === BOT_NAMES[sp.kind]) sp.name = kind === 'human' ? 'Player ' + (i + 1) : BOT_NAMES[kind];
          sp.kind = kind; });
        app.page = 'new'; render(); return;
      }
      case 'resume': { var sv = lsGet('ks.game'); if (sv) { app.game = newCtx(sv, 'game'); app.page = 'game'; render(); } return; }
      case 'startTurn': dispatch(ctx, { t: 'startTurn' }); return;
      case 'reclaimMode': ctx.ui.mode = 'reclaim'; render(); return;
      case 'cancelMode': ctx.ui.mode = null; render(); return;
      case 'endTurn':   // with cards you could still play or a card you could claim, ask once first
        if (prefs.confirmEnd !== false && !ctx.ui.endAsked && ctx.kind === 'game' && leftToDo(ctx)) { ctx.ui.endAsked = true; render(); return; }
        ctx.ui.endAsked = false; dispatch(ctx, { t: 'endTurn' }); return;
      case 'keepPlaying': ctx.ui.endAsked = false; render(); return;
      case 'noEndAsk': setPref('confirmEnd', false); ctx.ui.endAsked = false; dispatch(ctx, { t: 'endTurn' }); return;
      case 'notesDismiss': hidePatchPop(); return;
      case 'patchOff': setPref('patchNotes', false); render(); toast('You won’t see update messages. Patch notes stay in Help.'); return;
      case 'patchOn': setPref('patchNotes', true); render(); toast('After the next update, you’ll see what’s new.'); return;
      case 'hideHints': setPref('hints', false); render(); toast('Hints are off. Turn them back on from Help.'); return;
      case 'showHints': setPref('hints', true); setPref('confirmEnd', true); render(); toast('Hints and the end-turn check are on.'); return;
      case 'hideHintsAll': setPref('hints', false); setPref('confirmEnd', false); render(); toast('Hints and the end-turn check are off.'); return;
      case 'handSort': { var so = ['drawn', 'suit', 'cost']; setPref('handSort', so[(so.indexOf(prefs.handSort || 'drawn') + 1) % so.length]); render(); return; }
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
      case 'keys': keysModal(); return;
      case 'suits': suitsModal(); return;
      case 'installApp': if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.then(function () { installPrompt = null; render(); }); } return;
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(function () { toast('This browser won’t go full screen here. Installing the app does it instead.'); });
        return;
      case 'sheet': { var sh = t.getAttribute('data-sheet'); app.sheet = app.sheet === sh ? null : sh; render(); return; }
      case 'ovQuick': case 'ovWar': { var ov = a === 'ovQuick' ? 'quick' : 'war'; ctx.ui.overlay = ctx.ui.overlay === ov ? 'none' : ov; render(); return; }
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
  // Plain-text dump for bug reports: players, a text map of the board, every card, the log and the full state.
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
    if (st.res || st.pending) { L.push(''); L.push('IN PROGRESS'); if (st.res) L.push('effect: ' + JSON.stringify({ card: st.res.src ? E.rawDef(st, st.res.src).name : 'hidden', at: st.res.srcKey, step: st.res.i, steps: st.res.steps, phase: st.res.phase })); if (st.pending) L.push('waiting for: ' + JSON.stringify(st.pending)); }
    if (ctx.err) L.push('Last error: ' + ctx.err);
    L.push(''); L.push('LOG'); st.log.forEach(function (l) { L.push(l); });
    L.push(''); L.push('STATE JSON (paste into New game > Load a game from text to reproduce)'); L.push(JSON.stringify(st));
    return L.join('\n');
    function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + ' ' : s + new Array(n - s.length + 1).join(' '); }
  }
  // Copy to the clipboard, with a fallback for when the Clipboard API is blocked.
  function copyText(txt, cb) {
    function fallback() { var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); cb(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { cb(true); }, fallback); else fallback();
  }
  function copyDebug(ctx) {
    var txt = debugReport(ctx);
    copyText(txt, function (ok) { if (ok) toast('Debug report copied: log, board and full state (' + txt.split('\n').length + ' lines).'); else textModal('Debug report', 'Copying was blocked here. The text is selected: press Ctrl+C (or Cmd+C) to copy it.', txt, null); });
  }
  // Dialog with a big text box: read-only for export, or with cb for import (throw in cb to show an error).
  function textModal(title, msg, text, cb) {
    app._textCb = cb; app._textErr = null;
    app.modal = function () { return modal(title, '<p>' + esc(msg) + '</p><textarea id="bigtext" rows="10" style="width:min(640px,80vw)"' + (cb ? '' : ' readonly') + '>' + esc(text) + '</textarea>' + (app._textErr ? '<div class="err">' + esc(app._textErr) + '</div>' : ''), '<button class="btn" data-act="closeModal">' + (cb ? 'Cancel' : 'Close') + '</button>' + (cb ? '<button class="btn def" data-act="textOK">Load</button>' : '')); };
    render(); var ta = $('#bigtext'); if (ta && !cb) ta.select();
  }

  // Form controls: toggles, selects, New game options, library filters, card builder fields.
  document.addEventListener('change', function (e) {
    var t = e.target, ctx = cur();
    if (t.hasAttribute('data-tog')) { ctx.ui[t.getAttribute('data-tog')] = t.checked; render(); return; }
    if (t.hasAttribute('data-sel')) {
      var w = t.getAttribute('data-sel');
      if (w === 'sbSuit') dispatch(ctx, { t: 'sbSuit', k: t.getAttribute('data-k'), suit: t.value, check: ctx.kind === 'game' });
      else if (w === 'buryId') { ctx.ui.buryId = t.value; }
      else if (w === 'giveId') { ctx.ui.giveId = t.value; }
      else if (w === 'overlay') { ctx.ui.overlay = t.value; render(); }
      else if (w === 'sbCard') { ctx.ui.sbCard = t.value; render(); }
      return;
    }
    if (t.hasAttribute('data-nf')) { N.form[t.getAttribute('data-nf')] = t.type === 'radio' ? t.value === '1' : t.value; return; }
    if (t.hasAttribute('data-netopt')) { sendOpts(); return; }
    if (t.hasAttribute('data-sbmode')) { ctx.ui.sbMode = t.getAttribute('data-sbmode'); render(); return; }
    if (t.hasAttribute('data-sbn')) { sbSetup.n = +t.value; render(); return; }
    if (t.hasAttribute('data-sbarch')) { sbSetup.arch[+t.getAttribute('data-sbarch')] = t.value; return; }
    if (t.hasAttribute('data-pref')) { setPref(t.getAttribute('data-pref'), t.value); render(); return; }
    if (t.hasAttribute('data-set')) { var f = t.getAttribute('data-set'); setup[f] = t.type === 'checkbox' ? t.checked : (f === 'n' ? +t.value : t.value); render(); return; }
    if (t.hasAttribute('data-pkind')) {   // picking a bot renames a default-named seat after it
      var pk = setup.players[+t.getAttribute('data-pkind')], was = pk.kind || 'human', named = /^Player \d$/.test(pk.name) || pk.name === BOT_NAMES[was];
      pk.kind = t.value; if (named) pk.name = t.value === 'human' ? 'Player ' + (+t.getAttribute('data-pkind') + 1) : BOT_NAMES[t.value];
      render(); return;
    }
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
  // Remember which <details> sections are open across re-renders.
  document.addEventListener('toggle', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-keep')) app.open[t.getAttribute('data-keep')] = t.open; }, true);
  // Live typing: player names, library search, and builder text (which only refreshes the preview, so the cursor isn't lost).
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-nf') && t.type !== 'radio') { N.form[t.getAttribute('data-nf')] = t.value; return; }
    if (t.hasAttribute('data-pname')) { setup.players[+t.getAttribute('data-pname')].name = t.value; return; }
    if (t.hasAttribute('data-lib') && t.tagName === 'INPUT') { app.libUI.q = t.value; render(); return; }
    if (t.hasAttribute('data-b') && (t.tagName === 'TEXTAREA' || t.type === 'text')) { builderChange(t.getAttribute('data-b'), t.value); var pv = document.querySelector('.split > .raised.pane:last-child'); if (pv) pv.innerHTML = '<div class="panelhead">Preview</div>' + defFace(app.builder.card, { big: true }); }
  });
  // Esc cancels the current selection or dialog; Ctrl/Cmd+Z undoes.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.getAttribute && e.target.getAttribute('data-nf') === 'pw') { netAuth('login'); return; }
    if (e.key === 'Enter' && e.target.getAttribute && e.target.getAttribute('data-nf') === 'code') { netAct('netJoinCode'); return; }
    if (onKey(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape') { var ctx = cur(); if (app.modal) { app.modal = null; render(); return; } if (app.sheet) { app.sheet = null; render(); return; } if (ctx) { ctx.ui.hand = null; ctx.ui.mode = null; ctx.ui.swap = null; render(); } }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && (app.page === 'game' || app.page === 'sandbox') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(cur()); }
  });
  document.addEventListener('keyup', function (e) { if (peek != null && /^[qw]$/i.test(e.key)) endPeek(); });
  window.addEventListener('blur', function () { if (peek != null) endPeek(); });
  var wasMobile = isMobile();
  window.addEventListener('resize', function () { if (isMobile() !== wasMobile) { wasMobile = isMobile(); render(); return; } var c = cur(); if (c && c.ui.fit) applyZoom(c); });

  /* ---------------- hover magnifier ---------------- */
  var hov = document.createElement('div'); hov.className = 'hovercard'; hov.setAttribute('aria-hidden', 'true'); document.body.appendChild(hov);
  var hovKey = null;
  // HTML for the magnified card under the mouse. The text before "|" is a key, so it only redraws when what's under the mouse changes.
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
    if (lastPointer !== 'mouse') return;
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
  if (ONLINE) {   // an invite link (#join=CODE) opens the Online page and joins once signed in
    var jm = /#join=([A-Za-z0-9]+)/.exec(location.hash);
    if (jm) { N.joinCode = jm[1].toUpperCase(); app.page = 'online'; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
  }
  var sv = lsGet('ks.game'); if (sv && sv.players && sv.winner == null) { /* offered on New game page */ }
  render();
  maybePatchPopup();   // after an update: what's new
})();
