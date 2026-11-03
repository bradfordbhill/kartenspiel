// Draws Claudenspiel's Fraktur logo as pixel art into assets/logo.png (the fork's own; Kartenspiel's stays untouched).
// Same method as Kartenspiel's tools/art.js (UnifrakturMaguntia, hard edges, scaled up pixel for pixel by the page),
// but in verdigris and copper. Needs Playwright with Chromium and a network connection for the font.
// Run: node tools/logo.js   (then ./build.sh)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'assets', 'logo.png');
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=block" rel="stylesheet"></head>
<body><span style="font-family:UnifrakturMaguntia">C</span><script>
const INK = '#16110c';
// verdigris on top, copper below: weathered bronze
function patina(g, y0, y1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#c9f2dc'); gr.addColorStop(.42, '#4fb38f'); gr.addColorStop(.55, '#a8562a'); gr.addColorStop(1, '#f0a86a'); return gr; }
function logo() {
  const w = 280, h = 42, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.font = '30px UnifrakturMaguntia'; const tw = g.measureText('Claudenspiel').width, x = Math.round((w - tw) / 2) - 1, y = 33;
  g.fillStyle = INK; for (const [dx, dy] of [[1, 1], [2, 2], [-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText('Claudenspiel', x + dx, y + dy);
  g.fillStyle = patina(g, y - 22, y); g.fillText('Claudenspiel', x, y);
  const d = g.getImageData(0, 0, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.putImageData(d, 0, 0);
  let x0 = w, y0 = h, x1 = 0, y1 = 0; for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d.data[(yy * w + xx) * 4 + 3]) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, -x0, -y0);
  return { url: o.toDataURL('image/png'), w: o.width, h: o.height };
}
</script></body></html>`;
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); await p.setContent(PAGE); await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.fonts.check('30px UnifrakturMaguntia'));
  const r = await p.evaluate(() => logo()); fs.writeFileSync(OUT, Buffer.from(r.url.split(',')[1], 'base64'));
  console.log('saved assets/logo.png', r.w + '×' + r.h); await b.close();
})();
