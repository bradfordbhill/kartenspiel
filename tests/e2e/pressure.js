// Browser test of the Overwhelm pressure chevrons: right sides, suit colours, pointing the right way, one-away emphasis.
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
put('sanctuary', '2,0', 1); put('front-lines', '1,0', 0); put('post-office', '2,-1', 2);   // Sceptre: Sword on W, Tome on N: 2/3, one away
put('fairgrounds', '5,0', 2); put('artillery', '6,0', 0); put('crumbling-ossuary', '6,1', 1);   // Sword and Bone pressure each other                                     // Goblet: Sword on E: 1/3
A({ t: 'sbPlace', id: 'cathedral', k: '2,3', owner: 2 }); put('encampment', '1,2', 0); put('public-forum', '2,4', 1); put('watchtower', '3,4');   // Foundation: Sword NW, Tome S, Sword SE
put('acorn', '8,0', 2);                                                                       // no enemies: no chevrons

(async () => {
  const b = await chromium.launch(), errs = [];
  async function load(ctxOpts) {
    const c = await b.newContext(ctxOpts), p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await p.addInitScript(s => { localStorage.setItem('ks.sandbox', s); localStorage.setItem('ks.prefs', '{"patchNotes":false}'); }, JSON.stringify(st));
    await p.goto('file://' + REPO + '/index.html'); await p.click('[data-page="sandbox"]'); await p.click('[data-sbmode="look"]'); return p;
  }
  const p = await load({ viewport: { width: 1400, height: 900 } });
  // the chevrons pointing at the card at k, as "side:suit", sorted
  const bars = k => p.$$eval('.gchev[data-k="' + k + '"]', els => els.map(e => e.dataset.d + ':' + e.dataset.suit).sort().join(' '));
  const hot = k => p.$$eval('.gchev[data-k="' + k + '"]', els => els.length > 0 && els.every(e => e.classList.contains('hot')));
  ok(await bars('2,0') === 'N:Tome W:Sword', 'pressure from the north (Tome) and west (Sword): ' + await bars('2,0'));
  ok(await hot('2,0') && await p.$eval('.gchev[data-k="2,0"]', e => getComputedStyle(e).opacity) === '1', 'one away: the chevrons are bigger and solid');
  ok(await bars('5,0') === 'E:Sword' && !(await hot('5,0')), 'light pressure from the east, normal size');
  ok(await bars('2,3') === 'NW:Sword S:Tome SE:Sword', 'a Foundation counts its diagonals: ' + await bars('2,3'));
  ok(await p.$$eval('.gchev[data-k="2,3"].dg', els => els.length) === 2, 'diagonal chevrons are the small kind');
  ok(await bars('6,0') === 'S:Bone' && await bars('6,1') === 'N:Sword', 'Sword and Bone pressing each other get one chevron each way');
  const pair = await p.$$eval('.gchev[data-k="6,0"], .gchev[data-k="6,1"]', els => els.map(e => e.getBoundingClientRect().left));
  ok(pair.length === 2 && Math.abs(pair[0] - pair[1]) > 12, 'side by side, not on top of each other');
  ok(await bars('8,0') === '', 'a card with no enemy neighbours has none');
  // every chevron sits in the gutter: it overlaps no card, and it points from the presser to the pressed card
  const geo = await p.$$eval('.gchev', els => { const cards = [...document.querySelectorAll('.cell .card')].map(c => c.getBoundingClientRect());
    return els.map(e => { const r = e.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const tgt = document.querySelector('[data-cell="' + e.dataset.k + '"]').getBoundingClientRect(), tx = (tgt.left + tgt.right) / 2, ty = (tgt.top + tgt.bottom) / 2;
      const inCard = cards.some(c => cx > c.left + 1 && cx < c.right - 1 && cy > c.top + 1 && cy < c.bottom - 1);
      const m = /rotate\(([-\d.e]+)deg\)/.exec(e.style.transform), a = +m[1] * Math.PI / 180, dot = Math.cos(a) * (tx - cx) + Math.sin(a) * (ty - cy);
      return { inCard, toward: dot > 0, col: getComputedStyle(e).backgroundColor }; }); });
  ok(geo.length >= 6 && geo.every(g => !g.inCard), 'every chevron sits in a gutter, off the cards');
  ok(geo.every(g => g.toward), 'every chevron points at the card it pressures');
  ok(new Set(geo.map(g => g.col)).size >= 2, 'different suits, different colours (' + [...new Set(geo.map(g => g.col))].join(', ') + ')');
  await p.screenshot({ path: SHOTS + '/desktop.png' });
  await p.click('[data-tog="showOW"]');
  ok(!(await p.$('.gchev')), 'turning off “Overwhelm pressure” hides the chevrons');
  // the same board as a single-player game on a phone, dark mode (the sandbox has no phone layout)
  let g = E.newGame(D.STARTER, { seed: 3, players: [{ name: 'You', arch: 'Warmonger', color: RED }, { name: 'Blue', arch: 'Hedonist', color: BLUE }, { name: 'Green', arch: 'Archbishop', color: GREEN }] });
  const G = a => { const r = E.apply(g, a); if (r.error) throw new Error(a.t + ' ' + r.error); g = r; };
  G({ t: 'startTurn' }); g.players[1].bot = 'tactician'; g.players[2].bot = 'warlord';
  [['sanctuary', '2,0', 1], ['front-lines', '1,0', 0], ['post-office', '2,-1', 2], ['fairgrounds', '5,0', 2], ['artillery', '6,0', 0]].forEach(([id, k, o]) => { G({ t: 'sbPlace', id, k }); G({ t: 'sbClaim', k, owner: o }); });
  const c2 = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' }), ph = await c2.newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ph.addInitScript(s => { localStorage.setItem('ks.game', s); localStorage.setItem('ks.prefs', '{"patchNotes":false}'); window.ksBotDelay = 1e9; }, JSON.stringify(g));
  await ph.goto('file://' + REPO + '/site/index.html'); await ph.tap('[data-act="hotseatSetup"]'); await ph.tap('[data-act="resume"]'); await ph.waitForTimeout(300);
  ok((await ph.$$('.mgame .gchev')).length >= 3 && !!(await ph.$('.mgame .gchev.hot')), 'the chevrons show in the phone layout too');
  await ph.screenshot({ path: SHOTS + '/phone-dark.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
