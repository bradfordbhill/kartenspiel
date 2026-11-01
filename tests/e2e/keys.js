// End-to-end browser test of the keyboard shortcuts, in a pass-and-play game on the playtest table.
// Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/keys.js
const { chromium } = require('playwright');
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } }), errs = [];
  await p.addInitScript(() => { if (!localStorage.getItem('ks.prefs')) localStorage.setItem('ks.prefs', '{"confirmEnd":false}'); });   // these tests end turns directly; solo.js tests the end-turn check
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('file://' + REPO + '/index.html');
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('ks.game')));
  const overlay = () => p.$eval('[data-sel="overlay"]', e => e.value);

  // typing in a text box doesn't trigger shortcuts
  await p.click('[data-pname="0"]'); await p.keyboard.type('Eve');
  ok((await p.$eval('[data-pname="0"]', e => e.value)).endsWith('Eve') && !(await p.$('.modal')), 'letters typed into a name field stay text');

  await p.click('[data-act="start"]');
  await p.keyboard.press('Space');
  ok((await st()).turn.started, 'Space starts the turn (the dialog’s main button)');

  await p.keyboard.press('1');
  ok(!!(await p.$('.hcard.sel')), '1 selects the first card in hand');
  await p.keyboard.press('Escape');
  ok(!(await p.$('.hcard.sel')), 'Esc deselects it');

  await p.keyboard.down('q'); const held = await overlay(); await p.keyboard.up('q');
  ok(held === 'quick' && (await overlay()) === 'none', 'holding Q shows Quickview, releasing puts it back');
  await p.keyboard.down('w'); const heldW = await overlay(); await p.keyboard.up('w');
  ok(heldW === 'war' && (await overlay()) === 'none', 'holding W shows War');
  await p.keyboard.press('o'); const o1 = await overlay(); await p.keyboard.press('o'); const o2 = await overlay(); await p.keyboard.press('o');
  ok(o1 === 'quick' && o2 === 'war' && (await overlay()) === 'none', 'O cycles None → Quickview → War → None');

  await p.keyboard.press('g'); ok(!!(await p.$('.coord')), 'G turns on the grid'); await p.keyboard.press('g');
  const z0 = await p.textContent('#zoomlbl'); await p.keyboard.press('+'); const z1 = await p.textContent('#zoomlbl'); await p.keyboard.press('f');
  ok(z0 !== z1, '+ zooms (' + z0 + ' → ' + z1 + ')');

  // place the Foundation with the mouse, then claim nothing; E ends the turn
  const fIdx = await p.$$eval('.bottom .hcard .nm', els => els.findIndex(e => /Cathedral|Palace|Warcamp|Mausoleum|Orchard|Observatory/.test(e.textContent)));
  await p.keyboard.press(String(fIdx + 1)); await p.click('.cell.legal .cellbtn');
  await p.keyboard.press('u');
  ok(!(await st()).players[0].foundationPlaced, 'U undoes the play');
  await p.keyboard.press(String(fIdx + 1)); await p.click('.cell.legal .cellbtn');
  ok(((await p.$eval('[data-act="endTurn"]', e => e.title)) || '').includes('(E)'), 'buttons name their key in a tooltip');
  await p.keyboard.press('e');
  ok((await st()).cur === 1, 'E ends the turn');

  await p.keyboard.press('?');
  ok(/Keyboard shortcuts/.test(await p.textContent('.modal')), '? opens the list of shortcuts');
  await p.keyboard.press('e');
  ok((await st()).cur === 1 && !(await st()).turn.started, 'with a dialog open, board keys do nothing');
  await p.keyboard.press('Escape');
  ok(!(await p.$('.modal .titlebar >> text=Keyboard shortcuts')), 'Esc closes it');

  await p.keyboard.press('Space');                 // the next player's turn dialog is still up underneath
  ok((await st()).cur === 1 && (await st()).turn.started, 'Space starts the next player’s turn');
  await p.click('[data-page="help"]');
  ok(/Keyboard shortcuts/.test(await p.textContent('.help')), 'the Help page lists the shortcuts');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
