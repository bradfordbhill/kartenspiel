(function () {
  'use strict';
  const K = Claudenspiel, B = ClaudenBot, C = K.C;
  const app = document.getElementById('app'), modal = document.getElementById('modal');
  const COL = { Wood: 'var(--Wood)', Stone: 'var(--Stone)', Sea: 'var(--Sea)', Ember: 'var(--Ember)', Wild: 'var(--Wild)' };
  const typeColor = (c) => (c.suit ? COL[c.suit] : c.type === 'coin' ? 'var(--coin)' : c.type === 'relic' ? 'var(--relic)' : c.type === 'event' ? 'var(--event)' : 'var(--curse)');
  const art = (c) => (c.suit ? K.GLYPH[c.suit] : c.type === 'coin' ? '◉' : c.type === 'relic' ? '♛' : c.type === 'event' ? '⚑' : '☠');
  let G = null, me = 0, sel = null, trashSel = [], msg = '', botKind = 'balanced', botTimer = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function cardHTML(id, o) {
    o = o || {}; const c = C[id];
    return `<div class="card ${o.cls || ''} ${o.sm ? 'sm' : ''}" data-id="${id}" ${o.i != null ? `data-i="${o.i}"` : ''} style="--c:${typeColor(c)}" title="${esc(c.name + ': ' + c.text)}">
      <div class="cost">${c.cost}</div>${o.left != null ? `<div class="left">×${o.left}</div>` : ''}
      <div class="nm">${esc(c.name)}</div><div class="art">${art(c)}</div>
      <div class="ty">${c.type === 'tile' ? c.suit + ' tile' : c.type}</div><div class="tx">${esc(c.text)}</div></div>`;
  }
  function boardHTML(pi, interactive, small) {
    const p = G.players[pi], groups = K.score(G, pi).groups;
    const inReg = new Set(); groups.forEach((g) => g.cells.forEach((k) => inReg.add(k)));
    const legal = interactive && sel != null ? K.cells(p) : [];
    const xs = p.tab.map((t) => t.x).concat(legal.map((c) => c.x)), ys = p.tab.map((t) => t.y).concat(legal.map((c) => c.y));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    let h = `<div class="board ${small ? 'small' : ''}" style="grid-template-columns:repeat(${x1 - x0 + 1},auto)">`;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = p.tab.find((q) => q.x === x && q.y === y);
      if (t) { const c = C[t.id]; h += `<div class="cell"><div class="tile ${inReg.has(x + ',' + y) ? 'reg' : ''}" style="--c:${typeColor(c)}" title="${esc(c.name + ': ' + c.text)}"><span class="g">${K.GLYPH[c.suit]}</span>${esc(c.name)}${c.vp ? `<span class="vp">${c.vp}♦</span>` : ''}</div></div>`; }
      else if (legal.some((c) => c.x === x && c.y === y)) h += `<div class="cell legal" data-x="${x}" data-y="${y}"></div>`;
      else h += '<div class="cell" style="border-color:transparent"></div>';
    }
    return h + '</div>';
  }
  function groupsHTML(pi) {
    const sc = K.score(G, pi);
    const g = sc.groups.map((r) => `<span>${K.GLYPH[r.suit]} ×${r.size} = ${r.vp}</span>`).join('');
    return `<div class="groups">${g || 'No linked regions yet.'}</div>`;
  }
  function panelHTML(pi) {
    const p = G.players[pi], sc = K.score(G, pi), isMe = pi === me;
    const h = C[K.HOUSES[p.house].seat];
    return `<div class="panel"><h3><span style="color:${COL[K.HOUSES[p.house].suit]}">${esc(p.name)} ${K.GLYPH[K.HOUSES[p.house].suit]}</span><small>${sc.total} VP · deck ${p.deck.length} · discard ${p.discard.length}${isMe ? '' : ' · hand ' + p.hand.length}</small></h3>
      <div style="font-size:12px;color:var(--mute)">${esc(h.name)}: ${esc(h.text)}</div>
      ${boardHTML(pi, isMe, !isMe)}${groupsHTML(pi)}</div>`;
  }
  const isBot = () => G.active !== me;

  function render() {
    if (!G) return setup();
    const st = G, p = st.players[me], act = st.active === me && !st.over;
    const pend = st.pending;
    let h = `<div class="status"><div class="turnbanner">${st.over ? 'Game over' : (act ? 'Your turn' : esc(st.players[st.active].name) + ' is thinking…')} <small style="color:var(--mute)">· round ${st.round}/${K.MAX_ROUNDS}</small></div>`;
    if (act) h += `<div class="stat">Coins <b>${K.avail(st)}</b></div><div class="stat">Buys <b>${st.ti.buys}</b></div><div class="stat">Places <b>${st.ti.places}</b></div><div class="stat">Event <b>${st.ti.events}</b></div>`;
    h += `<div class="stat">Piles empty <b>${K.emptyPiles(st)}/3</b></div></div>`;
    h += '<div class="game"><div>';
    for (let i = st.players.length - 1; i >= 0; i--) if (i !== me) h += panelHTML(i);
    h += panelHTML(me);
    h += `<div class="panel" style="margin-top:12px"><h3>Chronicle</h3><div id="log">${st.log.slice(-40).map((l) => `<div>${esc(l)}</div>`).join('')}</div></div></div><div>`;
    const sup = (ids, title) => `<div class="supplyrow"><h4>${title}</h4><div class="cards">${ids.map((id) => {
      const left = st.supply[id], can = act && left > 0 && (pend ? pend.kind === 'gain' && C[id].cost <= pend.max : K.avail(st) >= C[id].cost && st.ti.buys > 0);
      return cardHTML(id, { left, cls: (can ? 'hot ' : 'dim ') + (left ? '' : 'dim'), sm: true });
    }).join('')}</div></div>`;
    h += `<div class="panel"><h3>The Market <small>${st.supply.curse} Blights left</small></h3>`;
    h += sup(st.kingdom.filter((i) => C[i].type === 'tile').sort((a, b) => C[a].cost - C[b].cost), 'Tiles');
    h += sup(st.kingdom.filter((i) => C[i].type === 'event').sort((a, b) => C[a].cost - C[b].cost), 'Events');
    h += sup(['mark', 'crown', 'shard', 'idol', 'monument'], 'Treasury & Relics');
    h += '</div></div></div>';
    h += `<div class="panel handbar"><h3>Your hand <small>${p.hand.length} cards · ${K.handCoins(p)} coins in hand</small></h3><div class="msg">${esc(pend ? (pend.kind === 'trash' ? `Choose up to ${pend.max} cards to trash, then confirm.` : `Choose a card costing up to ${pend.max} to gain.`) : msg)}</div>
      <div class="cards">${p.hand.map((id, i) => cardHTML(id, { i, cls: (sel === i || trashSel.includes(i)) ? 'sel' : '' })).join('') || '<i>empty</i>'}</div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">`;
    if (pend && pend.kind === 'trash') h += `<button class="primary" id="b-trash">Trash ${trashSel.length} card(s)</button>`;
    else if (pend) h += `<button id="b-skip">Gain nothing</button>`;
    else h += `<button class="primary" id="b-end" ${act ? '' : 'disabled'}>End turn</button>`;
    h += '</div></div>';
    app.innerHTML = h;
    const log = document.getElementById('log'); if (log) log.scrollTop = 1e6;
    if (st.over) return showEnd();
    if (isBot()) { clearTimeout(botTimer); botTimer = setTimeout(botStep, window.__fast ? 0 : 650); }
  }

  function botStep() {
    if (!G || G.over || !isBot()) return;
    const a = B.choose(G, botKind);
    const err = K.apply(G, a);
    if (err) { K.apply(G, { t: 'end' }); }
    render();
  }
  function act(a) { const e = K.apply(G, a); msg = e || ''; sel = null; trashSel = []; render(); return !e; }

  app.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-id],[data-x],#b-end,#b-trash,#b-skip,.house,#go');
    if (!t) return;
    if (t.classList.contains('house')) { document.querySelectorAll('.house').forEach((e) => e.classList.remove('sel')); t.classList.add('sel'); return; }
    if (t.id === 'go') return startFromSetup();
    if (!G || G.over || G.active !== me) return;
    const pend = G.pending;
    if (t.id === 'b-end') return act({ t: 'end' });
    if (t.id === 'b-trash') return act({ t: 'trash', idxs: trashSel });
    if (t.id === 'b-skip') return act({ t: 'gain', id: null });
    if (t.dataset.x != null) return act({ t: 'place', i: sel, x: +t.dataset.x, y: +t.dataset.y });
    const id = t.dataset.id;
    if (t.dataset.i != null) { // hand card
      const i = +t.dataset.i;
      if (pend && pend.kind === 'trash') { trashSel = trashSel.includes(i) ? trashSel.filter((x) => x !== i) : trashSel.concat(i).slice(-pend.max); return render(); }
      if (pend) return;
      if (C[id].type === 'tile') { if (G.ti.places < 1) { msg = 'No placements left this turn.'; return render(); } sel = sel === i ? null : i; msg = sel != null ? 'Click a glowing cell in your tableau.' : ''; return render(); }
      if (C[id].type === 'event') return act({ t: 'event', i });
      msg = C[id].type === 'coin' ? 'Coins in hand count automatically when you buy.' : 'That card scores at the end of the game.'; return render();
    }
    if (pend && pend.kind === 'gain') return act({ t: 'gain', id });
    return act({ t: 'buy', id });
  });

  function setup() {
    app.innerHTML = `<div class="setup"><h2>Choose your House</h2><p style="color:var(--mute)">Buy cards, thin your deck, and raise a tableau of linked tiles inside a 4×4 window. Tiles you place leave your deck for good, so choose when to build.</p>
    <div class="houses">${Object.values(K.HOUSES).map((h, i) => `<div class="house ${i === 0 ? 'sel' : ''}" data-h="${h.id}" data-g="${K.GLYPH[h.suit]}" style="--c:${COL[h.suit]}"><h3>${h.name}</h3><p>${h.blurb}</p><div class="pw">${esc(C[h.seat].text)}</div></div>`).join('')}</div>
    <div class="row"><label>Rival <select id="opp"><option value="random">Random house</option>${Object.values(K.HOUSES).map((h) => `<option value="${h.id}">${h.name}</option>`).join('')}</select></label>
    <label>Rival style <select id="kind"><option value="balanced">Balanced</option><option value="builder">Builder (harder)</option><option value="money">Money-grubber (easier)</option></select></label>
    <label>Seed <input id="seed" size="8" placeholder="random"></label></div>
    <div class="row"><button class="primary" id="go" style="font-size:18px;padding:10px 30px">Begin</button></div></div>`;
  }
  function startFromSetup() {
    const mine = document.querySelector('.house.sel').dataset.h;
    let opp = document.getElementById('opp').value;
    const hs = Object.keys(K.HOUSES);
    if (opp === 'random') opp = hs[Math.floor(Math.random() * 4)];
    botKind = document.getElementById('kind').value;
    const sv = document.getElementById('seed').value.trim();
    const seed = sv ? Array.from(sv).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) : Math.floor(Math.random() * 1e9);
    me = 0; G = K.newGame({ seed, houses: [mine, opp], names: ['You', 'The Rival'] });
    G.players[1].name = 'The Rival';
    sel = null; trashSel = []; msg = ''; render();
  }
  function showEnd() {
    const sc = G.players.map((_, i) => K.score(G, i));
    const rows = [['Relics', 'relics'], ['Blights', 'curses'], ['Tile points', 'tiles'], ['Tile rules', 'rules'], ['Linked regions', 'regions'], ['Total', 'total']];
    modal.hidden = false;
    modal.innerHTML = `<div class="dlg"><h2>${G.winner === me ? 'Victory!' : G.winner < 0 ? 'A shared victory' : 'Defeat'}</h2>
      <div class="win">${sc.map((s) => s.total).join(' – ')}</div>
      <table class="sc"><tr><th></th>${G.players.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>${rows.map(([n, k]) => `<tr><td>${n}</td>${sc.map((s) => `<td>${s[k]}</td>`).join('')}</tr>`).join('')}</table>
      <div class="row"><button class="primary" id="again">Play again</button><button id="close">Close</button></div></div>`;
    modal.querySelector('#again').onclick = () => { modal.hidden = true; G = null; render(); };
    modal.querySelector('#close').onclick = () => { modal.hidden = true; };
  }
  function showRules() {
    modal.hidden = false;
    modal.innerHTML = `<div class="dlg"><h2>How to play</h2><ol>
      <li><b>Your turn.</b> You hold a hand of cards. In any order: <b>place one tile</b> from hand into your tableau, <b>play one event</b>, and <b>buy one card</b> (spend coin cards in hand plus your tableau's income). Then discard everything and draw a new hand.</li>
      <li><b>Tiles.</b> Placed tiles must touch your existing tiles (not diagonally) and the whole tableau must fit in a <b>4×4 window</b>. A placed tile leaves your deck forever, but it gives income, abilities and points.</li>
      <li><b>Regions.</b> Orthogonally linked tiles of the same suit score: 2 tiles = 1, 3 = 2, 4 = 3, 5 = 5, 6 = 6, 7 = 9, 8 = 11 … Wild tiles link every suit. Gold outlines show linked tiles.</li>
      <li><b>Relics</b> (Shard, Idol, Monument) are points in your deck. <b>Blights</b> cost 1 VP; a Watchtower wards them off.</li>
      <li><b>Houses.</b> Each House starts with a unique seat tile: Verdant pays for Wood, Crypt draws when building, Tide holds bigger hands, Forge places two tiles a turn.</li>
      <li><b>End.</b> When 3 market piles or the Monuments run out (or after round ${K.MAX_ROUNDS}), the round finishes and the highest total wins. Ties go to the bigger tableau.</li></ol>
      <div class="row"><button class="primary" id="close">To the table</button></div></div>`;
    modal.querySelector('#close').onclick = () => { modal.hidden = true; };
  }
  document.getElementById('btn-rules').onclick = showRules;
  document.getElementById('btn-new').onclick = () => { if (!G || G.over || confirm('Abandon this game?')) { clearTimeout(botTimer); modal.hidden = true; G = null; render(); } };
  window.__claudenspiel = { get G() { return G; }, render };
  render();
})();
