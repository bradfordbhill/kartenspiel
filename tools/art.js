// Draws the Fraktur "Kartenspiel" logo and the app icons as pixel art, then saves them to assets/.
// The lettering is UnifrakturMaguntia from Google Fonts, drawn small with hard (on/off) edges and scaled up
// pixel for pixel by the page, like a 1990s bitmap logo. Needs Playwright with Chromium and a network
// connection for the font.  Run: node tools/art.js  (then ./build.sh)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ASSETS = path.join(__dirname, '..', 'assets');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=block" rel="stylesheet"></head>
<body><span style="font-family:UnifrakturMaguntia">K</span><script>
const INK = '#3a1e00';
function gold(g, y0, y1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(.45, '#f2c230'); gr.addColorStop(.55, '#b07a10'); gr.addColorStop(1, '#ffd860'); return gr; }
// gilded text: a dark outline and a 2px drop shadow under a gold gradient
function gild(g, text, x, y, size) {
  g.font = size + 'px UnifrakturMaguntia'; g.fillStyle = INK;
  for (const [dx, dy] of [[1, 1], [2, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(text, x + dx, y + dy);
  g.fillStyle = gold(g, y - size * .75, y); g.fillText(text, x, y);
}
// no half-transparent pixels: every pixel is fully on or off, so it scales up as crisp blocks
function harden(g, w, h) { const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.putImageData(d, 0, 0); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function logo() {
  const w = 250, h = 42, c = canvas(w, h), g = c.getContext('2d');
  g.font = '30px UnifrakturMaguntia'; const tw = g.measureText('Kartenspiel').width;
  gild(g, 'Kartenspiel', Math.round((w - tw) / 2) - 1, 33, 30); harden(g, w, h);
  // crop to the lettering, so the page can size the logo by its real width
  const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const t = canvas(x1 - x0 + 1, y1 - y0 + 1); t.getContext('2d').drawImage(c, -x0, -y0);
  return t.toDataURL('image/png');
}
// the icon on a 64-pixel grid: teal desktop, a card with a black outline and a navy title strip, a gilded K
function icon(size, pad) {
  const n = 64, c = canvas(n, n), g = c.getContext('2d'), px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(0, 0, n, n, '#008080');
  px(18, 8, 40, 54, '#005555');                      // drop shadow
  px(14, 4, 40, 54, '#000');                         // card outline (2px)
  px(16, 6, 36, 50, '#f6efd8');                      // parchment face
  px(16, 6, 36, 8, '#000080'); px(18, 8, 18, 2, '#fff'); // title bar
  const k = canvas(n, n), kg = k.getContext('2d'); kg.font = '40px UnifrakturMaguntia';
  const kw = kg.measureText('K').width; gild(kg, 'K', Math.round(33 - kw / 2), 48, 40); harden(kg, n, n);
  g.drawImage(k, 0, 0);
  // scale up pixel for pixel, with a teal margin for maskable icons
  const out = canvas(size, size), o = out.getContext('2d'), inner = Math.round(size * (1 - pad * 2));
  o.fillStyle = '#008080'; o.fillRect(0, 0, size, size); o.imageSmoothingEnabled = size < n;   // the favicon is smaller than the grid
  o.drawImage(c, Math.round((size - inner) / 2), Math.round((size - inner) / 2), inner, inner);
  return out.toDataURL('image/png');
}
window.draw = () => document.fonts.load('30px UnifrakturMaguntia').then(() => ({
  logo: logo(),
  icons: { 'icon-192.png': icon(192, 0), 'icon-512.png': icon(512, 0), 'maskable-512.png': icon(512, .12), 'apple-touch-icon.png': icon(180, .04), 'favicon-32.png': icon(32, 0) }
}));
</script></body></html>`;

(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  await p.setContent(PAGE); const art = await p.evaluate(() => window.draw());
  const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  save(path.join(ASSETS, 'logo.png'), art.logo);
  for (const f in art.icons) save(path.join(ASSETS, 'icons', f), art.icons[f]);
  await b.close(); console.log('saved assets/logo.png and', Object.keys(art.icons).length, 'icons');
})();
