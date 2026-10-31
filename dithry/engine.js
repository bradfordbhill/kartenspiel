/* Dithry engine: the pixel work behind the paint app, with no page or canvas code, so it also runs in Node.
   A picture is a stack of layers, each an RGBA byte array the size of the canvas. Every tool works the same way:
   it builds a mask (which pixels it touches), then paint() fills the mask with the current style.
   A style is a ramp of 1–4 colours plus a gradient "field": for each pixel, how far along the ramp it is (0..1).
   The field is dithered into the ramp's colours by a threshold pattern, so a smooth gradient becomes pixel art. */
(function (root) {
  'use strict';

  /* ---------------- randomness and noise ---------------- */
  // A small seeded generator (mulberry32), so a style's noise looks the same every time it's drawn.
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // A repeatable random number in [0, 1) for each whole-number point.
  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // Smooth value noise in [0, 1), and three octaves of it (fractal noise) for natural-looking turbulence.
  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed) { return (vnoise(x, y, seed) * 4 + vnoise(x * 2.03, y * 2.03, seed + 7) * 2 + vnoise(x * 4.1, y * 4.1, seed + 13)) / 7; }

  /* ---------------- dither patterns ---------------- */
  // Each pattern gives a threshold in [0, 1) for a pixel. Where the field is above the threshold, the pixel takes the
  // next colour along the ramp; so low thresholds show first and draw the pattern's shapes. x and y are already
  // divided by the pattern's scale. ctx carries the seed, canvas size and a cache.
  function bayer(n) {   // the classic ordered-dither matrix, n = 2, 4 or 8
    var m = [[0]];
    while (m.length < n) {
      var s = m.length, k = [];
      for (var y = 0; y < s * 2; y++) { k.push([]); for (var x = 0; x < s * 2; x++) k[y].push(4 * m[y % s][x % s] + [0, 2, 3, 1][(y < s ? 0 : 2) + (x < s ? 0 : 1)]); }
      m = k;
    }
    return m;
  }
  var B2 = bayer(2), B4 = bayer(4), B8 = bayer(8), HALF = [[12, 5, 6, 13], [4, 0, 1, 7], [11, 3, 2, 8], [15, 10, 9, 14]];
  function mod(a, n) { return ((a % n) + n) % n; }
  function tri(q) { return Math.abs(2 * (q - Math.floor(q)) - 1); }   // 0 at whole numbers, 1 halfway between
  var PATTERNS = [
    { id: 'bayer4', name: 'Bayer 4×4 (cross-hatch)', fn: function (x, y) { return (B4[mod(y, 4)][mod(x, 4)] + .5) / 16; } },
    { id: 'bayer2', name: 'Bayer 2×2 (fine checker)', fn: function (x, y) { return (B2[mod(y, 2)][mod(x, 2)] + .5) / 4; } },
    { id: 'bayer8', name: 'Bayer 8×8 (smooth)', fn: function (x, y) { return (B8[mod(y, 8)][mod(x, 8)] + .5) / 64; } },
    { id: 'halftone', name: 'Halftone dots', fn: function (x, y) { return (HALF[mod(y, 4)][mod(x, 4)] + .5) / 16; } },
    { id: 'diag45', name: 'Cross-hatch at 45°', fn: function (x, y) { return (B4[mod(x + y, 4)][mod(Math.floor((x - y) / 2), 4)] + .5) / 16; } },   // x+y and x−y share parity, so halve one
    { id: 'linesH', name: 'Ruled lines', fn: function (x, y) { return (mod(y, 4) * 4 + [0, 2, 1, 3][mod(x, 4)] + .5) / 16; } },
    { id: 'linesV', name: 'Upright lines', fn: function (x, y) { return (mod(x, 4) * 4 + [0, 2, 1, 3][mod(y, 4)] + .5) / 16; } },
    { id: 'linesD', name: 'Slanted lines', fn: function (x, y) { return (mod(x + y, 4) * 4 + [0, 2, 1, 3][mod(x - y, 4)] + .5) / 16; } },
    { id: 'noise', name: 'Scattered (noise)', fn: function (x, y, c) { return hash2(x, y, c.seed); } },
    { id: 'even', name: 'Even scatter', fn: function (x, y) { var q = .06711056 * x + .00583715 * y; return mod(52.9829189 * (q - Math.floor(q)), 1); } },
    { id: 'masonry', name: 'Masonry', fn: function (x, y) {   // joints darken first, then the stones fill in
      var row = Math.floor(y / 4), yy = mod(y, 4), xx = mod(x + (row & 1 ? 4 : 0), 8);
      return yy === 0 || xx === 0 ? .12 : .45 + (B4[mod(y, 4)][mod(x, 4)] + .5) / 16 * .55; } },
    { id: 'grass', name: 'Wind-bent grass', fn: function (x, y) {
      var q = (y - x * .28 + 2.5 * Math.sin(x * .06 + y * .02)) / 4; return tri(q) * .6 + (B4[mod(y, 4)][mod(x, 4)] + .5) / 16 * .4; } },
    { id: 'swoosh', name: 'Swoosh streaks', fn: function (x, y, c) {
      var up = (c.h - y) / Math.max(1, c.h), q = (x + up * up * c.h * .9) / 5; return .08 + tri(q) * .72 + (B4[mod(y, 4)][mod(x, 4)] + .5) / 16 * .18; } },
    { id: 'waves', name: 'Waves', fn: function (x, y) {
      var q = (y + 1.6 * Math.sin(x * .35)) / 5; return tri(q) * .7 + (B4[mod(y, 4)][mod(x, 4)] + .5) / 16 * .3; } },
    { id: 'vines', name: 'Vines', fn: function (x, y, c) { var m = vineMap(c); return m.t[m.d[mod(y, m.h) * m.w + mod(x, m.w)]]; } },
    { id: 'scales', name: 'Scales', fn: function (x, y) {   // overlapping arcs, like shingles or dragon scales
      var row = Math.floor(y / 4), cx = mod(x + (row & 1 ? 3 : 0), 6) - 3, cy = mod(y, 4); var d = Math.hypot(cx, cy * 1.4);
      return Math.min(.99, Math.abs(d - 2.6) * .35 + .05 + (B4[mod(y, 4)][mod(x, 4)] + .5) / 16 * .2); } }
  ];
  var PATTERN = {}; PATTERNS.forEach(function (p) { PATTERN[p.id] = p; });
  // The vines pattern: sinuous diagonal stems with 45° shoots and leaves, drawn once per seed as a distance map.
  function vineMap(c) {
    var key = 'vines' + c.seed; if (c.cache[key]) return c.cache[key];
    var W = 96, H = 96, d = new Uint8Array(W * H), R = rng(c.seed * 7 + 3), P = 13;
    for (var i = 0; i < W * H; i++) d[i] = 9;
    function dot(x, y, v) { x = mod(Math.round(x), W); y = mod(Math.round(y), H); var k = y * W + x; if (v < d[k]) d[k] = v; }
    for (var s = 0; s < W + H; s += P) {
      var wob = R() * 6.3, side = 1;
      for (var t = -H; t < W + H; t += .5) {
        var w = 1.1 * Math.sin(t * .22 + wob), x = (s + t) / 2 + w * .7, y = (s - t) / 2 + w * .7; dot(x, y, 0);
        if (Math.abs(t % 9) < .25 && R() < .85) {
          side = -side; var sx = side > 0 ? 1 : 0, sy = side > 0 ? 0 : -1, bx = x, by = y;
          for (var b = 1; b <= 6; b++) { bx += sx * .9 + .1; by += sy * .9 - .1; dot(bx, by, 1); }
          dot(bx + sx, by + sy, 0); dot(bx, by, 0);
        }
      }
    }
    for (var pass = 0; pass < 3; pass++) for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      var k = yy * W + xx, m = d[k];
      m = Math.min(m, d[yy * W + mod(xx - 1, W)] + 2, d[mod(yy - 1, H) * W + xx] + 2, d[yy * W + mod(xx + 1, W)] + 2, d[mod(yy + 1, H) * W + xx] + 2);
      d[k] = Math.min(9, m);
    }
    return (c.cache[key] = { w: W, h: H, d: d, t: [.06, .2, .5, .62, .74, .84, .9, .94, .97, .98] });
  }

  /* ---------------- colours ---------------- */
  // '#rrggbb' (or '#rgb') and an alpha 0..1 → [r, g, b, a] bytes.
  function rgba(hex, alpha) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(255 * (alpha == null ? 1 : Math.max(0, Math.min(1, alpha))))];
  }
  function hex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + (v & 255).toString(16)).slice(-2); }).join(''); }

  /* ---------------- styles ---------------- */
  // The default style: two tones, a top-to-bottom gradient across each shape, Bayer 4×4 dithering.
  function defaultStyle() {
    return {
      mode: 'gradient',                 // 'solid' paints colour 1 only; 'gradient' dithers along the ramp
      ramp: [{ c: '#2a2a3a', a: 1 }, { c: '#8a8aa0', a: 1 }],   // 1–4 colours, from where the field is 0 to where it is 1
      grad: { type: 'linear', anchor: 'shape', angle: 90, x0: 0, y0: 0, x1: 0, y1: 32, start: 0, end: 1, mid: .5, contrast: 1, reverse: true, repeat: 'none', mix: .5 },
      ripple: { amp: 0, freq: 3, phase: 0, turb: 0, turbScale: 12 },
      dither: { pattern: 'bayer4', scale: 1, level: 1, seed: 1 },
      opacity: 1, ditherOpacity: true
    };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- the field ---------------- */
  // Builds field(x, y) → 0..1 for a style over a box {x0, y0, x1, y1} (the shape's bounds, exclusive at the far
  // edge). With anchor 'canvas' the gradient runs between the style's two handles instead. dist, when given, is a
  // distance-from-the-edge map for the 'edge' type.
  function makeField(st, box, dist) {
    var g = st.grad, rp = st.ripple, seed = st.dither.seed | 0;
    var cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, hw = Math.max(.5, (box.x1 - box.x0) / 2), hh = Math.max(.5, (box.y1 - box.y0) / 2);
    var canvas = g.anchor === 'canvas', a = (g.angle || 0) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    var px0 = g.x0, py0 = g.y0, L = Math.max(.5, Math.hypot(g.x1 - g.x0, g.y1 - g.y0)), ux = (g.x1 - g.x0) / L, uy = (g.y1 - g.y0) / L;
    if (canvas && L <= .5) { ux = 0; uy = 1; }
    var span = g.end - g.start, midExp = g.mid > 0 && g.mid < 1 && Math.abs(g.mid - .5) > .001 ? Math.log(.5) / Math.log(g.mid) : 1, con = Math.max(.02, g.contrast);
    var ext = hw * Math.abs(dx) + hh * Math.abs(dy), pext = hw * Math.abs(dy) + hh * Math.abs(dx), maxD = 1;
    if (dist) for (var i = 0; i < dist.d.length; i++) if (dist.d[i] > maxD && dist.d[i] < 1e8) maxD = dist.d[i];
    return function (x, y) {
      var X = x + .5, Y = y + .5, v, s;   // v: position along the gradient; s: position across it (for ripples)
      switch (g.type) {
        case 'flat': v = g.mix; s = canvas ? (X - px0) / L : (X - box.x0) / (2 * hw); break;
        case 'radial':
          if (canvas) { v = Math.hypot(X - px0, Y - py0) / L; s = Math.atan2(Y - py0, X - px0) / 6.2832 + .5; }
          else { v = Math.hypot((X - cx) / hw, (Y - cy) / hh); s = Math.atan2(Y - cy, X - cx) / 6.2832 + .5; }
          break;
        case 'diamond':
          if (canvas) { var ax = (X - px0) * ux + (Y - py0) * uy, ay = -(X - px0) * uy + (Y - py0) * ux; v = (Math.abs(ax) + Math.abs(ay)) / L; s = Math.atan2(ay, ax) / 6.2832 + .5; }
          else { v = Math.abs(X - cx) / hw + Math.abs(Y - cy) / hh; s = Math.atan2(Y - cy, X - cx) / 6.2832 + .5; }
          break;
        case 'conic':
          s = canvas ? Math.hypot(X - px0, Y - py0) / L : Math.hypot((X - cx) / hw, (Y - cy) / hh);
          v = mod((canvas ? Math.atan2(Y - py0, X - px0) - Math.atan2(uy, ux) : Math.atan2(Y - cy, X - cx) - a) / 6.2832, 1);
          break;
        case 'edge':   // 0 at the shape's edge, rising to 1 at its deepest point
          if (dist) { var dd = dist.d[(y - dist.y0) * dist.w + (x - dist.x0)]; v = dd >= 1e8 ? 0 : Math.min(1, dd / maxD); s = (X - box.x0) / (2 * hw); break; }
          // no shape (a brush stroke): fall through to linear
        default:   // linear
          if (canvas) { v = ((X - px0) * ux + (Y - py0) * uy) / L; s = (-(X - px0) * uy + (Y - py0) * ux) / L; }
          else { v = ((X - cx) * dx + (Y - cy) * dy) / (2 * ext) + .5; s = (-(X - cx) * dy + (Y - cy) * dx) / (2 * pext) + .5; }
      }
      if (rp.amp) v += rp.amp * Math.sin(6.2832 * (rp.freq * s + rp.phase));
      if (rp.turb) v += rp.turb * (fbm(x / Math.max(1, rp.turbScale), y / Math.max(1, rp.turbScale), seed) - .5) * 2;
      v = span ? (v - g.start) / span : (v >= g.start ? 1 : 0);
      if (g.repeat === 'repeat') v = mod(v, 1); else if (g.repeat === 'mirror') v = 1 - tri(v / 2); else v = Math.max(0, Math.min(1, v));
      if (g.reverse) v = 1 - v;
      if (midExp !== 1) v = Math.pow(v, midExp);
      v = (v - .5) / con + .5;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };
  }
  // Distance (in pixels, roughly) from each masked pixel to the nearest unmasked one, within box: for 'edge' gradients.
  function edgeDistance(mask, W, box) {
    var w = box.x1 - box.x0, h = box.y1 - box.y0, d = new Float32Array(w * h), BIG = 1e9, x, y, k;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) d[y * w + x] = mask[(y + box.y0) * W + x + box.x0] ? BIG : 0;
    function at(xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : d[yy * w + xx]; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (d[k]) d[k] = Math.min(d[k], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) { k = y * w + x; if (d[k]) d[k] = Math.min(d[k], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
    return { d: d, w: w, x0: box.x0, y0: box.y0 };
  }

  /* ---------------- painting ---------------- */
  // A pattern-threshold function for a style, with its scale applied.
  function thresholder(st, W, H, cache) {
    var p = PATTERN[st.dither.pattern] || PATTERN.bayer4, sc = Math.max(1, st.dither.scale | 0), ctx = { seed: st.dither.seed | 0, w: Math.ceil(W / sc), h: Math.ceil(H / sc), cache: cache || {} };
    return function (x, y) { return p.fn(Math.floor(x / sc), Math.floor(y / sc), ctx); };
  }
  // Fills the masked pixels of box with the style, reading from src and writing to dst (the same size as the canvas;
  // they may be the same array). Pixels in box outside the mask are copied unchanged, so a preview can be redrawn
  // over and over from the same src. opts: { erase, field (to share one field across calls), cache }.
  function paint(dst, src, W, H, mask, box, st, opts) {
    opts = opts || {};
    var bx0 = Math.max(0, box.x0), by0 = Math.max(0, box.y0), bx1 = Math.min(W, box.x1), by1 = Math.min(H, box.y1);
    if (bx1 <= bx0 || by1 <= by0) return;
    var field = opts.field || makeField(st, box), thr = thresholder(st, W, H, opts.cache), lvl = st.dither.level;
    var ramp = (st.mode === 'solid' ? st.ramp.slice(0, 1) : st.ramp).map(function (r) { return rgba(r.c, r.a); }), n = ramp.length;
    var op = Math.max(0, Math.min(1, st.opacity)), dop = st.ditherOpacity && op < 1, opThr = dop ? function (x, y) { return (B4[mod(y + 2, 4)][mod(x + 1, 4)] + .5) / 16; } : null;
    for (var y = by0; y < by1; y++) for (var x = bx0; x < bx1; x++) {
      var k = y * W + x, i = k * 4;
      dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3];
      if (!mask[k]) continue;
      var alpha = 1;
      if (dop) { if (opThr(x, y) >= op) continue; } else alpha = op;
      if (opts.erase) { dst[i + 3] = Math.round(src[i + 3] * (1 - alpha)); continue; }
      var c;
      if (n === 1) c = ramp[0];
      else {
        var t = field(x, y), p = t * (n - 1), j = Math.min(n - 2, Math.floor(p)), f = p - j, th = .5 + (thr(x, y) - .5) * lvl;
        c = ramp[f > th ? j + 1 : j];
      }
      var sa = c[3] / 255 * alpha; if (sa <= 0) continue;
      var da = src[i + 3] / 255, oa = sa + da * (1 - sa);
      dst[i] = Math.round((c[0] * sa + src[i] * da * (1 - sa)) / oa);
      dst[i + 1] = Math.round((c[1] * sa + src[i + 1] * da * (1 - sa)) / oa);
      dst[i + 2] = Math.round((c[2] * sa + src[i + 2] * da * (1 - sa)) / oa);
      dst[i + 3] = Math.round(oa * 255);
    }
  }

  // Redraws the pixels in box by their brightness, in the style's colours: dark pixels take colour 1, bright ones the
  // last, dithered between. The gradient panel's start, end, midpoint, softness and reverse shape the tones; each
  // pixel keeps its transparency. This turns an imported picture into dithered pixel art.
  function ditherBrightness(data, W, H, st, b, cache) {
    b = b || { x0: 0, y0: 0, x1: W, y1: H };
    var g = st.grad, span = g.end - g.start, midExp = g.mid > 0 && g.mid < 1 && Math.abs(g.mid - .5) > .001 ? Math.log(.5) / Math.log(g.mid) : 1, con = Math.max(.02, g.contrast);
    var thr = thresholder(st, W, H, cache), lvl = st.dither.level, ramp = st.ramp.map(function (r) { return rgba(r.c, r.a); }), n = ramp.length;
    for (var y = b.y0; y < b.y1; y++) for (var x = b.x0; x < b.x1; x++) {
      var i = (y * W + x) * 4; if (!data[i + 3]) continue;
      var v = (.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]) / 255;
      v = span ? Math.max(0, Math.min(1, (v - g.start) / span)) : v >= g.start ? 1 : 0;
      if (g.reverse) v = 1 - v; if (midExp !== 1) v = Math.pow(v, midExp); v = Math.max(0, Math.min(1, (v - .5) / con + .5));
      var c = ramp[0];
      if (n > 1) { var p = v * (n - 1), j = Math.min(n - 2, Math.floor(p)); c = ramp[p - j > .5 + (thr(x, y) - .5) * lvl ? j + 1 : j]; }
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = Math.round(data[i + 3] * c[3] / 255);
    }
  }
  function intersect(a, b) { if (!a || !b) return null; var r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) }; return r.x1 > r.x0 && r.y1 > r.y0 ? r : null; }

  /* ---------------- masks: which pixels a tool touches ---------------- */
  // Masks are a Uint8Array the size of the canvas (1 = touched). Each function marks pixels and returns the box it
  // touched, {x0, y0, x1, y1} with x1, y1 exclusive, clipped to the canvas (or null if it touched nothing).
  function box(x0, y0, x1, y1, W, H) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    return x1 > x0 && y1 > y0 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }
  function union(a, b) { if (!a) return b; if (!b) return a; return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; }
  // One dab of a brush: size 1 is a single pixel; larger sizes are a square or a disc centred on the pixel.
  function stamp(mask, W, H, x, y, size, round) {
    x = Math.round(x); y = Math.round(y); size = Math.max(1, size | 0);
    var r0 = Math.floor((size - 1) / 2), r1 = size - 1 - r0, rr = (size / 2) * (size / 2);
    for (var yy = y - r0; yy <= y + r1; yy++) for (var xx = x - r0; xx <= x + r1; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (round && size > 2) { var ddx = xx - x + (size % 2 ? 0 : -.5), ddy = yy - y + (size % 2 ? 0 : -.5); if (ddx * ddx + ddy * ddy > rr) continue; }
      mask[yy * W + xx] = 1;
    }
    return box(x - r0, y - r0, x + r1 + 1, y + r1 + 1, W, H);
  }
  // A line of dabs, pixel by pixel (Bresenham), so a stroke has no gaps however fast the pointer moves.
  function line(mask, W, H, x0, y0, x1, y1, size, round) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, b = null;
    for (;;) {
      b = union(b, stamp(mask, W, H, x0, y0, size, round));
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return b;
  }
  function rect(mask, W, H, x0, y0, x1, y1, fill, ow) {
    var l = Math.min(x0, x1), t = Math.min(y0, y1), r = Math.max(x0, x1), b = Math.max(y0, y1), w = Math.max(1, ow | 0);
    for (var y = t; y <= b; y++) for (var x = l; x <= r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      var edge = x - l < w || r - x < w || y - t < w || b - y < w;
      if (fill || edge) mask[y * W + x] = 1;
    }
    return box(l, t, r + 1, b + 1, W, H);
  }
  // An ellipse inside the box from (x0, y0) to (x1, y1), inclusive. Outlines are ow pixels thick.
  function ellipse(mask, W, H, x0, y0, x1, y1, fill, ow) {
    var l = Math.min(x0, x1), t = Math.min(y0, y1), r = Math.max(x0, x1), b = Math.max(y0, y1);
    var cx = (l + r + 1) / 2, cy = (t + b + 1) / 2, rx = (r - l + 1) / 2, ry = (b - t + 1) / 2, w = Math.max(1, ow | 0);
    var irx = rx - w, iry = ry - w;
    for (var y = t; y <= b; y++) for (var x = l; x <= r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      var nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry; if (nx * nx + ny * ny > 1) continue;
      var inner = irx > 0 && iry > 0 && Math.pow((x + .5 - cx) / irx, 2) + Math.pow((y + .5 - cy) / iry, 2) <= 1;
      if (fill || !inner) mask[y * W + x] = 1;
    }
    return box(l, t, r + 1, b + 1, W, H);
  }
  // A polygon through pts [[x, y], ...]: filled by the even-odd rule at pixel centres, and/or outlined.
  function polygon(mask, W, H, pts, fill, ow, round) {
    if (!pts.length) return null;
    var b = null, i;
    if (fill && pts.length > 2) {
      var t = Infinity, bt = -Infinity; pts.forEach(function (p) { t = Math.min(t, p[1]); bt = Math.max(bt, p[1]); });
      for (var y = Math.max(0, Math.floor(t)); y <= Math.min(H - 1, Math.ceil(bt)); y++) {
        var yc = y + .5, xs = [];
        for (i = 0; i < pts.length; i++) {
          var a = pts[i], c = pts[(i + 1) % pts.length], ay = a[1] + .5, cy2 = c[1] + .5;
          if ((ay <= yc && cy2 > yc) || (cy2 <= yc && ay > yc)) xs.push(a[0] + .5 + (yc - ay) / (cy2 - ay) * (c[0] - a[0]));
        }
        xs.sort(function (p, q) { return p - q; });
        for (i = 0; i + 1 < xs.length; i += 2) {
          var xa = Math.max(0, Math.ceil(xs[i] - .5)), xb = Math.min(W - 1, Math.floor(xs[i + 1] - .5));
          for (var x = xa; x <= xb; x++) mask[y * W + x] = 1;
          if (xb >= xa) b = union(b, { x0: xa, y0: y, x1: xb + 1, y1: y + 1 });
        }
      }
    }
    if (!fill || ow > 0) for (i = 0; i < pts.length; i++) {
      var p0 = pts[i], p1 = pts[(i + 1) % pts.length];
      if (!fill && i === pts.length - 1 && pts.length < 3) break;
      b = union(b, line(mask, W, H, p0[0], p0[1], p1[0], p1[1], Math.max(1, ow | 0), round));
    }
    return b;
  }
  // The pixels connected to (x, y) (sideways and up/down) whose colour is within tol of its colour.
  function flood(mask, data, W, H, x, y, tol) {
    x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return null;
    var i0 = (y * W + x) * 4, r = data[i0], g = data[i0 + 1], bl = data[i0 + 2], a = data[i0 + 3], seen = new Uint8Array(W * H), stack = [y * W + x];
    var bx0 = x, by0 = y, bx1 = x, by1 = y; tol = tol || 0;
    function same(k) { var i = k * 4; if (a === 0 && data[i + 3] === 0) return true; return Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - bl) <= tol && Math.abs(data[i + 3] - a) <= tol; }
    while (stack.length) {
      var k = stack.pop(); if (seen[k]) continue; seen[k] = 1; if (!same(k)) continue;
      mask[k] = 1; var px = k % W, py = (k - px) / W;
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py;
      if (px > 0) stack.push(k - 1); if (px < W - 1) stack.push(k + 1); if (py > 0) stack.push(k - W); if (py < H - 1) stack.push(k + W);
    }
    return { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 };
  }
  // Adds the left-right mirror image of the masked pixels in b (for symmetrical drawing); returns the widened box.
  function mirror(mask, W, H, b) {
    if (!b) return b;
    for (var y = b.y0; y < b.y1; y++) for (var x = b.x0; x < b.x1; x++) if (mask[y * W + x] === 1) mask[y * W + (W - 1 - x)] = 2;
    for (var k = 0; k < mask.length; k++) if (mask[k] === 2) mask[k] = 1;
    return union(b, { x0: W - b.x1, y0: b.y0, x1: W - b.x0, y1: b.y1 });
  }

  /* ---------------- layers ---------------- */
  // Blends the visible layers, bottom first, into out (RGBA bytes) within box.
  function composite(out, layers, W, H, b) {
    b = b || { x0: 0, y0: 0, x1: W, y1: H };
    for (var y = b.y0; y < b.y1; y++) for (var x = b.x0; x < b.x1; x++) {
      var i = (y * W + x) * 4, r = 0, g = 0, bl = 0, a = 0;
      for (var l = 0; l < layers.length; l++) {
        var L = layers[l]; if (!L.visible) continue;
        var d = L.data, sa = d[i + 3] / 255 * L.opacity; if (sa <= 0) continue;
        var oa = sa + a * (1 - sa);
        r = (d[i] * sa + r * a * (1 - sa)) / oa; g = (d[i + 1] * sa + g * a * (1 - sa)) / oa; bl = (d[i + 2] * sa + bl * a * (1 - sa)) / oa; a = oa;
      }
      out[i] = Math.round(r); out[i + 1] = Math.round(g); out[i + 2] = Math.round(bl); out[i + 3] = Math.round(a * 255);
    }
  }
  function newLayer(W, H, name) { return { name: name || 'Layer', visible: true, opacity: 1, locked: false, data: new Uint8ClampedArray(W * H * 4) }; }
  // Moves a layer's pixels by (dx, dy), reading from src; what slides off the edge is lost.
  function shift(dst, src, W, H, dx, dy) {
    dst.fill(0);
    for (var y = 0; y < H; y++) { var sy = y - dy; if (sy < 0 || sy >= H) continue;
      for (var x = 0; x < W; x++) { var sx = x - dx; if (sx < 0 || sx >= W) continue; var i = (y * W + x) * 4, j = (sy * W + sx) * 4; dst[i] = src[j]; dst[i + 1] = src[j + 1]; dst[i + 2] = src[j + 2]; dst[i + 3] = src[j + 3]; } }
  }
  function flip(data, W, H, horizontal) {
    var c = new Uint8ClampedArray(data);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { var i = (y * W + x) * 4, j = horizontal ? (y * W + (W - 1 - x)) * 4 : ((H - 1 - y) * W + x) * 4; data[i] = c[j]; data[i + 1] = c[j + 1]; data[i + 2] = c[j + 2]; data[i + 3] = c[j + 3]; }
  }

  /* ---------------- style presets ---------------- */
  // Starting points that match Kartenspiel's own art. Each overrides parts of the default style.
  var PRESETS = [
    { name: 'Kartenspiel card wash', s: { ramp: [{ c: '#462d0a', a: 0 }, { c: '#462d0a', a: .07 }], grad: { type: 'linear', angle: 90, reverse: false, contrast: .6 }, dither: { pattern: 'bayer4' } } },
    { name: 'Night sky', s: { ramp: [{ c: '#2a2d3a', a: 1 }, { c: '#4a5068', a: 1 }, { c: '#8a90a8', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false, mid: .6 }, ripple: { amp: .05, freq: 2.5, turb: .06, turbScale: 18 }, dither: { pattern: 'bayer4' } } },
    { name: 'Backdrop greys (light)', s: { ramp: [{ c: '#c9c9c9', a: 1 }, { c: '#b9b9b9', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false }, dither: { pattern: 'bayer4' } } },
    { name: 'Backdrop greys (dark)', s: { ramp: [{ c: '#262a2a', a: 1 }, { c: '#1c1f1f', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false }, dither: { pattern: 'bayer4' } } },
    { name: 'Wind-bent grass', s: { ramp: [{ c: '#4d6b3a', a: 1 }, { c: '#2f4524', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false, contrast: .8 }, dither: { pattern: 'grass' } } },
    { name: 'River water', s: { ramp: [{ c: '#9fb8d0', a: 1 }, { c: '#5a7896', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false }, ripple: { amp: .06, freq: 4 }, dither: { pattern: 'linesH' } } },
    { name: 'Masonry', s: { ramp: [{ c: '#d8ccb0', a: 1 }, { c: '#8a7c62', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false, contrast: .8 }, dither: { pattern: 'masonry' } } },
    { name: 'Flames', s: { ramp: [{ c: '#ffe08a', a: 1 }, { c: '#f08a24', a: 1 }, { c: '#b01818', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false, contrast: .7 }, ripple: { amp: .12, freq: 3 }, dither: { pattern: 'swoosh' } } },
    { name: 'Vines', s: { ramp: [{ c: '#dcf2d4', a: 1 }, { c: '#3f7a2e', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false, contrast: .8 }, dither: { pattern: 'vines' } } },
    { name: 'Gold leaf', s: { ramp: [{ c: '#fff2a8', a: 1 }, { c: '#f2c230', a: 1 }, { c: '#b07a10', a: 1 }], grad: { type: 'linear', angle: 90, reverse: false }, ripple: { amp: .08, freq: 1.5 }, dither: { pattern: 'bayer2' } } },
    { name: 'Moonlit glow', s: { ramp: [{ c: '#ffffff', a: 0 }, { c: '#e8ecff', a: .6 }, { c: '#ffffff', a: 1 }], grad: { type: 'radial', reverse: true, contrast: .9 }, dither: { pattern: 'bayer8' } } },
    { name: 'Dragon scales', s: { ramp: [{ c: '#2e6b4f', a: 1 }, { c: '#163a2a', a: 1 }], grad: { type: 'edge', reverse: true, contrast: .8 }, dither: { pattern: 'scales' } } }
  ];
  function applyPreset(st, preset) {
    var d = defaultStyle(), s = preset.s, o = clone(st);
    o.ramp = clone(s.ramp || d.ramp); o.mode = 'gradient';
    ['grad', 'ripple', 'dither'].forEach(function (k) { var keep = k === 'grad' ? { anchor: o.grad.anchor, x0: o.grad.x0, y0: o.grad.y0, x1: o.grad.x1, y1: o.grad.y1 } : k === 'dither' ? { seed: o.dither.seed, scale: o.dither.scale } : {}; o[k] = Object.assign({}, d[k], keep, s[k] || {}); });
    return o;
  }

  var api = {
    rng: rng, hash2: hash2, vnoise: vnoise, fbm: fbm, bayer: bayer, PATTERNS: PATTERNS, PATTERN: PATTERN, rgba: rgba, hex: hex,
    defaultStyle: defaultStyle, clone: clone, makeField: makeField, edgeDistance: edgeDistance, thresholder: thresholder, paint: paint,
    ditherBrightness: ditherBrightness, intersect: intersect,
    box: box, union: union, stamp: stamp, line: line, rect: rect, ellipse: ellipse, polygon: polygon, flood: flood, mirror: mirror,
    composite: composite, newLayer: newLayer, shift: shift, flip: flip, PRESETS: PRESETS, applyPreset: applyPreset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Dithry = api;
})(this);
