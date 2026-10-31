/* Dithry card mode: paint the Kartenspiel cards one by one, with each card's hand version (portrait) and board
   version (square) side by side on one canvas, and the card's own text drawn in front, exactly as the game draws
   it (KFace from src/cardface.js, with Kartenspiel's stylesheet inside a shadow root so it can't clash with
   Dithry's). Saving writes the two pictures to this browser's painted faces ('ks.faces'), which Kartenspiel reads,
   so the game shows them straight away, even in a tab that's already open. An art pack exports them for the repo
   (tools/cardart.js), so every player sees them. Open with File → Paint the Kartenspiel cards, or dithry.html#cards,
   or #card=<id> for one card. */
(function () {
  'use strict';
  var A = window.DithryApp, D = A.D, app = A.app, F = window.KFace, $ = function (s, r) { return (r || document).querySelector(s); }, esc = A.esc;
  // The canvas: hand picture at the left, a gap, the board picture at the right (top-aligned). One canvas pixel is
  // two CSS pixels on a card, as in the game.
  var HW = F.HAND[0], HH = F.HAND[1], BW = F.BOARD[0], BH = F.BOARD[1], GAP = 4, BX = HW + GAP, DW = BX + BW, DH = Math.max(HH, BH);
  var cm = null;   // card mode: { list, i, bar, hosts, busy }

  /* ----- the cards ----- */
  // The built-in cards, with this browser's Kartenspiel library (custom and edited cards) on top, in suit order.
  function library() {
    var byId = {}, order = KData.SUITS, types = ['Foundation', 'Structure', 'Grounds', 'Action', 'Blessing', 'Curse'];
    KData.STARTER.forEach(function (c) { byId[c.id] = c; });
    (A.lsGet('ks.lib') || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    return Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) {
      return order.indexOf(a.suit) - order.indexOf(b.suit) || types.indexOf(a.type) - types.indexOf(b.type) || String(a.name).localeCompare(b.name); });
  }
  function myFaces() { return A.lsGet('ks.faces') || {}; }

  /* ----- entering and leaving ----- */
  function enter(id) {
    if (cm) { if (id) goTo(id); return; }
    A.cancel();
    A.confirmDiscard(function () {
      cm = { list: library(), i: 0, palette: app.palette };   // the palette to go back to when you leave
      var at = id || A.lsGet('dithry.cardmode.last'), k = cm.list.findIndex(function (c) { return c.id === at; }); cm.i = k < 0 ? 0 : k;
      app.mode = 'cards'; buildBar(); buildHosts();
      A.hooks.view.push(placeHosts); A.hooks.overlay.push(shadeGap); A.hooks.change.push(updateBar);
      return load();
    });
  }
  function leave() {
    if (!cm || cm.busy) return;
    var c = cm; cm = null; app.mode = null; app.allow = null; app.palette = c.palette; A.renderSide();
    c.bar.remove(); c.hosts.forEach(function (h) { h.remove(); });
    A.hooks.view.splice(A.hooks.view.indexOf(placeHosts), 1); A.hooks.overlay.splice(A.hooks.overlay.indexOf(shadeGap), 1); A.hooks.change.splice(A.hooks.change.indexOf(updateBar), 1);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  // Leave card mode and go back to the picture that was open before.
  function leaveToPicture() {
    A.confirmDiscard(function () {
      leave(); var p = A.autosaved();
      (p ? A.loadProject(p) : Promise.resolve(A.run('example'))).then(function () { A.toast('Back to your picture.'); });
    });
  }

  /* ----- the bar over the canvas ----- */
  function buildBar() {
    var bar = document.createElement('div'); bar.className = 'cardbar raised';
    var groups = {}; cm.list.forEach(function (c, i) { (groups[c.suit] = groups[c.suit] || []).push('<option value="' + i + '">' + esc(c.name) + (c.type === 'Foundation' ? ' (Foundation)' : '') + '</option>'); });
    bar.innerHTML = '<button class="btn" data-c="prev" title="Previous card (Page Up)">◀</button>' +
      '<select data-c="pick" aria-label="Card">' + Object.keys(groups).map(function (s) { return '<optgroup label="' + esc(s) + '">' + groups[s].join('') + '</optgroup>'; }).join('') + '</select>' +
      '<button class="btn" data-c="next" title="Next card (Page Down)">▶</button><span class="small muted" data-c="count"></span>' +
      '<label class="row small"><input type="checkbox" data-c="text" checked> Card text</label>' +
      '<span class="grow"></span><span class="small" data-c="state"></span>' +
      '<button class="btn def" data-c="save" title="Save this card to Kartenspiel (Ctrl+S)">Save to Kartenspiel</button>' +
      '<button class="btn" data-c="reset" title="Go back to the plain suit texture">Reset…</button><button class="btn" data-c="pack" title="Export or import all painted cards">Art pack…</button><button class="btn" data-c="leave">Leave card mode</button>';
    var mb = $('.menubar'); mb.parentNode.insertBefore(bar, mb.nextSibling); cm.bar = bar;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      ({ prev: function () { step(-1); }, next: function () { step(1); }, save: save, reset: resetCard, pack: packDialog, leave: leaveToPicture })[b.getAttribute('data-c')]();
    });
    bar.addEventListener('change', function (e) {
      var t = e.target;
      if (t.getAttribute('data-c') === 'pick') goTo(cm.list[+t.value].id);
      if (t.getAttribute('data-c') === 'text') cm.hosts.forEach(function (h) { h.style.display = t.checked ? '' : 'none'; });
    });
  }
  function updateBar() {
    if (!cm || !cm.bar) return;
    var c = cm.list[cm.i], f = myFaces()[c.id], committed = typeof KCardArt !== 'undefined' && KCardArt[c.id];
    $('[data-c="pick"]', cm.bar).value = String(cm.i);
    $('[data-c="count"]', cm.bar).textContent = (cm.i + 1) + ' of ' + cm.list.length;
    $('[data-c="state"]', cm.bar).textContent = app.dirty ? 'Unsaved changes' : f ? 'Painted (this browser)' : committed ? 'Painted (in the game)' : 'Plain texture';
  }

  /* ----- the card text in front of the paint ----- */
  // Two shadow roots: Kartenspiel's stylesheet and the card's own face markup, made see-through so the paint shows.
  var OVERLAY_CSS = '.card { background: transparent !important; box-shadow: none !important; }' +
    '.bottom, .hand { display: block; padding: 0; margin: 0; border: 0; overflow: visible; height: auto; min-height: 0; background: none; }' +
    '.hcard, .cell { position: absolute; left: 0; top: 0; margin: 0; }';
  function buildHosts() {
    var css = String(window.KCardCSS || '').replace(/:root/g, ':host');
    cm.hosts = ['hand', 'board'].map(function (kind) {
      var h = document.createElement('div'); h.className = 'cardtext'; h.setAttribute('aria-hidden', 'true');
      h.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;z-index:1;width:' + (kind === 'hand' ? HW : BW) * 2 + 'px;height:' + (kind === 'hand' ? HH : BH) * 2 + 'px';
      h.attachShadow({ mode: 'open' }).innerHTML = '<style>' + css + OVERLAY_CSS + '</style><div class="face"></div>';
      A.work().insertBefore(h, $('#over')); return h;
    });
  }
  function fillHosts(c) {
    cm.hosts[0].shadowRoot.querySelector('.face').innerHTML = '<div class="bottom"><div class="hand"><div class="hcard">' + F.handFace(c, { mid: true, art: c.art }) + '</div></div></div>';
    cm.hosts[1].shadowRoot.querySelector('.face').innerHTML = '<div class="boardinner"><div class="cell">' + F.boardBlank(c, { art: c.art }) + '</div></div>';
  }
  function placeHosts() {
    if (!cm) return;
    var z = app.zoom, s = z / 2;
    cm.hosts[0].style.transform = 'translate(' + Math.round(app.panX) + 'px,' + Math.round(app.panY) + 'px) scale(' + s + ')';
    cm.hosts[1].style.transform = 'translate(' + Math.round(app.panX + BX * z) + 'px,' + Math.round(app.panY) + 'px) scale(' + s + ')';
  }
  // Shade what isn't card: the gap between them, and below the (shorter) board picture.
  function shadeGap(g, toScreen, z) {
    if (!cm) return;
    g.fillStyle = getComputedStyle(A.work()).backgroundColor;
    function box(x0, y0, x1, y1) { var a = toScreen(x0, y0), b = toScreen(x1, y1); g.fillRect(Math.floor(a[0]) - 1, Math.floor(a[1]), Math.ceil(b[0]) - Math.floor(a[0]) + 2, Math.ceil(b[1]) - Math.floor(a[1]) + 1); }   // rounded out, so no hairline shows
    box(HW, 0, BX, DH); if (BH < DH) box(BX, BH, DW, DH);
    g.fillStyle = '#fff'; g.font = '12px DotGothic16, sans-serif'; g.textBaseline = 'bottom';
    var l1 = toScreen(0, 0), l2 = toScreen(BX, 0); if (l1[1] > 16) { g.fillText('In hand', l1[0], l1[1] - 3); g.fillText('On the board', l2[0], l2[1] - 3); }
  }

  /* ----- loading a card ----- */
  function goTo(id) { var k = cm.list.findIndex(function (c) { return c.id === id; }); if (k < 0) return A.toast('There’s no card with the id “' + id + '”.'); if (k === cm.i && app.doc.w === DW) return; A.confirmDiscard(function () { cm.i = k; load(); }); }
  function step(d) { A.confirmDiscard(function () { cm.i = (cm.i + d + cm.list.length) % cm.list.length; load(); }); }
  // A card's canvas: its layers saved in Dithry, else its painted face, else its plain suit colour and texture.
  function load() {
    var c = cm.list[cm.i], draft = A.lsGet('dithry.card.' + c.id), face = F.faces()[c.id];
    if (A.PALETTES[c.suit]) app.palette = c.suit;   // each suit's own palette while you paint its cards
    A.lsSet('dithry.cardmode.last', c.id); history.replaceState(null, '', '#card=' + encodeURIComponent(c.id));
    app.allow = new Uint8Array(DW * DH);
    for (var y = 0; y < DH; y++) for (var x = 0; x < DW; x++) app.allow[y * DW + x] = (x < HW && y < HH) || (x >= BX && y < BH) ? 1 : 0;
    cm.busy = true;
    var done;
    if (draft && draft.w === DW && draft.h === DH) done = A.loadProject(draft);
    else done = (face ? Promise.all([A.decode(face.hand, HW, HH), A.decode(face.board, BW, BH)]) : Promise.resolve(null)).then(function (imgs) {
      var base = D.newLayer(DW, DH, imgs ? 'Painted face' : 'Card'), paint = D.newLayer(DW, DH, 'Paint');
      if (imgs) { blit(base.data, imgs[0].data, HW, HH, 0); blit(base.data, imgs[1].data, BW, BH, BX); }
      else { plain(base.data, c, HW, HH, 0); plain(base.data, c, BW, BH, BX); }
      app.doc = { w: DW, h: DH, active: 1, layers: [base, paint] }; app.undo = []; app.redo = []; app.dirty = false;
      A.setupCanvas(); A.renderSide();
    });
    return done.then(function () {
      cm.busy = false; app.name = c.name; app.dirty = false; A.renderTitle(); fillHosts(c); A.fit(); placeHosts(); updateBar();
      if (app.doc.layers.length > 1 && app.doc.active === 0) { app.doc.active = app.doc.layers.length - 1; A.renderSide(); }
    }, function () { cm.busy = false; A.toast('That card’s saved painting couldn’t be read.'); });
  }
  function blit(dst, src, w, h, ox) { for (var y = 0; y < h; y++) dst.set(src.subarray(y * w * 4, (y + 1) * w * 4), (y * DW + ox) * 4); }
  // The card as the game draws it with no painting: its suit colour, with the suit's dithered texture on top.
  function plain(dst, c, w, h, ox) {
    var bg = D.rgba((c.type === 'Foundation' ? F.FOUND_BG : F.SUIT_BG)[c.suit] || '#ffffff', 1), t = F.texPixels(c.suit, c.id, w, h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4, j = (y * DW + x + ox) * 4, a = t[i + 3] / 255;
      dst[j] = Math.round(bg[0] * (1 - a) + t[i] * a); dst[j + 1] = Math.round(bg[1] * (1 - a) + t[i + 1] * a); dst[j + 2] = Math.round(bg[2] * (1 - a) + t[i + 2] * a); dst[j + 3] = 255;
    }
  }

  /* ----- saving to Kartenspiel ----- */
  function crop(flat, x0, w, h) { var out = new Uint8ClampedArray(w * h * 4); for (var y = 0; y < h; y++) out.set(flat.subarray((y * DW + x0) * 4, (y * DW + x0 + w) * 4), y * w * 4); return A.toCanvas(out, w, h).toDataURL('image/png'); }
  function save() {
    if (!cm) return;
    var c = cm.list[cm.i], flat = A.flatten(), mine = myFaces();
    mine[c.id] = { hand: crop(flat, 0, HW, HH), board: crop(flat, BX, BW, BH) };
    if (!A.lsSet('ks.faces', mine)) return A.toast('This browser’s storage is full, so the card couldn’t be saved. Export an art pack to keep your work.');
    A.lsSet('dithry.card.' + c.id, A.projectJSON());   // the layers, so you can keep working on them later
    app.dirty = false; A.renderTitle(); updateBar();
    A.toast('Saved “' + c.name + '” to Kartenspiel. Open Kartenspiel in this browser to see it (an open tab updates by itself).');
  }
  function resetCard() {
    var c = cm.list[cm.i], committed = typeof KCardArt !== 'undefined' && KCardArt[c.id];
    var m = A.modal('Reset “' + c.name + '”', '<p>This removes the painting you saved in this browser' + (committed ? '. The card goes back to the art that’s built into the game.' : ', and the card goes back to its plain suit texture.') + '</p>' +
      (committed ? '<label class="row"><input type="checkbox" id="rPlain"> Also hide the built-in art (use the plain texture)</label>' : ''),
      '<button class="btn" data-close>Cancel</button><button class="btn def" id="rGo">Reset</button>');
    $('#rGo', m).onclick = function () {
      var mine = myFaces(), plainToo = committed && $('#rPlain', m).checked; if (plainToo) mine[c.id] = null; else delete mine[c.id];
      A.lsSet('ks.faces', mine); try { localStorage.removeItem('dithry.card.' + c.id); } catch (e) { }
      A.closeModal(); app.dirty = false; load().then(function () { A.toast('Reset “' + c.name + '”.'); });
    };
  }

  /* ----- art packs: every painted card in one file ----- */
  function packDialog() {
    var all = F.faces(), n = Object.keys(all).length;
    var m = A.modal('Card art pack', '<p>' + n + ' card' + (n === 1 ? ' is' : 's are') + ' painted in this browser (including any built into the game).</p>' +
      '<p><b>Download</b> saves them all in one file: a backup, or a way to move them to another device or browser.</p>' +
      '<p>To put them in the game for <i>every</i> player, add the file to the repository with <code>node tools/cardart.js kartenspiel-card-art.json</code> and push: it writes <code>src/cardart.js</code>, which the site builds in.</p>',
      '<button class="btn" data-close>Close</button><button class="btn" id="pIn">Import…</button><button class="btn def" id="pOut"' + (n ? '' : ' disabled') + '>Download</button>');
    $('#pOut', m).onclick = function () {
      var blob = new Blob([JSON.stringify({ app: 'Kartenspiel card art', version: 1, faces: all })], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'kartenspiel-card-art.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      A.closeModal(); A.toast('Downloaded kartenspiel-card-art.json.');
    };
    $('#pIn', m).onclick = function () {
      var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = function () {
        var r = new FileReader(); r.onload = function () {
          try { var p = JSON.parse(r.result); if (!p || !p.faces) throw 0; var mine = myFaces(), k = 0; for (var id in p.faces) if (p.faces[id] && p.faces[id].hand && p.faces[id].board) { mine[id] = p.faces[id]; k++; }
            A.lsSet('ks.faces', mine); A.closeModal(); app.dirty = false; load(); A.toast('Imported ' + k + ' painted card' + (k === 1 ? '' : 's') + '.'); }
          catch (e) { A.toast('That file isn’t a card art pack.'); }
        }; r.readAsText(i.files[0]);
      };
      i.click();
    };
  }

  /* ----- wiring ----- */
  A.hooks.enter = function () { enter(); };
  A.hooks.leave = function () { if (cm && !cm.busy) leave(); };
  A.hooks.save = function () { save(); };
  A.hooks.start = function () { var m = /^#card(?:s|=(.+))$/.exec(location.hash); if (m) return enter(m[1] ? decodeURIComponent(m[1]) : null); };
  window.addEventListener('hashchange', function () { var m = /^#card=(.+)$/.exec(location.hash); if (m && (!cm || cm.list[cm.i].id !== decodeURIComponent(m[1]))) enter(decodeURIComponent(m[1])); });
  document.addEventListener('keydown', function (e) {
    if (!cm || $('#modal') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'PageUp') { e.preventDefault(); step(-1); } else if (e.key === 'PageDown') { e.preventDefault(); step(1); }
  });
  window.DithryCards = { enter: enter, leave: leaveToPicture, save: save, goTo: goTo, step: step, current: function () { return cm && cm.list[cm.i]; }, size: [DW, DH, BX] };
})();
