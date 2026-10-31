// Browser test of the installable app: manifest, icons, service worker, offline start, install UI.
// Serves site/ under /kartenspiel/ like GitHub Pages does. Needs Playwright with Chromium.
// Run: ./build.sh && node tests/e2e/app.js
const { chromium, devices } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const REPO = path.join(__dirname, '..', '..'), SITE = path.join(REPO, 'site');
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

(async () => {
  // a static server that serves site/ at /kartenspiel/, like https://<user>.github.io/kartenspiel/
  const pages = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); if (!u.pathname.startsWith('/kartenspiel/')) { res.writeHead(404); return res.end(); }
    let rel = u.pathname.slice('/kartenspiel/'.length); if (rel === '' || rel.endsWith('/')) rel += 'index.html';   // a folder serves its index.html
    const f = path.join(SITE, rel);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => pages.listen(0, r));
  const url = 'http://localhost:' + pages.address().port + '/kartenspiel/';
  const b = await chromium.launch(), errs = [];

  const c = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await c.newPage(), cdp = await c.newCDPSession(p);
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto(url); await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  ok(true, 'the service worker installs');
  const mf = await (await fetch(url + 'manifest.webmanifest')).json();
  ok(mf.display_override[0] === 'fullscreen' && mf.display === 'standalone' && mf.start_url === './', 'the manifest asks for full screen, falling back to app mode, and starts at the site');
  const icons = await Promise.all(mf.icons.map(async i => { const buf = Buffer.from(await (await fetch(url + i.src)).arrayBuffer()); return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20) === i.sizes; }));
  ok(icons.every(Boolean) && mf.icons.some(i => i.purpose === 'maskable'), 'every icon exists at its stated size, including a maskable one');
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  ok(installabilityErrors.length === 0, 'Chrome reports it installable' + (installabilityErrors.length ? ': ' + JSON.stringify(installabilityErrors) : ''));
  ok(/Play it like an app/.test(await p.textContent('.home')) && !!(await p.$('[data-act="fullscreen"]')), 'the Home page offers the app and a Full screen button');

  // offline: the stored copy opens, and single player starts
  await p.reload(); await p.evaluate(() => navigator.serviceWorker.controller ? true : new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', () => r(true))));
  await c.setOffline(true); await p.reload();
  ok(/Kartenspiel/.test(await p.textContent('.home h1')), 'with no connection, the app still opens');
  await p.evaluate(() => { window.ksBotDelay = 0; }); await p.click('[data-act="soloSetup"]'); await p.click('[data-act="start"]'); await p.click('[data-act="startTurn"]');
  ok(!!(await p.$('.bottom .hcard')), 'and a single-player game starts offline');
  await c.setOffline(false);
  // Dithry lives at dithry/; visiting it must not replace the game's offline copy (leaving a game asks first: say yes)
  p.on('dialog', d => d.accept());
  await p.goto(url + 'dithry/'); await p.waitForFunction(() => window.dithryReady);
  ok(/Dithry/.test(await p.title()), 'Dithry, the paint tool, is served at dithry/');
  await c.setOffline(true); await p.goto(url).catch(() => {});
  ok(/Kartenspiel/.test(await p.textContent('.home h1').catch(() => '')), 'after visiting Dithry, the game still opens offline');
  await c.setOffline(false);


  // iPhone: no install button exists there, so the box says how
  const ic = await b.newContext({ ...devices['iPhone 13'] }), ip = await ic.newPage(); ip.on('pageerror', e => errs.push('iphone: ' + e.message));
  await ip.route(/fonts\.(googleapis|gstatic)/, r => r.abort()); await ip.goto(url);
  ok(/Add to Home Screen/.test(await ip.textContent('.appbox')), 'on iPhone, it explains Share → Add to Home Screen');
  // opened from the home screen (iOS reports it as navigator.standalone): the install box goes away
  const sp = await ic.newPage(); await sp.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await sp.route(/fonts\.(googleapis|gstatic)/, r => r.abort()); await sp.goto(url);
  ok(!!(await sp.$('.home h1')) && !(await sp.$('.appbox')), 'running as the installed app, the install box is hidden');
  ok((await ip.$eval('meta[name="apple-mobile-web-app-capable"]', e => e.content)) === 'yes' && !!(await ip.$('link[rel="apple-touch-icon"]')), 'iPhone app tags and icon are in the page');

  // the game server serves the same files with the right types
  const { createServer } = require(REPO + '/server/server.js');
  const app = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ks-app-')) }), base = 'http://localhost:' + await app.listen(0);
  const types = await Promise.all(['/manifest.webmanifest', '/sw.js', '/icons/icon-192.png'].map(async f => (await fetch(base + f)).headers.get('content-type')));
  ok(/manifest\+json/.test(types[0]) && /javascript/.test(types[1]) && /png/.test(types[2]), 'the game server serves them too (' + types.join(', ') + ')');
  await app.close();

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); pages.close(); console.log(out.join('\n')); process.exit(0);
})().catch(e => { console.log(out.join('\n')); console.log('ERROR', e.message); process.exit(1); });
