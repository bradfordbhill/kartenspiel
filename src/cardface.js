/* Kartenspiel card faces, shared by the game (src/ui.js) and Dithry's card-painting mode (dithry/cards.js), so a
   card's text sits in exactly the same place in both. Also here: the suit icons, the faint dithered texture each
   suit gets, and the store of painted card faces.
   Painted faces: each card can have a picture for its hand (portrait, 75 × 103 pixels, shown at 2× on a desktop
   hand card of 150 × 206 and stretched to fit elsewhere) and board (square, 52 × 52, on a 104 × 104 cell) versions. Committed ones live in src/cardart.js (KCardArt) and show for everyone; Dithry saves
   new ones in this browser (localStorage 'ks.faces'), which take precedence, so you see your edits at once. */
var KFace = (function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // SVG paths for the six suit icons (16x16 viewBox).
  var ICON = {
    Sceptre: '<path d="M2.5 13.5 10 6"/><circle cx="11.3" cy="4.7" r="2.2"/>',
    Goblet: '<path d="M3 2h10l-1.2 4.5a3.9 3.9 0 0 1-7.6 0Z"/><path d="M8 10.5v3M5 14h6"/>',
    Sword: '<path d="M8 1.5v9M4.5 10.5h7M8 10.5v4"/>',
    Bone: '<path d="M3.5 7a4.5 4.5 0 1 1 9 0c0 1.6-.8 2.6-1.8 3.2V13H5.3v-2.8C4.3 9.6 3.5 8.6 3.5 7Z"/><circle cx="6.2" cy="7" r=".9"/><circle cx="9.8" cy="7" r=".9"/>',
    Leaf: '<path d="M8 1.5c4 2.2 4.6 7.5 0 11.5-4.6-4-4-9.3 0-11.5Z"/><path d="M8 4v11"/>',
    Tome: '<rect x="3" y="3.5" width="10" height="8.5"/><path d="M5 6.5h6M5 9h6"/><circle cx="3" cy="3.5" r="1.2"/><circle cx="13" cy="12" r="1.2"/>'
  };
  function icon(s) { return '<svg class="suitico si-' + esc(s) + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-label="' + esc(s) + '"><title>' + esc(s) + '</title>' + (ICON[s] || '') + '</svg>'; }
  // Placement arrows shown in a card's footer.
  function placeIcon(pl) {
    if (pl === 'diag') return '✕';
    if (!pl || pl.length === 4) return '✛';
    var m = { 'N': '↑', 'S': '↓', 'E': '→', 'W': '←', 'NS': '↕', 'EW': '↔', 'NE': '↗' };
    var k = ['N', 'E', 'S', 'W'].filter(function (s) { return pl.indexOf(s) >= 0; }).join('');
    return m[k] || k;
  }
  // A card's score rule as readable text.
  function scoreText(s) {
    if (!s) return '';
    var n = s.n, m = s.m;
    switch (s.kind) {
      case 'flat': return n + '◇';
      case 'perAdjacentSuit': return n + '◇ per adjacent ' + s.suit;
      case 'perSuitInKingdom': return n + '◇ per ' + s.suit + ' in Kingdom';
      case 'perSuitSplit': return n + '◇ per ' + s.suit + ' in Kingdom, ' + m + '◇ per other ' + s.suit;
      case 'perBuriedInKingdom': return n + '◇ per buried card in Kingdom';
      case 'perDistinctSuitInKingdom': return n + '◇ per suit in Kingdom';
      case 'largestRegion': return n + '◇ per card in largest region';
      case 'perCardNorth': return n + '◇ per card north';
      case 'flatDoubledIfSurrounded': return n + '◇, doubled if surrounded';
      case 'flatMinusPerAdjacentNotOwned': return n + '◇ − ' + m + ' per foreign neighbor';
      case 'flatMinusPerExtraClaimant': return n + '◇ − ' + m + ' per extra claimant';
      case 'flatPlusTokens': return n + '◇ + tokens';
      default: return '';
    }
  }

  // Each suit's card colour, as in style.css (.card.s-*, .card.found.s-*): the base Dithry paints on.
  var SUIT_BG = { Sceptre: '#fff6c2', Goblet: '#f6dcf2', Sword: '#ffdad5', Bone: '#ececec', Leaf: '#dcf2d4', Tome: '#d9e4ff' };
  var FOUND_BG = { Sceptre: '#f0d45c', Goblet: '#dea0d4', Sword: '#f19a8e', Bone: '#c4c4c4', Leaf: '#a9db97', Tome: '#a1bbf0' };
  // Painted art and textures are pixel art: CSS that stretches a picture over the whole card with hard edges.
  function picCSS(url, fit) { return 'background-image:url(' + url + ');background-size:' + (fit || '100% 100%') + ';image-rendering:pixelated'; }
  // Card art inside the art band. Pixel art (stored as PNG) is scaled with hard edges so it stays crisp.
  function artStyle(art) { return 'background-image:url(' + art + ')' + (art.indexOf('data:image/png') === 0 ? ';image-rendering:pixelated' : ''); }

  // Face for a card definition: in hand, the library, the builder. opts: { big, mid, value, cost, art (art-band
  // picture), style (CSS for the card's background: its texture or painted face) }.
  function handFace(d, o) {
    o = o || {};
    var art = o.art, tx = o.style || '';
    var h = '<div class="card s-' + esc(d.suit) + (o.big ? ' big' : '') + (d.type === 'Foundation' ? ' found' : '') + '"' + (tx ? ' style="' + tx + '"' : '') + '>';
    h += '<div class="top"><span>' + esc(o.cost != null ? o.cost : d.cost) + '●</span>' + icon(d.suit) + '</div>';
    if (art) h += '<div class="art" style="' + artStyle(art) + '"></div>';
    h += '<div class="nm">' + esc(d.name) + '</div><div class="ty">' + esc(d.type) + ' · ' + esc(d.suit) + '</div>';
    if (o.big) {
      h += '<div class="txt">' + esc(d.text || '') + '</div>';
      var bits = [];
      if (scoreText(d.score)) bits.push('Value: ' + scoreText(d.score));
      if (+d.income) bits.push('Income: ' + d.income + '● per turn');
      if (+d.incomePerToken) bits.push('+' + d.incomePerToken + '● per token');
      bits.push('Placement: ' + placeIcon(d.place));
      if (d.overwhelm != null && d.overwhelm !== '') bits.push('Overwhelm number: ' + d.overwhelm);
      if (d.type === 'Foundation') bits.push('Archetype: ' + d.archetype + ', weak to ' + d.weakTo);
      if (d.note) bits.push('Note: ' + d.note);
      h += '<div class="txt small muted" style="color:#444">' + bits.map(esc).join('<br>') + '</div>';
    } else if (o.mid) {
      h += '<div class="txt mid">' + esc(d.text || '') + '</div>';
      if (scoreText(d.score) && d.score.kind !== 'flat') h += '<div class="ty" style="margin-top:3px">' + esc(scoreText(d.score)) + '</div>';
    }
    h += '<div class="foot"><span>' + esc(placeIcon(d.place)) + '</span><span class="val">' + (o.value != null ? esc(o.value) + '◇' : '') + (+d.income ? ' ' + d.income + '●' : '') + '</span></div>';
    return h + '</div>';
  }

  // Face for a card as it first lands on the board (nobody's meeple on it yet): what Dithry shows over the square
  // painting. The game draws its live board faces in boardFace (ui.js), with the same structure.
  function boardBlank(d, o) {
    o = o || {};
    var h = '<div class="card s-' + esc(d.suit) + (d.type === 'Foundation' ? ' found' : '') + '"' + (o.style ? ' style="' + o.style + '"' : '') + '>';
    h += '<div class="top"><span>' + esc(d.cost) + '●</span>' + icon(d.suit) + '</div>';
    if (o.art) h += '<div class="art" style="' + artStyle(o.art) + '"></div>';
    h += '<div class="nm">' + esc(d.name) + '</div><div class="ty">' + esc(d.type) + '</div>';
    h += '<div class="foot"><span class="meeps"></span><span class="val">' + (+d.income ? d.income + '●' : '') + '</span></div>';
    return h + '</div>';
  }

  /* ----- card texture: a faint two-tone dithered gradient, dark at the bottom, different for every card ----- */
  // Each suit shapes the gradient's frontier and dithers it its own way; each card's id seeds small changes
  // (phase, slope, where the bubbles go), so no two cards repeat. One pixel is 2 CSS pixels; the dark tone is
  // a light brown wash over the card's own colour, so it suits every suit and Foundations alike.
  var TEX_TONE = [70, 45, 10, 18];   // r, g, b, alpha (of 255) for the dark pixels
  function rng(seed) { var a = 0; for (var i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 2654435761) >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], HALFTONE = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14];
  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  // the frontier of each suit's gradient: darkness 0..1 at (u, v), u across and v down, both 0..1; a = width / height
  var TEX_FIELD = {
    // flames: pointed tongues licking up from the bottom, swept to one side as they rise
    Sword: function (R) { var lean = (R() < .5 ? -1 : 1) * (.25 + R() * .2), base = .92, T = [];
      for (var i = 0; i < 4; i++) T.push([-.1 + i * .36 + R() * .12, .16 + R() * .08, .3 + R() * .32]);   // centre, half-width, height
      return function (u, v) { var f = 0, up = base - v;
        T.forEach(function (t) { var x = (u - t[0] - lean * up * up * 2.2) / t[1], top = t[2] * Math.max(0, 1 - Math.abs(x)) * (1 - .25 * x * x);
          f = Math.max(f, sig((top - up) / .035) * (.42 + .4 * Math.max(0, 1 - up / .7))); });   // lighter towards the tips, so the streaks show
        return Math.max(f, sig((v - base) / .03) * .85); }; },
    // a spearhead rising from the bottom
    Sceptre: function (R) { var m = .38 + R() * .24, w = .2 + R() * .1, c = .82 + R() * .06, H = .5 + R() * .12;
      return function (u, v) { return sig((v - (c - H * Math.max(0, 1 - Math.abs(u - m) / w))) / .04); }; },
    // soft, uneven light falling through leaves (drawn as vines by TEX_MAP)
    Leaf: function (R) { var spots = []; for (var i = 0; i < 7; i++) spots.push([R(), .15 + R() * .85, .08 + R() * .1, R() < .5 ? -1 : 1]);
      return function (u, v, a) { var f = sig((v - .55) / .16); spots.forEach(function (s) { var d = Math.hypot((u - s[0]) * a, v - s[1]) / s[2]; if (d < 1) f += s[3] * .3 * (1 - d * d); }); return f; }; },
    // a headstone, rounded on top, rising from the bottom
    Bone: function (R) { var m = .4 + R() * .2, hw = .2 + R() * .08, top = .22 + R() * .14;
      return function (u, v, a) { var x = (u - m) * a, r = hw * a, cy = top + r, d = v > cy ? Math.abs(x) - r : Math.hypot(x, v - cy) - r; return sig(-d / .035) * .9 + v * .1; }; },
    // rolling waves: wavy lines, thicker and closer to solid as they go down
    Tome: function (R) { var k = .9 + R() * 1.1, ph = R() * 6.3, c = .34 + R() * .06, gap = .14 + R() * .03, drift = .8 + R() * 1.2;
      return function (u, v) { var f = v * v * .5; for (var i = 0; i < 5; i++) {   // wavy lines, each a little thicker than the one above
        var g = c + i * gap + .045 * Math.sin(6.283 * k * u + ph + i * drift), w = .014 + i * .007; f += sig((w - Math.abs(v - g)) / .012) * .8; }
        return f; }; },
    // a liquid line, with light, rimmed bubbles rising through the dark below it
    Goblet: function (R) { var c = .42 + R() * .1, bub = []; for (var i = 0; i < 5; i++) bub.push([.12 + R() * .76, c + .12 + R() * (.8 - c), .06 + R() * .06]);
      return function (u, v, a) { var f = sig((v - (c + .02 * Math.sin(u * 9 + c * 40))) / .05); bub.forEach(function (b) { var d = Math.hypot((u - b[0]) * a, v - b[1]) / b[2]; if (d < .8) f -= .9; else if (d < 1.1) f += .4; }); return f; }; }
  };
  // how each suit dithers: a fine checker, a softened cross-hatch, halftone dots.
  // Sword, Sceptre and Leaf draw a map per card instead (TEX_MAP, below).
  var TEX_DITHER = {
    Bone: function (x, y) { return ([0, 2, 3, 1][(y & 1) * 2 + (x & 1)] + .5) / 4; },
    Tome: function (x, y) { return (BAYER4[(y & 3) * 4 + (x & 3)] * .6 + (x & 1) * 5 + .5) / 15; },
    Goblet: function (x, y) { return (HALFTONE[(y & 3) * 4 + (x & 3)] + .5) / 16; }
  };
  // Per-card dither maps, (R, width, height) → threshold(x, y). A pixel turns dark where the gradient's darkness
  // passes its threshold, so low thresholds show first: they draw the pattern, and the rest fills in as it darkens.
  var TEX_MAP = {
    // a swoosh: curved streaks that sweep up and over like the flames, with a fine cross-hatch between them
    Sword: function (R, gw, gh) {
      var dir = R() < .5 ? -1 : 1, P = 5 + Math.floor(R() * 2), ph = R() * P, k = (.8 + R() * .6) * dir;
      return function (x, y) { var up = (gh - y) / gh, q = (x + k * up * up * gh * .9 + ph) / P, tri = Math.abs(2 * (q - Math.floor(q)) - 1);
        return .08 + tri * .72 + (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16 * .18; };
    },
    // ashlar masonry: mortar joints darken first, then the stones fill in; each course is offset by half a stone
    Sceptre: function (R, gw, gh) {
      var bw = 7 + Math.floor(R() * 3), bh = 4, ox = Math.floor(R() * bw), oy = Math.floor(R() * bh);
      return function (x, y) {
        var row = Math.floor((y + oy) / bh), yy = (y + oy) % bh, xx = (x + ox + (row & 1 ? bw >> 1 : 0)) % bw;
        if (yy === 0 || xx === 0) return .12;                                       // the joints
        return .45 + (BAYER4[(y & 3) * 4 + (x & 3)] + .5) / 16 * .55; };             // the stone face
    },
    // vines: sinuous diagonal stems (lower left to upper right), each with short side shoots and leaves
    Leaf: function (R, gw, gh) {
      var d = [], W = gw, H = gh, i, P = 11 + Math.floor(R() * 4), ph = R() * P;
      for (i = 0; i < W * H; i++) d[i] = 9;
      function dot(x, y, v) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && v < d[y * W + x]) d[y * W + x] = v; }
      for (var s = -H + ph; s < W + H; s += P) {                     // one stem per diagonal: x + y = s, wiggling
        var wob = R() * 6.3, side = R() < .5 ? 1 : -1;
        for (var t = -H; t < W + H; t += .5) {
          var w = 1.1 * Math.sin(t * .22 + wob), x = (s + t) / 2 + w * .7, y = (s - t) / 2 + w * .7; dot(x, y, 0);
          if (Math.abs(t % 9) < .25 && R() < .85) {                   // a shoot every few steps, on alternating sides,
            side = -side;                                              // leaving the stem at 45°: right or up
            var sx = side > 0 ? 1 : 0, sy = side > 0 ? 0 : -1, bx = x, by = y;
            for (var b = 1; b <= 6; b++) { bx += sx * .9 + .1; by += sy * .9 - .1; dot(bx, by, 1); }
            dot(bx + sx, by + sy, 0); dot(bx + sx + sy * -1, by + sy + sx, 0); dot(bx, by, 0);   // a leaf at the tip
          }
        }
      }
      for (var pass = 0; pass < 3; pass++) for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {   // grow outward: distance from the vine
        var k = y * W + x, m = d[k];
        if (x > 0) m = Math.min(m, d[k - 1] + 2); if (y > 0) m = Math.min(m, d[k - W] + 2); if (x < W - 1) m = Math.min(m, d[k + 1] + 2); if (y < H - 1) m = Math.min(m, d[k + W] + 2);
        d[k] = m;
      }
      var T = [.06, .2, .5, .62, .74, .84, .9, .94, .97, .98];   // stem, shoot, then a thin halo, then the gaps fill last
      return function (x, y) { return T[Math.min(9, d[y * W + x])]; };
    }
  };

  // The texture's dark pixels for a card: RGBA bytes, gw × gh (the card's size in CSS pixels, halved).
  function texPixels(suit, seed, gw, gh) {
    var px = new Uint8ClampedArray(gw * gh * 4), F = TEX_FIELD[suit]; if (!F) return px;
    var R = rng(seed + suit), field = F(R), N = rng('n' + seed), a = gw / gh;
    var Dth = TEX_MAP[suit] ? TEX_MAP[suit](rng('m' + seed), gw, gh) : TEX_DITHER[suit];
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
      var u = (x + .5) / gw, v = (y + .5) / gh, f = Math.max(0, Math.min(1, field(u, v, a) * .85 + v * .15));
      if (f > Dth(x, y, N)) { var i = (y * gw + x) * 4; px[i] = TEX_TONE[0]; px[i + 1] = TEX_TONE[1]; px[i + 2] = TEX_TONE[2]; px[i + 3] = TEX_TONE[3]; }
    }
    return px;
  }

  /* ----- painted faces ----- */
  // { cardId: { hand: dataURL, board: dataURL } }: the committed ones, with this browser's on top.
  function faces() {
    var mine = null; try { mine = JSON.parse(localStorage.getItem('ks.faces') || 'null'); } catch (e) { }
    var all = {}, k, base = typeof KCardArt !== 'undefined' ? KCardArt : {};
    for (k in base) all[k] = base[k];
    if (mine) for (k in mine) { if (mine[k]) all[k] = mine[k]; else delete all[k]; }   // null = reset to the plain texture
    return all;
  }

  return { esc: esc, ICON: ICON, icon: icon, placeIcon: placeIcon, scoreText: scoreText, SUIT_BG: SUIT_BG, FOUND_BG: FOUND_BG, picCSS: picCSS, artStyle: artStyle,
    handFace: handFace, boardBlank: boardBlank, rng: rng, BAYER4: BAYER4, texPixels: texPixels, faces: faces, HAND: [75, 103], BOARD: [52, 52] };
})();
if (typeof module !== 'undefined') module.exports = KFace;
