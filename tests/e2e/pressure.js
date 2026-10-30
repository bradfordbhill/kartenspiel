// Browser test of the Overwhelm pressure bars: right sides, right colours, one-away glow and open-side marks.
// Needs Playwright with Chromium. Run: ./build.sh && node tests/e2e/pressure.js [screenshot folder]
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-press-'));
const D = require(REPO + '/src/data.js'), E = require(REPO + '/src/engine.js');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const RED = '#d42020', BLUE = '#1f4fd1', GREEN = '#138a36';

let st = E.newGame(D.STARTER, { sandbox: true, players: [{ name: 'Red', arch: 'Warmonger', color: RED }, { name: 'Blue', arch: 'Hedonist', color: BLUE }, { name: 'Green', arch: 'Archbishop', color: GREEN }] });
const A = a => { const r = E.apply(st, a); if (r.error) throw new Error(a.t + ' ' + r.error); st = r; };
const put = (id, k, o) => { A({ t: 'sbPlace', id, k }); if (o != null) A({ t: 'sbClaim', k, owner: o }); };
put('sanctuary', '2,0', 1); put('front-lines', '1,0', 0); put('post-office', '2,-1', 2);   // Sceptre: Sword on W (red), Tome on N (green): 2/3, one away
put('fairgrounds', '5,0', 2); put('artillery', '6,0', 0);                                     // Goblet: Sword on E (red): 1/3
A({ t: 'sbPlace', id: 'cathedral', k: '2,3', owner: 2 }); put('encampment', '1,2', 0); put('public-forum', '2,4', 1); put('watchtower', '3,4');   // Foundation: NW red, S blue, SE grey
put('acorn', '8,0', 2);                                                                       // no enemies: no bars

(async () => {
  const b = await chromium.launch(), errs = [];
  async function load(ctxOpts) {
    const c = await b.newContext(ctxOpts), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await p.addInitScript(s => localStorage.setItem('ks.sandbox', s), JSON.stringify(st));
    await p.goto('file://' + REPO + '/index.html'); await p.click('[data-page="sandbox"]'); await p.click('[data-sbmode="look"]'); return p;
  }
  const p = await load({ viewport: { width: 1400, height: 900 } });
  const bars = k => p.$$eval('.cell:has([data-cell="' + k + '"]) .press .pe', els => els.map(e => e.className.replace('pe pe-', '') + ':' + getComputedStyle(e).getPropertyValue('--pc').trim()).sort().join(' '));
  const hot = k => p.$eval('.cell:has([data-cell="' + k + '"])', e => !!e.querySelector('.press.hot'));
  const open = k => p.$$eval('.cell:has([data-cell="' + k + '"]) .press .po', els => els.map(e => e.className.replace('po pe-', '')).sort().join(' '));
  ok(await bars('2,0') === 'N:' + GREEN + ' W:' + RED, 'pressure from the north (green Tome) and west (red Sword): ' + await bars('2,0'));
  ok(await hot('2,0') && await open('2,0') === 'E S', 'one away: the bars glow and the open east and south sides are marked');
  ok(await bars('5,0') === 'E:' + RED && !(await hot('5,0')), 'light pressure from the east, no glow');
  ok(await bars('2,3') === 'NW:' + RED + ' S:' + BLUE + ' SE:#7a7a7a', 'a Foundation shows its diagonals as corners, unclaimed in grey: ' + await bars('2,3'));
  ok(await bars('8,0') === '', 'a card with no enemy neighbours has no bars');
  await p.screenshot({ path: SHOTS + '/desktop.png' });
  await p.click('[data-tog="showOW"]');
  ok(!(await p.$('.press')), 'turning off “Overwhelm pressure” hides the bars');
  // the same board as a single-player game on a phone, dark mode (the sandbox has no phone layout)
  let g = E.newGame(D.STARTER, { seed: 3, players: [{ name: 'You', arch: 'Warmonger', color: RED }, { name: 'Blue', arch: 'Hedonist', color: BLUE }, { name: 'Green', arch: 'Archbishop', color: GREEN }] });
  const G = a => { const r = E.apply(g, a); if (r.error) throw new Error(a.t + ' ' + r.error); g = r; };
  G({ t: 'startTurn' }); g.players[1].bot = 'tactician'; g.players[2].bot = 'warlord';
  [['sanctuary', '2,0', 1], ['front-lines', '1,0', 0], ['post-office', '2,-1', 2], ['fairgrounds', '5,0', 2], ['artillery', '6,0', 0]].forEach(([id, k, o]) => { G({ t: 'sbPlace', id, k }); G({ t: 'sbClaim', k, owner: o }); });
  const c2 = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' }), ph = await c2.newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ph.addInitScript(s => { localStorage.setItem('ks.game', s); window.ksBotDelay = 1e9; }, JSON.stringify(g));
  await ph.goto('file://' + REPO + '/site/index.html'); await ph.tap('[data-act="hotseatSetup"]'); await ph.tap('[data-act="resume"]'); await ph.waitForTimeout(300);
  ok((await ph.$$('.mgame .press .pe')).length >= 3 && !!(await ph.$('.mgame .press.hot')), 'the bars show in the phone layout too');
  await ph.screenshot({ path: SHOTS + '/phone-dark.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
