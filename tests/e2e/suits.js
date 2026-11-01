// Browser test of the suit wheel and the placement chevrons (green: this card would pressure that one;
// red: that one would pressure this card). Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/suits.js
const { chromium, devices } = require('playwright');
const path = require('path');
const REPO = path.join(__dirname, '..', '..'), D = require(REPO + '/src/data.js'), E = require(REPO + '/src/engine.js');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

// You (Archbishop) hold a Sceptre Structure, a Sword Structure and a placement Action. On the board, around the
// space 1,0: a Tome card to the west, a Goblet card to the east and a Sword card to the north; a Bone card under 4,0.
let st = E.newGame(D.STARTER, { seed: 4, players: [{ name: 'You', arch: 'Archbishop', color: '#d42020' }, { name: 'Them', arch: 'Hedonist', color: '#1f4fd1' }] });
const A = a => { const r = E.apply(st, a); if (r.error) throw new Error(a.t + ' ' + r.error); st = r; };
A({ t: 'startTurn' }); st.players[0].ap = 99;
A({ t: 'sbPlace', id: 'cathedral', k: '0,3', owner: 0 }); A({ t: 'sbPlace', id: 'palace', k: '6,3', owner: 1 });
[['post-office', '0,0'], ['fairgrounds', '2,0'], ['front-lines', '1,-1'], ['funeral-pyre', '4,1']].forEach(([id, k]) => { A({ t: 'sbPlace', id, k }); A({ t: 'sbClaim', k, owner: 1 }); });
const give = id => { A({ t: 'sbGive', i: 0, id }); return st.players[0].hand.at(-1); };
const sanc = give('sanctuary'), enc = give('encampment'), phal = give('phalanx');

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.addInitScript(s => { localStorage.setItem('ks.game', s); localStorage.setItem('ks.prefs', '{"patchNotes":false}'); }, JSON.stringify(st));   // a seeded game looks like a returning player: no update message
  await p.goto('file://' + REPO + '/index.html'); await p.click('[data-act="resume"]');
  const chevs = k => p.$$eval('.cell:has([data-cell="' + k + '"]) .chev', els => els.map(e => (e.classList.contains('g') ? 'green ' : 'red ') + [...e.classList].find(c => c.startsWith('d-')).slice(2)).sort().join(', '));

  await p.click('.bottom [data-hand="' + sanc + '"]');
  ok(await chevs('1,0') === 'green E, red N, red W', 'Sceptre between Tome and Goblet: green toward the Goblet, red from the Tome (and from the Sword above): ' + await chevs('1,0'));
  await p.keyboard.press('Escape');
  await p.click('.bottom [data-hand="' + enc + '"]');
  ok(await chevs('4,0') === 'green S, red S', 'Sword above a Bone card: both ways (' + await chevs('4,0') + ')');
  await p.keyboard.press('Escape');
  await p.click('.bottom [data-hand="' + phal + '"]');
  ok((await p.$$('.cell.legal')).length > 0 && (await p.$$('.cell.legal .chev')).length === 0, 'an Action that gets buried right after shows no chevrons');
  await p.keyboard.press('Escape');

  // dragging shows them too, brightest on the space under the card
  const from = await (await p.$('.bottom [data-hand="' + sanc + '"]')).boundingBox();
  await p.mouse.move(from.x + 40, from.y + 40); await p.mouse.down(); await p.mouse.move(from.x + 40, from.y + 10, { steps: 3 });
  const to = await (await p.$('.cell [data-cell="1,0"]')).boundingBox(); await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  ok((await p.$$('.cell.drophover .chev')).length === 3, 'while dragging, the target space shows its chevrons');
  await p.keyboard.press('Escape'); await p.mouse.move(5, 5); await p.mouse.up();   // dropped nowhere, then straight on to the next click

  // the wheel
  await p.click('[data-act="suits"]');
  const w = await p.$eval('.modal svg.suitwheel', s => ({ nodes: s.querySelectorAll('.wh-node').length, arch: s.querySelectorAll('line.arch').length, sword: s.querySelectorAll('line.sword').length }));
  ok(w.nodes === 6 && w.arch === 5 && w.sword === 5, 'the wheel: 6 suits, 5 chain arrows, 5 Sword arrows (' + JSON.stringify(w) + ')');
  ok(/weak to Tome and Sword/.test(await p.textContent('.modal')), 'it tells you your own weakness');
  await p.click('[data-act="closeModal"]');
  await p.click('[data-page="library"]'); await p.click('[data-act="suits"]'); ok(!!(await p.$('.modal svg.suitwheel')), 'the Cards page opens it too');
  await p.click('[data-act="closeModal"]'); await p.click('[data-page="help"]'); ok(!!(await p.$('.help svg.suitwheel')), 'and it’s on the Help page');

  // phone: in the Menu sheet
  const c = await b.newContext({ ...devices['iPhone 13'] }), ph = await c.newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.route(/fonts\.(googleapis|gstatic)/, r => r.abort()); await ph.addInitScript(s => { localStorage.setItem('ks.game', s); localStorage.setItem('ks.prefs', '{"patchNotes":false}'); }, JSON.stringify(st));   // a seeded game looks like a returning player: no update message
  await ph.goto('file://' + REPO + '/index.html'); await ph.tap('[data-act="resume"]'); await ph.tap('[data-sheet="menu"]'); await ph.tap('.msheet [data-act="suits"]');
  ok(!!(await ph.$('.modal svg.suitwheel')), 'on a phone, Menu → Suits opens the wheel');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
