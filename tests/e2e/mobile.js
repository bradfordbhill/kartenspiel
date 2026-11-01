// End-to-end browser test of the phone layout and drag and drop, with real touch events (iPhone size),
// then mouse drags on the desktop layout. Needs Playwright with Chromium.
// Run: ./build.sh && node tests/e2e/mobile.js [screenshot folder]   (deals with seed 1; KS_SEED=n tries another deal)
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-mobile-'));
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const wait = ms => new Promise(r => setTimeout(r, ms));
const center = r => [r.x + r.width / 2, r.y + r.height / 2];
let lastPage = null;   // for a screenshot if the test fails

(async () => {
  const b = await chromium.launch(), errs = [];

  /* ---------- phone ---------- */
  const c = await b.newContext({ ...devices['iPhone 13'] }), p = lastPage = await c.newPage(), cdp = await c.newCDPSession(p);
  await c.addInitScript(() => { if (!localStorage.getItem('ks.prefs')) localStorage.setItem('ks.prefs', '{"confirmEnd":false}'); });   // these tests end turns directly; solo.js tests the end-turn check
  p.on('pageerror', e => errs.push('phone: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('ks.game')));
  const rect = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  // Touch-drag from (x0, y0): lift the card a little, then find the target once the board has lit up, and drop
  // with the finger 64px below it (the dragged card floats above the finger).
  async function touchDragTo(x0, y0, targetSel) {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [[x0, y0 - i * 8]]); await wait(16); }
    const t = await p.$(targetSel); if (!t) { await touch('touchEnd', []); return false; }
    const [tx, ty] = center(await t.boundingBox());
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[x0 + (tx - x0) * i / 10, (y0 - 40) + (ty + 64 - (y0 - 40)) * i / 10]]); await wait(16); }
    await touch('touchEnd', []); await wait(450); return true;   // human pace: Chrome reads a tap right where a drag just ended (within ~0.4s) as a double-tap and drops its click
  }
  // like a player, scroll the hand strip so the card is on screen first
  const handCard = async uid => { await p.$eval('.mhand [data-hand="' + uid + '"]', e => e.closest('.hcard').scrollIntoView({ inline: 'center', block: 'nearest' })); await wait(100); return center(await rect('.mhand [data-hand="' + uid + '"]')); };

  await p.goto('file://' + REPO + '/site/index.html');
  await p.evaluate(seed => { window.ksBotDelay = 0; if (seed) window.ksSeed = seed; }, +process.env.KS_SEED || 1);
  await p.tap('[data-act="soloSetup"]'); await p.tap('[data-act="start"]'); await p.tap('[data-act="startTurn"]'); await wait(200);
  ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no sideways scrolling at phone width');
  const vis = async sel => { const r = await rect(sel); return r.y >= 0 && r.y + r.height <= 844 && r.width > 0; };
  ok(await vis('.mtop [data-act="endTurn"]') && await vis('.mhand .hcard') && await vis('.mtabs'), 'End turn, your hand and the tab bar are all on screen');
  ok((await rect('.boardwrap')).height > 250, 'the board gets most of the screen (' + Math.round((await rect('.boardwrap')).height) + 'px tall)');
  await p.screenshot({ path: SHOTS + '/1-phone.png' });

  // drag the Foundation onto the board
  let s = await st();
  const fu = s.players[0].foundationUid, [fx, fy] = await handCard(fu);
  await touchDragTo(fx, fy, '.cell.legal');
  s = await st();
  ok(s.players[0].foundationPlaced && s.board['0,0'], 'dragging the Foundation onto the board plays it');

  // drag an affordable Structure next to it (a Structure stays where it's played; some placed cards don't), then drag the meeple onto it to claim
  const pick = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('ks.game')), E = KEngine, pl = st.players[0];
    for (const u of pl.hand) { const d = E.rawDef(st, u); if (d.type !== 'Structure' || E.playBlock(st, 0, u)) continue; const L = E.legalCells(st, u), k = Object.keys(L).find(k => L[k] <= E.funds(pl)); if (k) return { u, k }; } return null; });
  if (pick) {
    const [sx, sy] = await handCard(pick.u);
    await touchDragTo(sx, sy, '.cell.legal:not(.poor) [data-cell="' + pick.k + '"]');
    s = await st();
    ok(s.board[pick.k] && s.board[pick.k][0] === pick.u, 'dragging a Structure onto a green space plays it there');
    const [mx, my] = center(await rect('.mtop [data-meeple]'));
    await touchDragTo(mx, my, '.cell.claimable [data-cell="' + pick.k + '"]');
    s = await st();
    ok(s.cards[pick.u].claimants.includes(0), 'dragging the meeple onto the card claims it');
  } else ok(false, 'no affordable Structure in hand to test with (seeded game)');
  await p.screenshot({ path: SHOTS + '/2-after-drags.png' });

  // tap a board card: the Card sheet opens with it
  await p.tap('.cell [data-cell="0,0"]'); await wait(100);
  ok(/Cathedral/.test(await p.textContent('.msheet')), 'tapping a board card opens the Card sheet');
  await p.tap('[data-sheet="log"]'); ok(/plays Cathedral/.test(await p.textContent('.msheet')), 'the Log tab shows the log');
  await p.tap('[data-sheet="log"]'); ok(!(await p.$('.msheet')), 'tapping the tab again closes the sheet');

  // press and hold a hand card to read it
  const [hx, hy] = await handCard(await p.$eval('.mhand [data-hand]', e => e.getAttribute('data-hand')));
  await touch('touchStart', [[hx, hy]]); await wait(650);
  const peekOn = await p.$eval('.hovercard', e => getComputedStyle(e).display !== 'none');
  await touch('touchEnd', []); await wait(100);
  ok(peekOn && await p.$eval('.hovercard', e => getComputedStyle(e).display === 'none'), 'press and hold shows a card up close, letting go hides it');

  // two-finger pinch zooms; one finger pans
  const scale = () => p.$eval('.boardinner', e => parseFloat((e.style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1]));
  const z0 = await scale(), [bx, by] = center(await rect('.boardwrap'));
  await touch('touchStart', [[bx - 30, by], [bx + 30, by]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[bx - 30 - i * 10, by], [bx + 30 + i * 10, by]]); await wait(16); }
  await touch('touchEnd', []); await wait(100);
  const z1 = await scale();
  ok(z1 > z0 * 1.5, 'pinching out zooms the board in (' + z0.toFixed(2) + ' → ' + z1.toFixed(2) + ')');
  await p.$eval('.boardwrap', w => { w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; });   // from the middle, so there's room to move either way
  const sl0 = await p.$eval('.boardwrap', e => e.scrollLeft);
  await touch('touchStart', [[bx, by]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[bx - i * 12, by]]); await wait(16); } await touch('touchEnd', []); await wait(100);
  ok(await p.$eval('.boardwrap', e => e.scrollLeft) > sl0, 'dragging the board with one finger moves it');
  ok(Math.abs(await scale() - z1) < 1e-6, 'and leaves the zoom alone');
  // a pinch zooms around the point between the fingers: the board spot under them stays under them
  const spot = () => p.$eval('.boardwrap', (w, [x, y]) => { const r = w.getBoundingClientRect(), z = parseFloat(w.querySelector('.boardinner').style.transform.slice(6)); return [(w.scrollLeft + x - r.left) / z, (w.scrollTop + y - r.top) / z]; }, [bx, by]);
  await p.$eval('.boardwrap', w => { w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; w.scrollTop = (w.scrollHeight - w.clientHeight) / 2; });   // away from the edges, where the view can't follow
  const sp0 = await spot();
  await touch('touchStart', [[bx - 40, by], [bx + 40, by]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[bx - 40 + i * 1.5, by], [bx + 40 - i * 1.5, by]]); await wait(16); }
  await touch('touchEnd', []); await wait(100);
  const sp1 = await spot();
  ok(await scale() < z1 && Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]) < 3, 'pinching in zooms around the fingers (spot moved ' + Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]).toFixed(1) + 'px)');
  // iOS can lose a finger's lift when the board redraws under it; that stuck finger must not turn the next pan into a zoom
  await p.$eval('.mgame .boardwrap', w => { const r = w.getBoundingClientRect(); w.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 999, pointerType: 'touch', isPrimary: true, clientX: r.left + 20, clientY: r.top + 20, bubbles: true })); });
  const z2 = await scale(), sl2 = await p.$eval('.boardwrap', e => e.scrollLeft);
  await touch('touchStart', [[bx, by]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[bx + i * 6, by]]); await wait(16); } await touch('touchEnd', []); await wait(100);
  ok(Math.abs(await scale() - z2) < 1e-6 && await p.$eval('.boardwrap', e => e.scrollLeft) < sl2, 'after a lost finger lift, one finger still pans without zooming');

  // discard 2, draw 1 by dragging two cards onto the discard pile
  s = await st(); const before = s.players[0].hand.length;
  for (let n = 0; n < 2; n++) {
    s = await st(); const u = s.players[0].hand.filter(x => s.defs[s.cards[x].def].type !== 'Foundation')[n];
    const [ux, uy] = await handCard(u); await touchDragTo(ux, uy, '.dropzone');
  }
  s = await st();
  ok(s.players[0].hand.length === before - 1 && s.log.some(l => /discards 2 cards and draws/.test(l)), 'two cards dragged to the discard pile: discard 2, draw 1');

  // sideways swipe on the hand scrolls it instead of picking a card up
  const [ax, ay] = center(await rect('.mhand .hcard'));
  await touch('touchStart', [[ax + 40, ay]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[ax + 40 - i * 15, ay]]); await wait(16); }
  const ghost = await p.$('.dragghost'); await touch('touchEnd', []);
  ok(!ghost, 'a sideways swipe on the hand doesn’t pick a card up');

  await p.tap('.mtop [data-act="endTurn"]');
  for (let t = 0; t < 120 && !(await p.$('text=Start my turn')); t++) {   // a bot's card may ask you something: answer it
    const q = await p.$('.modal [data-act="answerNo"], .modal [data-answer], .modal [data-answer-p], .modal [data-act="answerNone"]');
    if (q) { await q.tap(); await wait(100); continue; }
    const pk = await p.$('.modal [data-pick]'); if (pk) { await pk.tap(); const cf = await p.$('.modal [data-act="answerHand"]:not([disabled])'); if (cf) await cf.tap(); continue; }
    const sk = await p.$('[data-act="skip"]'); if (sk) { await sk.tap(); continue; }
    await wait(500);
  }
  if (!(await p.$('text=Start my turn'))) { const g = await st(); throw new Error('no Start my turn: cur ' + g.cur + ', pending ' + JSON.stringify(g.pending)); }
  ok(true, 'End turn in the top bar hands over to the bots, and your turn comes back');
  await p.screenshot({ path: SHOTS + '/3-next-turn.png' });

  // a phone held sideways still fits
  await p.setViewportSize({ width: 844, height: 390 }); await wait(200);
  ok(await p.evaluate(() => !!document.querySelector('.mgame')) && (await rect('.boardwrap')).height > 120, 'sideways phone keeps the phone layout with room for the board');
  await p.screenshot({ path: SHOTS + '/4-landscape.png' });

  /* ---------- desktop: mouse drags ---------- */
  const d = lastPage = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await d.addInitScript(() => { if (!localStorage.getItem('ks.prefs')) localStorage.setItem('ks.prefs', '{"confirmEnd":false}'); });   // these tests end turns directly; solo.js tests the end-turn check
  d.on('pageerror', e => errs.push('desktop: ' + e.message));
  await d.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await d.goto('file://' + REPO + '/index.html');
  await d.evaluate(seed => { if (seed) window.ksSeed = seed; }, +process.env.KS_SEED || 1);
  await d.click('[data-act="start"]'); await d.click('[data-act="startTurn"]');
  const dst = () => d.evaluate(() => JSON.parse(localStorage.getItem('ks.game')));
  async function mouseDrag(fromSel, targetSel, dx, dy) {
    const [x0, y0] = center(await (await d.$(fromSel)).boundingBox());
    await d.mouse.move(x0, y0); await d.mouse.down(); await d.mouse.move(x0, y0 - 20, { steps: 4 });
    let tx, ty; if (targetSel) { [tx, ty] = center(await (await d.$(targetSel)).boundingBox()); } else { tx = dx; ty = dy; }
    await d.mouse.move(tx, ty, { steps: 10 }); await d.mouse.up(); await wait(150);
  }
  let ds = await dst();
  await mouseDrag('.bottom [data-hand="' + ds.players[0].foundationUid + '"]', '.cell.legal');
  ds = await dst(); ok(ds.players[0].foundationPlaced, 'mouse: dragging the Foundation plays it');
  // a card that needs a board space (an Action dropped anywhere on the board is simply played)
  const other = await d.evaluate(() => { const st = JSON.parse(localStorage.getItem('ks.game')); return st.players[0].hand.find(u => KEngine.needsPlacement(KEngine.rawDef(st, u))); });
  const wr = await (await d.$('.boardwrap')).boundingBox();
  await mouseDrag('.bottom [data-hand="' + other + '"]', null, wr.x + 15, wr.y + 15);
  ds = await dst();
  ok(ds.players[0].hand.includes(other) && /can’t go there|Not enough|Drop it on|cannot play/.test(await d.textContent('.statusbar')), 'mouse: a drop where it can’t go puts the card back and says why');
  await d.click('.bottom [data-hand="' + other + '"]');
  ok(!!(await d.$('.hcard.sel')), 'mouse: clicking a hand card still selects it');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); process.exit(0);
})().catch(async e => { console.log(out.join('\n')); console.log('ERROR', e.message.split('\n')[0], (e.stack.split('\n').find(l => l.includes('mobile.js')) || '').trim()); if (lastPage) await lastPage.screenshot({ path: SHOTS + '/failure.png' }).catch(() => {}); process.exit(1); });
