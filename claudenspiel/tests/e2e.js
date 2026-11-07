const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.addInitScript(() => { window.__fast = true; });
  await pg.goto('file://' + path.resolve(__dirname, '../index.html'));
  await pg.fill('#seed', 'abc'); await pg.click('#go');
  let turns = 0;
  for (let step = 0; step < 4000; step++) {
    const over = await pg.evaluate(() => __claudenspiel.G.over);
    if (over) break;
    const mine = await pg.evaluate(() => __claudenspiel.G.active === 0);
    if (!mine) { await pg.waitForTimeout(60); await pg.evaluate(() => 0); continue; }
    // act: place a tile if possible, else buy cheapest hot card, else end
    const did = await pg.evaluate(() => {
      const G = __claudenspiel.G, pend = G.pending;
      const q = (s) => document.querySelector(s);
      if (pend) { if (pend.kind === 'trash') q('#b-trash').click(); else q('#b-skip').click(); return 'p'; }
      const tile = [...document.querySelectorAll('.handbar .card')].find((c) => /tile/.test(c.textContent) && G.ti.places > 0);
      if (tile) { tile.click(); const cell = q('.cell.legal'); if (cell) { cell.click(); return 'place'; } tile.click(); }
      const hot = [...document.querySelectorAll('.supplyrow .card.hot')].pop();
      if (hot && G.ti.buys > 0) { hot.click(); return 'buy'; }
      q('#b-end').click(); return 'end';
    });
    if (did === 'end') turns++;
  }
  await pg.screenshot({ path: process.argv[2] || '/tmp/cl-end.png' });
  const over = await pg.evaluate(() => __claudenspiel.G.over);
  console.log('finished', over, 'my turns', turns, 'errors', errs);
  if (!over || errs.length) process.exit(1);
  await b.close();
})();
