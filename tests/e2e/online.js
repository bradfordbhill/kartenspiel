// End-to-end browser test: the playtest table, then two browsers playing online through a local server.
// Needs Playwright with Chromium (not a project dependency). Run: ./build.sh && node tests/e2e/online.js [screenshot folder]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-shots-'));
const { createServer } = require(REPO + '/server/server.js');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function page(name) {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    return p;
  }

  // 1. playtest table still has everything
  const t = await page('table');
  await t.goto('file://' + REPO + '/index.html');
  const tabs = await t.$$eval('.tab', els => els.map(e => e.textContent));
  ok(tabs.includes('Card builder') && tabs.includes('Sandbox'), 'table keeps builder and sandbox: ' + tabs.join(', '));
  await t.click('[data-act="start"]'); await t.click('[data-act="startTurn"]');
  for (const pg of ['sandbox', 'builder', 'help', 'library']) await t.click(`[data-page="${pg}"]`);
  ok(await t.$('[data-act="newCard"]'), 'table library is editable');

  // 2. public site against a local server
  const app = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kse-')), gameGrace: 1500 });
  const url = 'http://localhost:' + await app.listen(0) + '/';
  const a = await page('Ann'), c = await page('Bob');
  await a.goto(url);
  const stabs = await a.$$eval('.tab', els => els.map(e => e.textContent));
  ok(!stabs.includes('Card builder') && !stabs.includes('Sandbox') && stabs.includes('Online'), 'site tabs: ' + stabs.join(', '));
  await a.screenshot({ path: SHOTS + '/1-home.png' });
  await a.click('[data-page="library"]'); ok(!(await a.$('[data-act="newCard"]')) && !(await a.$('[data-act="editCard"]')), 'site card list is read-only');

  async function signUp(p, name) {
    await p.goto(url); await p.click('[data-page="online"]');
    await p.waitForSelector('[data-nf="name"]');
    await p.fill('[data-nf="name"]', name); await p.fill('[data-nf="pw"]', 'secret12');
    await p.click('[data-act="netRegister"]'); await p.waitForSelector('text=Server list');
  }
  await signUp(a, 'Ann'); await signUp(c, 'Bob');
  await a.fill('[data-nf="table"]', 'Friday table'); await a.click('[data-act="netCreate"]');
  await a.waitForSelector('text=Choose your archetype');
  await c.waitForSelector('text=Friday table'); await c.screenshot({ path: SHOTS + '/2-server-list.png' });
  await c.click('[data-act="netJoin"]'); await c.waitForSelector('text=Choose your archetype');
  await a.click('[data-arch="Warmonger"]'); await c.waitForSelector('text=Warmonger: Ann');
  ok(!(await c.$('[data-arch="Warmonger"]')), 'Bob can’t pick Ann’s archetype');
  await c.click('[data-arch="Gardener"]'); await a.waitForSelector('text=Gardener: Bob');
  await a.fill('[data-netopt="target"]', '30'); await a.press('[data-netopt="target"]', 'Tab');
  await c.waitForFunction(() => document.querySelector('[data-netopt="target"]').value === '30');
  ok(await c.$eval('[data-netopt="target"]', e => e.disabled), 'only the host edits options');
  await a.screenshot({ path: SHOTS + '/3-lobby.png' });
  await a.click('[data-act="netStart"]');

  // the game
  await a.waitForSelector('text=Start my turn'); await a.click('[data-act="startTurn"]');
  await c.waitForSelector('text=’s turn');
  ok(!(await c.$('text=Start my turn')), 'Bob waits while Ann plays');
  const annHand = await a.$$('.bottom .hcard'), bobHand = await c.$$('.bottom .hcard');
  ok(annHand.length === 7 && bobHand.length === 5, 'each player sees their own hand (Ann ' + annHand.length + ', Bob ' + bobHand.length + ')');
  // Ann plays her Foundation: pick it from hand, click the green cell
  const fIdx = await a.$$eval('.bottom .hcard .nm', els => els.findIndex(e => e.textContent === 'Warcamp'));
  await (await a.$$('.bottom .hcard .cellbtn'))[fIdx].click();
  await a.click('.cell.legal .cellbtn');
  await c.waitForSelector('.cell [aria-label^="Warcamp"]');
  ok(true, 'Bob sees Ann’s Foundation appear');
  await a.screenshot({ path: SHOTS + '/4-ann-turn.png' });
  await a.click('[data-act="endTurn"]');
  await c.waitForSelector('text=Start my turn'); await c.click('[data-act="startTurn"]');
  await c.screenshot({ path: SHOTS + '/5-bob-turn.png' });
  const end = await a.$eval('[data-act="endTurn"]', e => e.disabled);
  ok(end, 'Ann can’t end Bob’s turn');

  // Bob leaves mid-game: forfeit, Ann wins, stats appear on her profile
  await c.click('[data-act="netLeave"]'); await c.click('[data-act="netLeaveYes"]');
  await a.waitForSelector('text=Ann wins!');
  ok(await a.$('[data-act="netAgain"]'), 'host can reopen the table');
  await a.click('[data-page="profile"]'); await a.waitForSelector('text=Most played archetypes');
  const prof = await a.textContent('.online');
  ok(/1–0/.test(prof) && /Warmonger/.test(prof) && /Warcamp/.test(prof) && /Friday table/.test(prof), 'profile shows record, archetype, card and history');
  await a.screenshot({ path: SHOTS + '/6-profile.png' });

  // private table + invite code
  await a.click('[data-page="online"]'); await a.click('[data-act="netLeave"]');
  await a.waitForSelector('text=Server list'); await a.check('[data-nf="priv"][value="1"]'); await a.click('[data-act="netCreate"]');
  const code = (await a.textContent('b.code')).trim();
  await c.waitForSelector('text=Server list');
  ok(!(await c.$('text=Ann’s table')), 'private table not in Bob’s list');
  await c.fill('[data-nf="code"]', code.toLowerCase()); await c.click('[data-act="netJoinCode"]');
  await c.waitForSelector('text=Private table'); ok(true, 'Bob joins with code ' + code);

  // pass-and-play on the site
  const pp = await page('local'); await pp.goto(url); await pp.click('[data-page="new"]'); await pp.click('[data-act="start"]'); await pp.click('[data-act="startTurn"]');
  ok(await pp.$('[data-act="undo"]'), 'pass-and-play has undo and works offline-style');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); await app.close();
  console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
