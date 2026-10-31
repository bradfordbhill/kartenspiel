// Browser test of Dithry, the paint app: every drawing tool, the style panels, layers, undo/redo, saving and
// re-opening a project, exporting, and the phone layout. Needs Playwright with Chromium.
// Run: ./build.sh && node tests/e2e/dithry.js [screenshot folder]
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ks-dithry-'));
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const URL = 'file://' + path.join(REPO, 'dithry.html');

(async () => {
  const b = await chromium.launch(), errs = [];
  const c = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }), p = await c.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto(URL); await p.waitForFunction(() => window.dithryReady);
  const app = () => p.evaluate(() => { const a = DithryApp.app; return { w: a.doc.w, h: a.doc.h, layers: a.doc.layers.map(l => l.name), active: a.doc.active, undo: a.undo.length, name: a.name, dirty: a.dirty }; });
  let s = await app();
  ok(s.w === 160 && s.h === 100 && s.layers.join(',') === 'Sky,Moon,City,Prairie,River', 'first visit opens the example scene, one layer per part: ' + s.layers.join(', '));
  ok(await p.evaluate(() => { const f = DithryApp.flatten(); let n = 0; for (let i = 3; i < f.length; i += 4) n += f[i] > 0; return n === f.length / 4; }), 'the example covers the whole canvas');

  // a fresh 40 × 30 picture
  await p.evaluate(() => { DithryApp.app.dirty = false; }); await p.click('[data-menu="file"] > button'); await p.click('[data-cmd="new"]');
  await p.fill('#nW', '40'); await p.fill('#nH', '30'); await p.click('#nGo');
  s = await app(); ok(s.w === 40 && s.h === 30 && s.layers.length === 1, 'File → New makes a blank 40 × 30 picture');
  // helpers: canvas pixel → screen point; read a pixel of the active layer
  const pt = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('art').getBoundingClientRect(), a = DithryApp.app; return [r.left + (x + .5) * a.zoom, r.top + (y + .5) * a.zoom]; }, [x, y]);
  const px = (x, y, li) => p.evaluate(([x, y, li]) => { const a = DithryApp.app, L = a.doc.layers[li == null ? a.doc.active : li]; const i = (y * a.doc.w + x) * 4; return Array.from(L.data.slice(i, i + 4)); }, [x, y, li]);
  const drag = async (x0, y0, x1, y1, opt) => { const a = await pt(x0, y0), z = await pt(x1, y1); if (opt && opt.shift) await p.keyboard.down('Shift'); await p.mouse.move(a[0], a[1]); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(a[0] + (z[0] - a[0]) * i / 6, a[1] + (z[1] - a[1]) * i / 6); await p.mouse.up(); if (opt && opt.shift) await p.keyboard.up('Shift'); };
  const click = async (x, y) => { const a = await pt(x, y); await p.mouse.click(a[0], a[1]); };
  const tool = id => p.click('[data-tool="' + id + '"]');
  const setStyle = js => p.evaluate(js);

  // two-tone black → white gradient, top to bottom, no dither: a rectangle shows both colours, split in the middle
  await setStyle(() => { const st = DithryApp.app.style; st.mode = 'gradient'; st.ramp = [{ c: '#000000', a: 1 }, { c: '#ffffff', a: 1 }]; Object.assign(st.grad, { type: 'linear', anchor: 'shape', angle: 90, start: 0, end: 1, mid: .5, contrast: 1, reverse: false, repeat: 'none' }); Object.assign(st.ripple, { amp: 0, turb: 0 }); st.dither.level = 0; st.opacity = 1; });
  await tool('rect'); await drag(2, 2, 21, 21);
  ok((await px(10, 3))[0] === 0 && (await px(10, 20))[0] === 255 && (await px(10, 3))[3] === 255, 'rectangle: the gradient runs dark at the top to light at the bottom');
  ok((await px(1, 1))[3] === 0 && (await px(22, 22))[3] === 0, 'and stays inside the rectangle');
  // dithering at 100%: the middle row mixes both colours
  await p.keyboard.press('Control+z');
  await setStyle(() => { DithryApp.app.style.dither.level = 1; DithryApp.app.style.dither.pattern = 'bayer4'; });
  await drag(2, 2, 21, 21);
  const mid = []; for (let x = 2; x < 22; x++) mid.push((await px(x, 11))[0]);
  ok(mid.includes(0) && mid.includes(255), 'with dithering on, the middle of the gradient mixes both colours (' + mid.filter(v => v === 0).length + ' dark of ' + mid.length + ')');
  // undo and redo
  s = await app(); const u0 = s.undo;
  await p.keyboard.press('Control+z'); ok((await px(10, 3))[3] === 0, 'Ctrl+Z undoes the rectangle');
  await p.keyboard.press('Control+y'); ok((await px(10, 3))[3] === 255 && (await app()).undo === u0, 'Ctrl+Y redoes it');

  // ellipse with Shift = circle, outline mode
  await p.keyboard.press('Control+z');
  await tool('ellipse'); await p.selectOption('[data-opt="shape"]', 'outline');
  await drag(5, 5, 25, 15, { shift: true });
  ok((await px(15, 15))[3] === 0 && (await px(15, 5))[3] === 255 && (await px(5, 15))[3] === 255, 'ellipse: Shift makes a circle; outline mode leaves the middle empty');
  await p.selectOption('[data-opt="shape"]', 'fill'); await p.keyboard.press('Control+z');

  // polygon: click corners, Enter to finish
  await tool('polygon'); await click(2, 2); await click(30, 2); await click(2, 25); await p.keyboard.press('Enter');
  ok((await px(5, 5))[3] === 255 && (await px(28, 24))[3] === 0, 'polygon: clicked corners fill a triangle when you press Enter');
  await p.keyboard.press('Control+z');

  // brush with mirror: a dab on the left also lands on the right
  await setStyle(() => { const st = DithryApp.app.style; st.mode = 'solid'; st.ramp[0] = { c: '#ff0000', a: 1 }; });
  await tool('brush'); await p.check('[data-opt="mirror"]'); await p.fill('[data-opt="size"]', '1'); await click(3, 3);
  ok((await px(3, 3))[0] === 255 && (await px(36, 3))[0] === 255, 'brush with Mirror paints both sides');
  await p.uncheck('[data-opt="mirror"]');
  // pencil line with Shift-click
  await tool('pencil'); await click(0, 10); await p.keyboard.down('Shift'); await click(10, 10); await p.keyboard.up('Shift');
  ok((await px(5, 10))[0] === 255, 'pencil: Shift-click draws a straight line from the last point');
  // eraser
  await tool('eraser'); await p.fill('[data-opt="size"]', '3'); await click(5, 10);
  ok((await px(5, 10))[3] === 0, 'eraser makes pixels transparent');
  // fill bucket on the empty area
  await setStyle(() => { DithryApp.app.style.ramp[0] = { c: '#00ff00', a: 1 }; });
  await tool('fill'); await click(20, 20);
  ok((await px(20, 20))[1] === 255 && (await px(36, 3))[0] === 255, 'fill tool fills the connected empty area and leaves other colours alone');
  // picker
  await tool('picker'); await p.evaluate(() => { DithryApp.app.rampSel = 0; }); await click(36, 3);
  ok(await p.evaluate(() => DithryApp.app.style.ramp[0].c) === '#ff0000', 'colour picker picks into the selected ramp colour');

  // a new layer, the gradient tool over the whole layer, opacity and visibility
  await p.click('#side [data-cmd="addLayer"]'); s = await app();
  ok(s.layers.length === 2 && s.active === 1, 'New layer adds a layer above and selects it');
  await setStyle(() => { const st = DithryApp.app.style; st.mode = 'gradient'; st.ramp = [{ c: '#0000ff', a: 1 }, { c: '#ffff00', a: 1 }]; st.dither.level = 0; });
  await tool('gradient'); await drag(0, 15, 39, 15);
  ok((await px(2, 0))[2] === 255 && (await px(37, 29))[0] === 255, 'gradient tool: dragging left to right fills the layer from colour 1 to colour 2');
  ok(await p.evaluate(() => { const g = DithryApp.app.style.grad; return Math.abs(g.x0 - .5) < 1 && Math.abs(g.x1 - 39.5) < 1; }), 'and remembers the handles for “Spans: gradient-tool handles”');
  await p.click('[data-layer="1"] [data-vis="1"]');
  ok(await p.evaluate(() => DithryApp.flatten()[ (20 * 40 + 20) * 4 + 1 ]) === 255, 'hiding the layer shows the green fill beneath');
  await p.click('[data-layer="1"] [data-vis="1"]');
  // lock
  await p.click('[data-lock="1"]'); await tool('brush'); await click(1, 1);
  ok((await px(1, 1, 1))[0] !== 255 && await p.evaluate(() => /locked/.test(document.getElementById('toast').textContent)), 'drawing on a locked layer explains why nothing happens');
  await p.click('[data-lock="1"]');
  // merge down
  await p.click('#side [data-cmd="mergeDown"]'); s = await app(); ok(s.layers.length === 1, 'Merge down combines the two layers');
  await p.keyboard.press('Control+z'); s = await app(); ok(s.layers.length === 2, 'and Undo splits them again');

  // presets change the style
  await p.selectOption('[data-act="preset"]', { label: 'Masonry' });
  ok(await p.evaluate(() => DithryApp.app.style.dither.pattern) === 'masonry', 'style presets set the pattern and colours (Masonry)');
  // every pattern draws without errors
  const pats = await p.evaluate(() => Dithry.PATTERNS.map(q => q.id));
  for (const id of pats) { await p.selectOption('[data-k="dither.pattern"]', id); }
  for (const ty of ['linear', 'radial', 'diamond', 'conic', 'edge', 'flat']) { await p.selectOption('[data-k="grad.type"]', ty); await tool('ellipse'); await drag(4, 4, 30, 24); }
  ok(errs.length === 0, 'all ' + pats.length + ' patterns and 6 gradient types draw without errors');

  // selection: drawing stays inside it; copy and paste make a new layer; dither by brightness
  await p.click('#side [data-cmd="addLayer"]');
  await tool('select'); await drag(10, 10, 19, 19);
  ok(await p.evaluate(() => JSON.stringify(DithryApp.app.sel)) === '{"x0":10,"y0":10,"x1":20,"y1":20}', 'Select: dragging selects a 10 × 10 area');
  await setStyle(() => { const st = DithryApp.app.style; st.mode = 'solid'; st.ramp = [{ c: '#ff00ff', a: 1 }]; st.opacity = 1; });
  await tool('rect'); await drag(0, 0, 39, 29);
  ok((await px(15, 15))[0] === 255 && (await px(5, 5))[3] === 0, 'a rectangle over everything only paints inside the selection');
  await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); s = await app();
  ok(s.layers[s.active] === 'Pasted' && (await px(15, 15))[2] === 255 && (await px(5, 5))[3] === 0, 'Ctrl+C then Ctrl+V pastes the selected pixels as a new layer, in place');
  await p.keyboard.press('Escape'); ok(await p.evaluate(() => DithryApp.app.sel) === null, 'Esc deselects');
  await setStyle(() => { const st = DithryApp.app.style; st.mode = 'gradient'; st.ramp = [{ c: '#000000', a: 1 }, { c: '#ffffff', a: 1 }]; Object.assign(st.grad, { start: 0, end: 1, mid: .5, contrast: 1, reverse: false }); st.dither.level = 0; });
  await p.evaluate(() => { const L = DithryApp.app.doc.layers[DithryApp.app.doc.active], W = DithryApp.app.doc.w; for (let x = 0; x < 20; x++) { const i = (0 * W + x) * 4; L.data[i] = L.data[i + 1] = L.data[i + 2] = x * 13; L.data[i + 3] = 255; } });
  await p.click('[data-menu="image"] > button'); await p.click('[data-cmd="ditherLayer"]');
  ok((await px(0, 0))[0] === 0 && (await px(19, 0))[0] === 255 && (await px(15, 15))[3] === 255, 'Dither layer by brightness redraws pixels in the ramp’s colours by how light they are');
  await p.click('#side [data-cmd="delLayer"]'); await p.click('#side [data-cmd="delLayer"]');

  // save the project, start over, open it again
  const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('Control+s')]);
  const file = path.join(SHOTS, await dl.suggestedFilename()); await dl.saveAs(file);
  const proj = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(proj.app === 'Dithry' && proj.layers.length === 2 && proj.w === 40, 'Ctrl+S downloads a .dithry project with both layers');
  const before = await p.evaluate(() => Array.from(DithryApp.flatten()).join(','));
  await p.evaluate(() => { DithryApp.app.dirty = false; }); await p.click('[data-menu="file"] > button'); await p.click('[data-cmd="new"]'); await p.fill('#nW', '8'); await p.fill('#nH', '8'); await p.click('#nGo');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.keyboard.press('Control+o')]); await fc.setFiles(file); await p.waitForTimeout(500);
  s = await app(); ok(s.w === 40 && s.layers.length === 2, 'Ctrl+O opens it again');
  ok(await p.evaluate(() => Array.from(DithryApp.flatten()).join(',')) === before, 'and the picture is pixel-for-pixel the same');
  // export
  await p.keyboard.press('Control+e'); await p.selectOption('#eS', '4');
  const [ex] = await Promise.all([p.waitForEvent('download'), p.click('#eGo')]);
  const png = path.join(SHOTS, await ex.suggestedFilename()); await ex.saveAs(png); const buf = fs.readFileSync(png);
  ok(buf.readUInt32BE(16) === 160 && buf.readUInt32BE(20) === 120, 'Export at 4× gives a 160 × 120 PNG (' + path.basename(png) + ')');
  // autosave: a reload brings the picture back
  await p.waitForTimeout(1100); await p.reload(); await p.waitForFunction(() => window.dithryReady); await p.waitForTimeout(300);
  s = await app(); ok(s.w === 40 && s.layers.length === 2, 'reloading the page brings back the last picture');
  // canvas size
  await p.click('[data-menu="image"] > button'); await p.click('[data-cmd="resize"]'); await p.fill('#rW', '50'); await p.click('#rGo');
  s = await app(); ok(s.w === 50 && s.h === 30, 'Image → Canvas size widens the canvas');
  await p.screenshot({ path: SHOTS + '/desktop.png' });

  // Kartenspiel's Card Builder keeps a Dithry export as crisp pixel art (a PNG, drawn with hard edges)
  const kc = await b.newContext({ viewport: { width: 1280, height: 800 } }), kp = await kc.newPage(); kp.on('pageerror', e => errs.push('kartenspiel: ' + e.message));
  await kp.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await kp.goto('file://' + path.join(REPO, 'index.html')); await kp.click('[data-page="builder"]'); await kp.click('[data-act="newCard"]');
  ok(!!(await kp.$('a[href="dithry.html"]')), 'the Card Builder links to Dithry');
  const [art1] = await Promise.all([p.waitForEvent('download'), (async () => { await p.keyboard.press('Control+e'); await p.selectOption('#eS', '1'); await p.click('#eGo'); })()]);
  const png1 = path.join(SHOTS, 'card-art.png'); await art1.saveAs(png1);
  await kp.setInputFiles('[data-art]', png1); await kp.waitForTimeout(400);
  const artBg = await kp.$eval('.card.big .art', e => [e.style.backgroundImage.slice(0, 30), e.style.imageRendering]);
  ok(/data:image\/png/.test(artBg[0]) && artBg[1] === 'pixelated', 'and keeps an uploaded Dithry PNG as crisp pixel art (' + artBg.join(', ') + ')');

  // phone: everything reachable, no sideways scroll, a finger can draw
  const pc = await b.newContext({ ...devices['iPhone 13'] }), ph = await pc.newPage(); ph.on('pageerror', e => errs.push('phone: ' + e.message));
  await ph.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await ph.goto(URL); await ph.waitForFunction(() => window.dithryReady);
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: no sideways scrolling');
  await ph.tap('[data-tool="rect"]');
  const box = await ph.$eval('#art', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const cdp = await pc.newCDPSession(ph), t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const u1 = await ph.evaluate(() => DithryApp.app.undo.length);
  await t('touchStart', [[box[0] + 10, box[1] + 10]]); for (let i = 1; i <= 5; i++) await t('touchMove', [[box[0] + 10 + i * 12, box[1] + 10 + i * 8]]); await t('touchEnd', []);
  ok(await ph.evaluate(() => DithryApp.app.undo.length) === u1 + 1, 'phone: dragging a finger draws a rectangle');
  const z0 = await ph.evaluate(() => DithryApp.app.zoom);
  await t('touchStart', [[box[0] + 60, box[1] + 40], [box[0] + 100, box[1] + 40]]); for (let i = 1; i <= 6; i++) await t('touchMove', [[box[0] + 60 - i * 8, box[1] + 40], [box[0] + 100 + i * 8, box[1] + 40]]); await t('touchEnd', []);
  ok(await ph.evaluate(() => DithryApp.app.zoom) > z0 && await ph.evaluate(() => DithryApp.app.undo.length) === u1 + 1, 'phone: two fingers zoom instead of drawing');
  await ph.screenshot({ path: SHOTS + '/phone.png', fullPage: true });

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); console.log(out.join('\n')); console.log('screenshots: ' + SHOTS); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message.split('\n')[0]); process.exit(1); });
