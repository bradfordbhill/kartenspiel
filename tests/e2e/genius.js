// End-to-end browser test of the Genius bot on the public site: pick it for a seat, watch it think and play a turn.
// Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/genius.js [screenshot folder]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-genius-'));
const R = []; const ok = (c, m) => R.push([c ? 'PASS' : 'FAIL', m]);
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1400, height: 900 } }), errs = [];
  await p.addInitScript(() => { if (!localStorage.getItem('ks.prefs')) localStorage.setItem('ks.prefs', '{"confirmEnd":false,"patchNotes":false}'); });
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('file://' + REPO + '/site/index.html');
  await p.evaluate(() => { window.ksBotDelay = 30; });

  await p.click('[data-act="soloSetup"]');
  ok((await p.$$eval('[data-pkind="1"] option', os => os.map(o => o.value))).includes('genius'), 'the seat picker offers a Genius bot');
  await p.selectOption('[data-pkind="1"]', 'genius');
  ok((await p.$eval('[data-pname="1"]', e => e.value)) === 'Genius bot', 'choosing it names the seat Genius bot');
  await p.click('[data-act="start"]');

  // Your first turn: place your Foundation and end it; then the Genius thinks and plays.
  await p.click('[data-act="startTurn"]');
  const hand = await p.$$eval('.bottom .hcard .nm', els => els.map(e => e.textContent));
  const fIdx = hand.findIndex(n => ['Cathedral', 'Palace', 'Warcamp', 'Mausoleum', 'Orchard', 'Observatory'].includes(n));
  await (await p.$$('.bottom .hcard .cellbtn'))[fIdx].click(); await p.click('.cell.legal .cellbtn');
  await p.click('[data-act="endTurn"]');
  const thought = await p.waitForSelector('text=thinking…', { timeout: 20000 }).then(() => true).catch(() => false);
  ok(thought, 'the Genius shows that it is thinking');
  await p.screenshot({ path: SHOTS + '/1-thinking.png' });
  await p.waitForSelector('text=Start my turn', { timeout: 90000 });
  const log = await p.textContent('.log');
  ok(/Genius bot plays/.test(log), 'the Genius played cards on its turn (seen in the log)');
  ok(!(await p.$('text=thinking…')), 'the thinking note is gone once it has moved');
  await p.screenshot({ path: SHOTS + '/2-after.png' });
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  R.forEach(r => console.log(r[0], '|', r[1])); console.log('Screenshots:', SHOTS);
  if (R.some(r => r[0] === 'FAIL')) process.exitCode = 1;
})();
