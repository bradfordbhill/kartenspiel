/* Dithry: Pixel Art and Dithered Gradient Tool. The paint app around engine.js (window.Dithry).
   Sections: state, the window (menus, toolbox, panels), the canvas view, drawing operations and tools, history,
   layers, files (projects, import, export, autosave), dialogs, keyboard, the example scene, and start-up. */
(function () {
  'use strict';
  var D = window.Dithry;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- state ---------------- */
  var prefs = lsGet('dithry.prefs') || {};
  var app = {
    doc: null,                       // { w, h, layers: [{ name, visible, opacity, locked, data }], active }
    style: prefs.style || D.defaultStyle(),
    tool: prefs.tool || 'brush', size: prefs.size || 1, round: prefs.round !== false, shape: prefs.shape || 'fill', snap: !!prefs.snap, mirror: false, sheet: null,
    sampleAll: !!prefs.sampleAll, tol: prefs.tol || 0, gradTarget: prefs.gradTarget || 'layer',
    zoom: 4, panX: 0, panY: 0, grid: prefs.grid !== false, bg: prefs.bg || 'checker',
    rampSel: 0, palette: prefs.palette || 'kartenspiel', custom: prefs.custom || [], userPresets: prefs.userPresets || [], shut: prefs.shut || {},
    undo: [], redo: [], name: 'Untitled', dirty: false, hover: null
  };
  function savePrefs() {
    lsSet('dithry.prefs', { style: app.style, tool: app.tool, size: app.size, round: app.round, shape: app.shape, snap: app.snap, sampleAll: app.sampleAll, tol: app.tol, gradTarget: app.gradTarget,
      grid: app.grid, bg: app.bg, palette: app.palette, custom: app.custom, userPresets: app.userPresets, shut: app.shut });
  }
  function W() { return app.doc.w; } function H() { return app.doc.h; }
  function layer(i) { return app.doc.layers[i == null ? app.doc.active : i]; }

  /* ---------------- tools ---------------- */
  // key: shortcut letter. icon: a small SVG (20 × 20, drawn with crisp edges).
  function svg(body) { return '<svg width="20" height="20" viewBox="0 0 20 20" shape-rendering="crispEdges" aria-hidden="true">' + body + '</svg>'; }
  var TOOLS = [
    { id: 'select', name: 'Select', key: 'S', hint: 'Drag a rectangle: drawing then stays inside it. Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste; Esc or Ctrl+D deselects.', icon: svg('<rect x="2.5" y="4.5" width="15" height="11" fill="none" stroke="#000" stroke-dasharray="2 2"/>') },
    { id: 'pencil', name: 'Pencil', key: 'N', hint: 'Draw single pixels. Shift-click draws a straight line from the last point.', icon: svg('<path d="M3 17 L13 7 L16 10 L6 20 Z" fill="#f2c230" stroke="#000"/><path d="M13 7 L15 5 L18 8 L16 10 Z" fill="#e05050" stroke="#000"/><path d="M3 17 L6 20 L2 21 Z" fill="#000"/>') },
    { id: 'brush', name: 'Brush', key: 'B', hint: 'Paint freehand with the current style. Size and tip shape are below the tools.', icon: svg('<path d="M12 2 L18 8 L11 12 L8 9 Z" fill="#8a5a20" stroke="#000"/><path d="M8 9 L11 12 L7 17 Q3 19 2 18 Q3 15 5 12 Z" fill="#1f4fd1" stroke="#000"/>') },
    { id: 'eraser', name: 'Eraser', key: 'E', hint: 'Erase to transparent. With opacity below 100%, it erases in a dither pattern.', icon: svg('<path d="M3 13 L11 5 L17 11 L9 19 Z" fill="#ffb0c0" stroke="#000"/><path d="M3 13 L7 9 L13 15 L9 19 Z" fill="#fff" stroke="#000"/>') },
    { id: 'line', name: 'Line', key: 'L', hint: 'Drag a straight line. Hold Shift to snap to 45°.', icon: svg('<path d="M3 17 L17 3" stroke="#000" stroke-width="2.5"/>') },
    { id: 'rect', name: 'Rectangle', key: 'R', hint: 'Drag a rectangle. Hold Shift for a square. Fill or outline is set below.', icon: svg('<rect x="3" y="5" width="14" height="11" fill="#8a90a8" stroke="#000" stroke-width="1.5"/>') },
    { id: 'ellipse', name: 'Ellipse', key: 'O', hint: 'Drag an ellipse. Hold Shift for a circle.', icon: svg('<ellipse cx="10" cy="10" rx="7.5" ry="6" fill="#8a90a8" stroke="#000" stroke-width="1.5"/>') },
    { id: 'polygon', name: 'Polygon', key: 'P', hint: 'Click each corner. Click the first point, double-click or press Enter to finish; Backspace removes a point; Esc cancels.', icon: svg('<path d="M10 2 L18 8 L15 18 L5 18 L2 8 Z" fill="#8a90a8" stroke="#000" stroke-width="1.5"/>') },
    { id: 'lasso', name: 'Freehand shape', key: 'A', hint: 'Drag around a shape; it closes and fills when you let go.', icon: svg('<path d="M4 12 Q2 4 10 3 Q18 3 17 9 Q16 15 9 14 Q5 14 6 18" fill="#8a90a8" stroke="#000" stroke-width="1.5"/>') },
    { id: 'fill', name: 'Fill', key: 'F', hint: 'Fill the connected area of matching colour with the current style.', icon: svg('<path d="M4 9 L10 3 L16 9 L10 15 Z" fill="#fff" stroke="#000"/><path d="M4 9 L16 9 L10 15 Z" fill="#1f4fd1"/><path d="M16 10 Q18 14 17 16 Q15 16 16 10" fill="#1f4fd1" stroke="#000"/>') },
    { id: 'gradient', name: 'Gradient', key: 'G', hint: 'Drag across the canvas to fill the layer (or the area under your first point) with a gradient running from start to end.', icon: svg('<rect x="2" y="3" width="16" height="14" fill="#fff" stroke="#000"/><path d="M3 4h2v2h-2zM7 4h2v2h-2zM5 6h2v2h-2zM3 8h4v2h-4zM8 8h2v2h-2zM3 10h8v2h-8zM12 10h2v2h-2zM3 12h15v4h-15z" fill="#1c1f3a"/>') },
    { id: 'picker', name: 'Colour picker', key: 'I', hint: 'Click to pick a colour into the selected ramp colour.', icon: svg('<path d="M13 3 L17 7 L15 9 L11 5 Z" fill="#000"/><path d="M11 5 L15 9 L7 17 L3 17 L3 13 Z" fill="#cfe6ee" stroke="#000"/>') },
    { id: 'move', name: 'Move layer', key: 'M', hint: 'Drag to move everything on the current layer.', icon: svg('<path d="M10 1 L13 5 H11 V9 H15 V7 L19 10 L15 13 V11 H11 V15 H13 L10 19 L7 15 H9 V11 H5 V13 L1 10 L5 7 V9 H9 V5 H7 Z" fill="#000"/>') },
    { id: 'hand', name: 'Hand', key: 'H', hint: 'Drag to look around. You can also hold Space, or use two fingers.', icon: svg('<path d="M6 10 V4 Q6 3 7 3 Q8 3 8 4 V9 V3 Q8 2 9 2 Q10 2 10 3 V9 V4 Q10 3 11 3 Q12 3 12 4 V10 V6 Q12 5 13 5 Q14 5 14 6 V12 Q14 18 9 18 Q6 18 4 14 L2 10 Q2 9 3 9 Q4 9 6 12 Z" fill="#fff" stroke="#000"/>') },
    { id: 'zoom', name: 'Zoom', key: 'Z', hint: 'Click to zoom in, Alt-click (or right-click) to zoom out. The mouse wheel zooms too.', icon: svg('<circle cx="8" cy="8" r="5.5" fill="#fff" stroke="#000" stroke-width="2"/><path d="M12 12 L18 18" stroke="#000" stroke-width="3"/><path d="M5 8h6M8 5v6" stroke="#000"/>') }
  ];
  var TOOL = {}; TOOLS.forEach(function (t) { TOOL[t.id] = t; });

  /* ---------------- palettes ---------------- */
  var PALETTES = {
    kartenspiel: { name: 'Kartenspiel', c: ['#000000', '#ffffff', '#c0c0c0', '#808080', '#000080', '#008080', '#ffdad5', '#fff6c2', '#dcf2d4', '#ececec', '#d9e4ff', '#f6dcf2',
      '#f19a8e', '#f0d45c', '#a9db97', '#c4c4c4', '#a1bbf0', '#dea0d4', '#9b1c10', '#8a6500', '#1e6b1e', '#2e2e2e', '#1b3f91', '#86206f',
      '#d42020', '#1f4fd1', '#138a36', '#d39a00', '#8a2be2', '#fff2a8', '#f2c230', '#b07a10', '#3a1e00', '#462d0a', '#c9c9c9', '#b9b9b9', '#262a2a', '#1c1f1f', '#efe6cc', '#cdbb8e'] },
    win16: { name: 'Windows 16', c: ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0', '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'] },
    greys: { name: 'Greys', c: ['#000000', '#141414', '#262626', '#3a3a3a', '#4f4f4f', '#666666', '#7d7d7d', '#959595', '#adadad', '#c6c6c6', '#dedede', '#f0f0f0', '#ffffff', '#1c1f1f', '#262a2a', '#2f3434', '#b9b9b9', '#c9c9c9', '#d6d6d6', '#e4e4e4'] },
    night: { name: 'Night', c: ['#0b0d18', '#141829', '#1c2238', '#262d49', '#333c5c', '#434d70', '#566286', '#6b789c', '#8590b2', '#a3acc8', '#c5cbe0', '#e8ecff', '#fff7d6', '#ffe9a8', '#1a1c26', '#2a2d3a', '#3a3f52', '#4a5068', '#8a90a8', '#ffffff'] },
    // One palette per Kartenspiel suit: muted, ancient and brooding, dark to light, ending near the suit's card colour.
    // Card mode shows the one for the card being painted.
    Sceptre: { name: 'Sceptre: old gold and umber', suit: 1, c: ['#1f1a12', '#3a2f1c', '#54432a', '#6e5a36', '#8a7444', '#a68f58', '#bfa86f', '#d4c08c', '#e6d6a8', '#f2e8c6', '#fff6c2', '#f0d45c',
      '#4a3b26', '#5c4a3a', '#7d6a4a', '#8c6f3e', '#9e8a62', '#b39a5e', '#c9b48a', '#d9c79e'] },
    Goblet: { name: 'Goblet: wine and dusk rose', suit: 1, c: ['#1d1219', '#2a1e2e', '#33202c', '#4a2c3d', '#613a4f', '#784a61', '#8f5d74', '#a57487', '#b98d9c', '#cca7b2', '#ddc1c8', '#f6dcf2',
      '#dea0d4', '#3d2a3a', '#5e4458', '#7f6377', '#a08498', '#6b3a46', '#9a6a70', '#c8a0a8'] },
    Sword: { name: 'Sword: rust, iron and ember', suit: 1, c: ['#1a1414', '#2e2020', '#45292a', '#5e3331', '#763f3a', '#8e5046', '#a56556', '#b98070', '#cc9d8e', '#ddbcb1', '#ecd8d1', '#ffdad5',
      '#f19a8e', '#2a2a2e', '#4a4a50', '#6e6e74', '#94918e', '#7a4a2a', '#a0683c', '#c48a5a'] },
    Bone: { name: 'Bone: ash, chalk and lichen', suit: 1, c: ['#141414', '#232322', '#343432', '#474643', '#5b5a56', '#706e69', '#86847e', '#9c9a93', '#b3b0a8', '#c9c6bd', '#dedbd2', '#ececec',
      '#c4c4c4', '#2b2d2a', '#4a4f45', '#6d7365', '#3a3530', '#5e554a', '#887d6e', '#b0a592'] },
    Leaf: { name: 'Leaf: moss, bark and mist', suit: 1, c: ['#121812', '#1e2a1c', '#2b3c27', '#384e32', '#46603d', '#567149', '#688257', '#7d9468', '#94a77e', '#adbb97', '#c7d0b3', '#dcf2d4',
      '#a9db97', '#2a2318', '#4a3d2a', '#6e5c40', '#8f7c5a', '#3e4a3a', '#5f6e5a', '#8a9a86'] },
    Tome: { name: 'Tome: ink, slate and vellum', suit: 1, c: ['#10131c', '#1b2030', '#262e45', '#323c59', '#3f4b6c', '#4e5b7e', '#606d8f', '#75819f', '#8c97b1', '#a6aec4', '#c1c7d6', '#d9e4ff',
      '#a1bbf0', '#2a2622', '#4a4238', '#706452', '#9a8c72', '#c4b896', '#e6dcc0', '#3a4a52'] },
    earth: { name: 'Earth & fire', c: ['#1b120a', '#3a2412', '#5a3a1c', '#7a5428', '#9c7240', '#c09a62', '#dcc49a', '#f2e6c8', '#1e2a14', '#2f4524', '#4d6b3a', '#6e8f4f', '#9cb878', '#cddcb0', '#3a0a0a', '#7a1414', '#b01818', '#e04020', '#f08a24', '#ffe08a'] }
  };
  function paletteColours() { return app.palette === 'custom' ? app.custom : (PALETTES[app.palette] || PALETTES.kartenspiel).c; }

  /* ---------------- the window ---------------- */
  var MENUS = [
    { id: 'file', name: 'File', items: [['new', 'New…', 'Ctrl+Alt+N'], ['open', 'Open…', 'Ctrl+O'], ['save', 'Save project', 'Ctrl+S'], '-', ['import', 'Import image as layer…'], ['export', 'Export PNG…', 'Ctrl+E'], ['copyPicture', 'Copy picture'], '-', ['example', 'Open the example scene'], '-', ['cards', 'Paint the Kartenspiel cards…']] },
    { id: 'edit', name: 'Edit', items: [['undo', 'Undo', 'Ctrl+Z'], ['redo', 'Redo', 'Ctrl+Y'], '-', ['cut', 'Cut', 'Ctrl+X'], ['copy', 'Copy', 'Ctrl+C'], ['paste', 'Paste as new layer', 'Ctrl+V'], '-', ['selectAll', 'Select all', 'Ctrl+A'], ['deselect', 'Deselect', 'Ctrl+D'], '-', ['fillLayer', 'Fill with style', 'Shift+F'], ['clearLayer', 'Clear', 'Delete']] },
    { id: 'image', name: 'Image', items: [['resize', 'Canvas size…'], ['flipH', 'Flip layer left–right'], ['flipV', 'Flip layer upside down'], '-', ['ditherLayer', 'Dither layer by brightness'], ['mirror', 'Mirror drawing (symmetry)', 'Shift+M']] },
    { id: 'layer', name: 'Layer', items: [['addLayer', 'New layer', 'Ctrl+Shift+N'], ['dupLayer', 'Duplicate layer'], ['delLayer', 'Delete layer'], ['mergeDown', 'Merge down', 'Ctrl+M'], '-', ['layerUp', 'Move layer up'], ['layerDown', 'Move layer down']] },
    { id: 'view', name: 'View', items: [['zoomIn', 'Zoom in', '+'], ['zoomOut', 'Zoom out', '−'], ['fit', 'Fit to window', '0'], ['actual', 'Actual pixels', '1'], '-', ['grid', 'Pixel grid', 'Ctrl+G'], ['bg', 'Background behind transparency']] },
    { id: 'help', name: 'Help', items: [['guide', 'Quick guide', 'F1'], ['keys', 'Keyboard shortcuts'], ['about', 'About Dithry']] }
  ];
  function shellHTML() {
    var h = '<div class="win raised"><div class="titlebar"><svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="1" width="14" height="14" fill="#fff" stroke="#000"/><path d="M2 2h12v3H2z" fill="#1c1f3a"/><path d="M2 5h2v1H2zM6 5h2v1H6zM10 5h2v1h-2zM4 6h2v1H4zM8 6h2v1H8zM12 6h2v1h-2zM2 7h2v1H2zM6 7h2v1H6zM10 7h2v1h-2zM4 9h2v1H4zM10 9h2v1h-2z" fill="#1c1f3a"/></svg><span id="title">Dithry</span><span class="grow"></span><span class="tip small" style="font-weight:400">Pixel Art and Dithered Gradient Tool</span></div>';
    h += '<div class="mtop"><button class="btn mb" data-m="menu" aria-label="Menu">☰</button><span class="mname" id="mname"></span><span class="grow"></span>' +
      '<button class="btn mb" data-m="undo" aria-label="Undo" title="Undo (or tap with two fingers)">↶</button><button class="btn mb" data-m="redo" aria-label="Redo" title="Redo (or tap with three fingers)">↷</button><button class="btn mb" data-m="fit" aria-label="Fit to the screen">⤢</button></div>';
    h += '<div class="menubar">' + MENUS.map(function (m) { return '<div class="mi" data-menu="' + m.id + '"><button>' + m.name + '</button><div class="menu raised">' +
      m.items.map(function (it) { return it === '-' ? '<hr>' : '<button data-cmd="' + it[0] + '"><span>' + esc(it[1]) + '</span><span class="k">' + esc(it[2] || '') + '</span></button>'; }).join('') + '</div></div>'; }).join('') + '</div>';
    h += '<div class="main"><div class="toolbox raised"><div class="tools">' + TOOLS.map(function (t) { return '<button class="btn tool" data-tool="' + t.id + '" title="' + esc(t.name + ' (' + t.key + ')') + '" aria-label="' + esc(t.name) + '">' + t.icon + '</button>'; }).join('') + '</div><div class="opts" id="opts"></div></div>';
    h += '<div class="work sunken" id="work"><canvas id="art"></canvas><canvas id="over"></canvas>' +
      '<div class="polybar raised" id="polybar"><button class="btn" data-poly="done">✓ Finish</button><button class="btn" data-poly="back">⌫ Last point</button><button class="btn" data-poly="cancel">✕ Cancel</button></div></div>';
    h += '<div class="side" id="side"></div></div>';
    h += '<div class="mtabs" id="mtabs"></div>';
    h += '<div class="statusbar"><div class="sunken" id="sPos" style="width:96px">–</div><div class="sunken" id="sSize" style="width:96px"></div><div class="sunken" id="sZoom" style="width:70px"></div><div class="sunken grow" id="sHint"></div></div></div>';
    return h;
  }

  /* ---------------- tool options (under the toolbox) ---------------- */
  function optsHTML() {
    var t = app.tool, h = '<div class="lbl">' + esc(TOOL[t].name) + '</div>';
    if (/^(brush|eraser|line|rect|ellipse|polygon|lasso)$/.test(t)) {
      var outline = /^(rect|ellipse|polygon|lasso)$/.test(t) && app.shape === 'outline';
      if (/^(brush|eraser|line)$/.test(t) || outline) h += '<label class="sizer">Size <input type="range" min="1" max="32" value="' + Math.min(32, app.size) + '" data-opt="size" aria-label="Size"><b data-optv="size">' + app.size + '</b></label><label><input type="checkbox" data-opt="round"' + (app.round ? ' checked' : '') + '> Round</label>';
      if (/^(rect|ellipse|polygon|lasso)$/.test(t)) h += '<label><select data-opt="shape"><option value="fill"' + (app.shape === 'fill' ? ' selected' : '') + '>Filled</option><option value="outline"' + (app.shape === 'outline' ? ' selected' : '') + '>Outline</option></select></label>';
    }
    if (t === 'fill') h += '<label>Match ± <input type="number" min="0" max="255" value="' + app.tol + '" data-opt="tol" style="width:46px"></label><label><input type="checkbox" data-opt="sampleAll"' + (app.sampleAll ? ' checked' : '') + '> All layers</label>';
    if (t === 'gradient') h += '<label><select data-opt="gradTarget"><option value="layer"' + (app.gradTarget === 'layer' ? ' selected' : '') + '>Whole layer</option><option value="region"' + (app.gradTarget === 'region' ? ' selected' : '') + '>Area under start</option></select></label><div class="small muted">Uses the Gradient panel’s type, softness and ripples.</div>';
    if (/^(line|rect|ellipse|polygon|gradient)$/.test(t)) h += '<label title="The same as holding Shift"><input type="checkbox" data-opt="snap"' + (app.snap ? ' checked' : '') + '> ' + (/^(rect|ellipse)$/.test(t) ? 'Square / circle' : 'Snap to 45°') + '</label>';
    if (/^(pencil|brush|eraser|line|rect|ellipse|polygon|lasso)$/.test(t)) h += '<label><input type="checkbox" data-opt="mirror"' + (app.mirror ? ' checked' : '') + '> Mirror</label>';
    return h;
  }

  /* ---------------- panels (the right-hand side) ---------------- */
  function slider(k, label, min, max, step, fmt) {
    var v = getPath(app.style, k);
    return '<div class="slider"><span>' + esc(label) + '</span><input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" aria-label="' + esc(label) + '"><span class="v" data-v="' + k + '">' + fmtV(v, fmt) + '</span></div>';
  }
  function fmtV(v, fmt) { return fmt === '%' ? Math.round(v * 100) + '%' : fmt === '°' ? Math.round(v) + '°' : fmt === 'x' ? '×' + v : (Math.round(v * 100) / 100).toString(); }
  var FMT = {};
  function select(k, label, opts) {
    var v = getPath(app.style, k);
    return '<div class="ctl"><span>' + esc(label) + '</span><select data-k="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function check(k, label) { return '<label class="row"><input type="checkbox" data-k="' + k + '"' + (getPath(app.style, k) ? ' checked' : '') + '> ' + esc(label) + '</label>'; }
  function panel(id, title, body, extra) { var shut = app.shut[id] && !mobile(); return '<div class="panel raised' + (shut ? ' shut' : '') + '" data-panel="' + id + '"><div class="ph"><span>' + (shut ? '▸' : '▾') + '</span><span class="grow">' + esc(title) + '</span>' + (extra || '') + '</div><div class="pb">' + body + '</div></div>'; }
  function swatchBG(c, a) { var x = D.rgba(c, a); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + (x[3] / 255).toFixed(3) + ')'; }

  // On a phone the panels open one group at a time, in a sheet over the canvas (app.sheet; the tabs at the bottom).
  var SHEETS = { tool: 'Tool', colours: 'Colour', style: 'Style', layers: 'Layers', card: 'Card', menu: 'Menu' };
  function sideHTML() {
    var st = app.style, g = st.grad, h = '', P = {};
    // style: preview, mode, presets
    var pres = '<option value="">Style presets…</option><optgroup label="Kartenspiel">' + D.PRESETS.map(function (p, i) { return '<option value="b' + i + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' +
      (app.userPresets.length ? '<optgroup label="Yours">' + app.userPresets.map(function (p, i) { return '<option value="u' + i + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' : '');
    P.style = panel('style', 'Style', '<canvas id="preview" width="150" height="28" aria-label="Preview of the current style"></canvas>' +
      '<div class="row"><label><input type="radio" name="mode" data-mode="gradient"' + (st.mode !== 'solid' ? ' checked' : '') + '> Dithered gradient</label><label><input type="radio" name="mode" data-mode="solid"' + (st.mode === 'solid' ? ' checked' : '') + '> Solid</label></div>' +
      '<div class="row"><select data-act="preset" style="flex:1">' + pres + '</select><button class="btn" data-act="savePreset" title="Save this style as a preset">Save…</button></div>');
    // colours: the ramp, the selected colour, the palette
    var sel = st.ramp[Math.min(app.rampSel, st.ramp.length - 1)];
    P.colours = panel('colours', 'Colours', '<div class="ramp">' + st.ramp.map(function (r, i) { return '<button class="sw' + (i === app.rampSel ? ' sel' : '') + '" data-ramp="' + i + '" title="Colour ' + (i + 1) + (i === 0 ? ' (gradient start)' : i === st.ramp.length - 1 ? ' (gradient end)' : '') + '"><i style="background:' + swatchBG(r.c, r.a) + '"></i><span class="n">' + (i + 1) + '</span></button>'; }).join('') +
      '<span class="grow" style="flex:1"></span><button class="btn" data-act="rampAdd" title="Add a colour to the ramp (up to 4)"' + (st.ramp.length >= 4 ? ' disabled' : '') + '>+</button><button class="btn" data-act="rampDel" title="Remove the selected colour"' + (st.ramp.length <= 1 ? ' disabled' : '') + '>−</button><button class="btn" data-act="rampRev" title="Reverse the ramp (X)">⇄</button></div>' +
      '<div class="row"><input type="color" data-act="colour" value="' + esc(sel.c) + '" aria-label="Selected colour"><input type="text" data-act="hex" value="' + esc(sel.c) + '" style="width:80px" aria-label="Hex colour"><span class="small muted">' + (st.mode === 'solid' && app.rampSel > 0 ? 'Solid uses colour 1' : '') + '</span></div>' +
      '<div class="slider"><span>Alpha</span><input type="range" data-act="alpha" min="0" max="1" step="0.01" value="' + sel.a + '"><span class="v" id="alphaV">' + Math.round(sel.a * 100) + '%</span></div>' +
      '<div class="row"><select data-act="palette" style="flex:1">' + [false, true].map(function (suit) { var ks = Object.keys(PALETTES).filter(function (k) { return !!PALETTES[k].suit === suit; });
        return '<optgroup label="' + (suit ? 'Kartenspiel suits' : 'Palettes') + '">' + ks.map(function (k) { return '<option value="' + k + '"' + (k === app.palette ? ' selected' : '') + '>' + PALETTES[k].name + '</option>'; }).join('') + (suit ? '' : '<option value="custom"' + (app.palette === 'custom' ? ' selected' : '') + '>My colours</option>') + '</optgroup>'; }).join('') + '</select><button class="btn" data-act="keepColour" title="Add the selected colour to My colours">Keep</button></div>' +
      '<div class="palette"><button data-pal="transparent" title="Transparent"><i></i></button>' + paletteColours().map(function (c) { return '<button data-pal="' + c + '" title="' + c + '"><i style="background:' + c + '"></i></button>'; }).join('') + '</div>' +
      '<div class="small muted">Click a swatch in the ramp, then pick its colour. The gradient runs from colour 1 to the last.</div>');
    // gradient
    P.gradient = panel('gradient', 'Gradient', select('grad.type', 'Type', [['linear', 'Linear'], ['radial', 'Radial'], ['diamond', 'Diamond'], ['conic', 'Around a point'], ['edge', 'Follows the shape’s edge'], ['flat', 'Flat (an even mix)']]) +
      select('grad.anchor', 'Spans', [['shape', 'Each shape'], ['canvas', 'Gradient-tool handles']]) +
      (g.type === 'flat' ? slider('grad.mix', 'Mix', 0, 1, .01, '%') : '') +
      (g.anchor === 'shape' && /^(linear|conic)$/.test(g.type) ? slider('grad.angle', 'Angle', 0, 359, 1, '°') : '') +
      slider('grad.start', 'Start', -.5, 1.5, .01, '%') + slider('grad.end', 'End', -.5, 1.5, .01, '%') + slider('grad.mid', 'Midpoint', .05, .95, .01, '%') +
      slider('grad.contrast', 'Softness', .02, 1, .01, '%') +
      select('grad.repeat', 'Beyond the ends', [['none', 'Stop'], ['repeat', 'Repeat'], ['mirror', 'Bounce back']]) + check('grad.reverse', 'Reverse'));
    P.ripple = panel('ripple', 'Ripples', slider('ripple.amp', 'Amount', 0, .5, .01) + slider('ripple.freq', 'Waves', .5, 16, .5) + slider('ripple.phase', 'Shift', 0, 1, .01) +
      slider('ripple.turb', 'Turbulence', 0, .6, .01) + slider('ripple.turbScale', 'Turb. size', 2, 64, 1) +
      '<div class="small muted">Ripples bend the gradient’s frontier into waves; turbulence roughens it.</div>');
    P.dither = panel('dither', 'Dither', select('dither.pattern', 'Pattern', D.PATTERNS.map(function (p) { return [p.id, p.name]; })) + slider('dither.scale', 'Pattern size', 1, 6, 1, 'x') +
      slider('dither.level', 'Dithering', 0, 1, .01, '%') +
      '<div class="ctl"><span>Seed</span><span class="row"><input type="number" data-k="dither.seed" value="' + (st.dither.seed | 0) + '" style="width:70px"><button class="btn" data-act="dice" title="New random seed">🎲</button></span></div>' +
      slider('opacity', 'Opacity', 0, 1, .01, '%') + check('ditherOpacity', 'Dither the opacity') +
      '<div class="small muted">0% dithering gives hard bands; 100% blends the colours with the pattern. Dithered opacity skips pixels instead of fading them, so the art stays crisp.</div>');
    // layers
    var L = app.doc.layers, a = app.doc.active;
    P.layers = panel('layers', 'Layers', '<div class="layers" id="layerList">' + L.map(function (l, i) { return i; }).reverse().map(function (i) { var l = L[i];
      return '<div class="layer' + (i === a ? ' act' : '') + '" data-layer="' + i + '"><input type="checkbox" data-vis="' + i + '"' + (l.visible ? ' checked' : '') + ' title="Show or hide" aria-label="Visible"><canvas data-thumb="' + i + '" width="34" height="24"></canvas><span class="nm" title="Double-click to rename">' + esc(l.name) + '</span><button class="ib" data-lock="' + i + '" title="' + (l.locked ? 'Unlock' : 'Lock') + '">' + (l.locked ? '🔒' : '<span style="opacity:.35">🔓</span>') + '</button></div>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn" data-cmd="addLayer" title="New layer">New</button><button class="btn" data-cmd="dupLayer" title="Duplicate">Copy</button><button class="btn" data-cmd="delLayer" title="Delete"' + (L.length < 2 ? ' disabled' : '') + '>Delete</button><button class="btn" data-cmd="layerUp" title="Move up">▲</button><button class="btn" data-cmd="layerDown" title="Move down">▼</button><button class="btn" data-cmd="mergeDown" title="Merge down"' + (a === 0 ? ' disabled' : '') + '>Merge ↓</button></div>' +
      '<div class="slider"><span>Layer opacity</span><input type="range" data-act="layerOpacity" min="0" max="1" step="0.01" value="' + L[a].opacity + '"><span class="v" id="lopV">' + Math.round(L[a].opacity * 100) + '%</span></div>');
    if (!mobile()) return P.style + P.colours + P.gradient + P.ripple + P.dither + P.layers;
    if (!app.sheet) return '';
    var body = { tool: function () { return '<div class="pb"><div class="small muted">' + esc(TOOL[app.tool].hint) + '</div><div class="opts">' + optsHTML() + '</div></div>'; },
      colours: function () { return P.colours + P.style; }, style: function () { return P.gradient + P.ripple + P.dither; }, layers: function () { return P.layers; },
      card: function () { return hooks.cardSheet ? hooks.cardSheet() : ''; }, menu: menuSheet }[app.sheet];
    return '<div class="sheethead"><b>' + esc(app.sheet === 'tool' ? TOOL[app.tool].name : SHEETS[app.sheet]) + '</b><span class="grow"></span><button class="btn" data-m="close" aria-label="Close">Done</button></div>' + (body ? body() : '');
  }
  // The menus as one list, for the phone's ☰ button.
  function menuSheet() {
    return '<div class="pb menusheet">' + MENUS.map(function (m) { return '<div class="msec"><div class="small muted">' + m.name + '</div>' +
      m.items.filter(function (it) { return it !== '-' && !/^(grid|bg|zoomIn|zoomOut|actual|keys)$/.test(it[0]); }).map(function (it) { return '<button class="btn" data-cmd="' + it[0] + '">' + esc(it[1]) + '</button>'; }).join('') + '</div>'; }).join('') + '</div>';
  }
  var PHONE = window.matchMedia ? matchMedia('(max-width: 820px), (max-height: 520px)') : { matches: false };   // phones, either way up (as in dithry.css)
  function mobile() { return PHONE.matches; }
  var TAB_ICON = {
    style: svg('<rect x="2.5" y="3.5" width="15" height="13" fill="#fff" stroke="#000"/><path d="M3 4h2v2H3zM7 4h2v2H7zM11 4h2v2h-2zM5 6h2v2H5zM9 6h2v2H9zM3 8h4v2H3zM9 8h2v2H9zM13 8h2v2h-2zM3 10h12v2H3zM3 12h14v4H3z" fill="#1c1f3a"/>'),
    layers: svg('<path d="M10 3 L18 7 L10 11 L2 7 Z" fill="#8a90a8" stroke="#000"/><path d="M2 10 L10 14 L18 10" fill="none" stroke="#000"/><path d="M2 13 L10 17 L18 13" fill="none" stroke="#000"/>'),
    card: svg('<rect x="4.5" y="2.5" width="11" height="15" fill="#f6dcf2" stroke="#000"/><path d="M6 6h8M6 8h5" stroke="#000"/><path d="M6 12h8v4H6z" fill="#c03aa8"/>')
  };
  // The phone's tab bar: the tool's options, colours, style, layers, and the card when painting cards.
  function renderTabs() {
    var t = $('#mtabs'); if (!t) return;
    var tabs = ['tool', 'colours', 'style', 'layers'].concat(app.mode === 'cards' ? ['card'] : []), r = app.style.ramp;
    t.innerHTML = tabs.map(function (k) {
      var icon = k === 'tool' ? TOOL[app.tool].icon : k === 'colours' ? '<span class="tabsw">' + r.map(function (x) { return '<i style="background:' + swatchBG(x.c, x.a) + '"></i>'; }).join('') + '</span>' : TAB_ICON[k] || '';
      return '<button class="btn' + (app.sheet === k ? ' on' : '') + '" data-sheet="' + k + '">' + icon + '<span>' + SHEETS[k] + '</span></button>'; }).join('');
  }
  function getPath(o, k) { return k.split('.').reduce(function (x, p) { return x == null ? x : x[p]; }, o); }
  function setPath(o, k, v) { var ps = k.split('.'), last = ps.pop(); ps.reduce(function (x, p) { return x[p]; }, o)[last] = v; }

  function renderSide() { var s = $('#side'), top = s.scrollTop; s.innerHTML = sideHTML(); s.classList.toggle('open', mobile() && !!app.sheet); s.scrollTop = top; drawPreview(); drawThumbs(); renderTabs(); }
  function openSheet(k) { app.sheet = app.sheet === k ? null : k; var s = $('#side'); renderSide(); s.scrollTop = 0; keepInView(); }
  // A sheet covers the lower part of the canvas: slide the picture up into the part you can still see, and back down
  // when the sheet closes (unless you've moved it in the meantime).
  var sheetPan = null;
  function keepInView() {
    if (!mobile()) return;
    if (!app.sheet) { if (sheetPan && app.panX === sheetPan.mx && app.panY === sheetPan.my) { app.panX = sheetPan.x; app.panY = sheetPan.y; applyView(); } sheetPan = null; return; }
    var wr = work.getBoundingClientRect(), sr = $('#side').getBoundingClientRect(), side = sr.left > wr.left + 10;   // a phone on its side: the sheet is on the right
    if (!sheetPan) sheetPan = { x: app.panX, y: app.panY };
    if (side) { var room = wr.width - Math.max(0, wr.right - sr.left), w = W() * app.zoom, wantX = w <= room - 16 ? (room - w) / 2 : 8; if (app.panX > wantX) app.panX = wantX; }
    else { var roomY = wr.height - Math.max(0, wr.bottom - sr.top), h = H() * app.zoom, want = h <= roomY - 16 ? (roomY - h) / 2 : 8; if (app.panY > want) app.panY = want; }
    applyView(); sheetPan.mx = app.panX; sheetPan.my = app.panY;
  }
  function renderOpts() { $('#opts').innerHTML = optsHTML(); if (mobile() && app.sheet === 'tool') renderSide(); else renderTabs(); document.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === app.tool); }); status(); }
  function renderTitle() { var t = (app.mode === 'cards' ? 'Card: ' : '') + app.name + (app.dirty ? ' *' : ''); $('#title').textContent = 'Dithry — ' + t; $('#mname').textContent = t; document.title = t + ' · Dithry'; }

  // The style preview: the current style across a strip, as it would paint a shape.
  function drawPreview() {
    var c = $('#preview'); if (!c) return;
    var w = c.width, h = c.height, x = c.getContext('2d'), img = x.createImageData(w, h), m = new Uint8Array(w * h).fill(1);
    var st = D.clone(app.style); if (st.grad.anchor === 'canvas') st.grad.anchor = 'shape';
    if (st.grad.type === 'linear' && st.grad.angle === 90) st.grad.angle = 0;   // show a top-to-bottom gradient sideways, so the strip shows all of it
    var b = { x0: 0, y0: 0, x1: w, y1: h }; st.opacity = 1;
    D.paint(img.data, img.data, w, h, m, b, st, { field: D.makeField(st, b, st.grad.type === 'edge' ? D.edgeDistance(m, w, b) : null) });
    x.putImageData(img, 0, 0);
  }
  var thumbTimer = null;
  function drawThumbs() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(function () {
      document.querySelectorAll('[data-thumb]').forEach(function (c) {
        var l = app.doc.layers[+c.getAttribute('data-thumb')]; if (!l) return;
        var src = toCanvas(l.data, W(), H()), g = c.getContext('2d'), s = Math.min(c.width / W(), c.height / H());
        g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
        g.drawImage(src, (c.width - W() * s) / 2, (c.height - H() * s) / 2, W() * s, H() * s);
      });
    }, 120);
  }
  function toCanvas(data, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'), img = g.createImageData(w, h); img.data.set(data); g.putImageData(img, 0, 0); return c; }

  /* ---------------- the canvas view ---------------- */
  var art, actx, comp, over, octx, work;
  function setupCanvas() {
    art.width = W(); art.height = H(); actx = art.getContext('2d'); comp = actx.createImageData(W(), H());
    art.className = app.bg === 'checker' ? 'checker' : 'bg-' + app.bg;
    redraw(); fit(); status();
  }
  // Composites the layers within box (or everything) and puts it on screen.
  function redraw(b) {
    b = b || { x0: 0, y0: 0, x1: W(), y1: H() };
    var x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(W(), b.x1), y1 = Math.min(H(), b.y1); if (x1 <= x0 || y1 <= y0) return;
    var bb = { x0: x0, y0: y0, x1: x1, y1: y1 };
    D.composite(comp.data, app.doc.layers, W(), H(), bb);
    actx.putImageData(comp, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  var ZOOMS = [.125, .25, .5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64];
  function applyView() {
    art.style.width = W() * app.zoom + 'px'; art.style.height = H() * app.zoom + 'px';
    art.style.transform = 'translate(' + Math.round(app.panX) + 'px,' + Math.round(app.panY) + 'px)';
    $('#sZoom').textContent = Math.round(app.zoom * 100) + '%'; drawOverlay();
    hooks.view.forEach(function (f) { f(); });
  }
  function fit() {
    var r = work.getBoundingClientRect(), pad = mobile() ? 12 : 32, z = Math.min((r.width - pad) / W(), (r.height - pad) / H()), dpr = window.devicePixelRatio || 1;
    var best = ZOOMS[0]; ZOOMS.forEach(function (q) { if (q <= z) best = q; });
    if (dpr > 1 && z >= 1) best = Math.max(best, Math.floor(z * dpr) / dpr);   // on sharp screens, any zoom that's a whole number of device pixels keeps the pixels even
    app.zoom = best;
    app.panX = (r.width - W() * app.zoom) / 2; app.panY = (r.height - H() * app.zoom) / 2; applyView();
  }
  // Zoom to level z, keeping the point (sx, sy) of the work area (default: its centre) still.
  function zoomTo(z, sx, sy) {
    var r = work.getBoundingClientRect(); if (sx == null) { sx = r.width / 2; sy = r.height / 2; }
    var ax = (sx - app.panX) / app.zoom, ay = (sy - app.panY) / app.zoom;
    app.zoom = z; app.panX = sx - ax * z; app.panY = sy - ay * z; applyView();
  }
  function zoomStep(dir, sx, sy) { var i = ZOOMS.indexOf(app.zoom); if (i < 0) i = ZOOMS.findIndex(function (q) { return q > app.zoom; }) - (dir > 0 ? 1 : 0); zoomTo(ZOOMS[clamp(i + dir, 0, ZOOMS.length - 1)], sx, sy); }
  // Screen point → canvas pixel coordinates (fractional).
  function toArt(e) { var r = work.getBoundingClientRect(); return [(e.clientX - r.left - app.panX) / app.zoom, (e.clientY - r.top - app.panY) / app.zoom]; }
  function toScreen(x, y) { return [app.panX + x * app.zoom, app.panY + y * app.zoom]; }

  // The overlay: pixel grid, brush outline, shape guides, gradient handles, polygon points, mirror axis.
  var hooks = { view: [], overlay: [], change: [] };   // used by card mode (cards.js)
  var overFrame = null;
  function drawOverlay() { var pb = $('#polybar'); if (pb) pb.style.display = op && op.kind === 'polygon' ? 'flex' : 'none'; if (!overFrame) overFrame = requestAnimationFrame(paintOverlay); }
  function paintOverlay() {
    overFrame = null;
    var r = work.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (over.width !== Math.round(r.width * dpr) || over.height !== Math.round(r.height * dpr)) { over.width = Math.round(r.width * dpr); over.height = Math.round(r.height * dpr); }
    var g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    var z = app.zoom, ox = app.panX, oy = app.panY;
    if (app.grid && z >= 8) {   // the pixel grid, only where the canvas is on screen
      g.beginPath(); g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 1;
      var xa = Math.max(0, Math.floor(-ox / z)), xb = Math.min(W(), Math.ceil((r.width - ox) / z)), ya = Math.max(0, Math.floor(-oy / z)), yb = Math.min(H(), Math.ceil((r.height - oy) / z));
      for (var x = xa; x <= xb; x++) { var sx = Math.round(ox + x * z) + .5; g.moveTo(sx, oy + ya * z); g.lineTo(sx, oy + yb * z); }
      for (var y = ya; y <= yb; y++) { var sy = Math.round(oy + y * z) + .5; g.moveTo(ox + xa * z, sy); g.lineTo(ox + xb * z, sy); }
      g.stroke();
    }
    hooks.overlay.forEach(function (f) { f(g, toScreen, z); });
    if (app.sel) {   // the selection: black and white dashes
      var s0 = toScreen(app.sel.x0, app.sel.y0), s1 = toScreen(app.sel.x1, app.sel.y1), rx = Math.round(s0[0]) + .5, ry = Math.round(s0[1]) + .5, rw = Math.round(s1[0] - s0[0]) - 1, rh = Math.round(s1[1] - s0[1]) - 1;
      g.lineWidth = 1; g.setLineDash([]); g.strokeStyle = '#000'; g.strokeRect(rx, ry, rw, rh); g.setLineDash([4, 4]); g.strokeStyle = '#fff'; g.strokeRect(rx, ry, rw, rh); g.setLineDash([]);
    }
    if (app.mirror) { g.setLineDash([4, 4]); g.strokeStyle = '#ff00c8'; g.beginPath(); g.moveTo(ox + W() * z / 2 + .5, oy); g.lineTo(ox + W() * z / 2 + .5, oy + H() * z); g.stroke(); g.setLineDash([]); }
    // gradient handles: while dragging the gradient tool, or whenever gradients span the handles
    var gr = app.style.grad, hp = op && op.kind === 'gradient' ? [op.start, op.end] : (app.tool === 'gradient' || gr.anchor === 'canvas') ? [[gr.x0, gr.y0], [gr.x1, gr.y1]] : null;
    if (hp) {
      var a = toScreen(hp[0][0], hp[0][1]), b = toScreen(hp[1][0], hp[1][1]);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.lineWidth = 1; g.strokeStyle = '#fff'; g.setLineDash(op ? [] : [5, 4]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
      [a, b].forEach(function (p, i) { g.fillStyle = i ? '#fff' : '#000'; g.strokeStyle = i ? '#000' : '#fff'; g.fillRect(p[0] - 4, p[1] - 4, 8, 8); g.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9); });
    }
    if (op && (op.kind === 'polygon' || op.kind === 'lasso') && op.pts.length) {   // polygon corners
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath();
      op.pts.forEach(function (p, i) { var s = toScreen(p[0] + .5, p[1] + .5); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
      if (op.kind === 'polygon' && app.hover) { var hv = toScreen(app.hover[0] + .5, app.hover[1] + .5); g.lineTo(hv[0], hv[1]); }
      g.stroke();
      if (op.kind === 'polygon') op.pts.forEach(function (p, i) { var s = toScreen(p[0] + .5, p[1] + .5); g.fillStyle = i ? '#fff' : '#ff00c8'; g.fillRect(s[0] - 3, s[1] - 3, 6, 6); g.strokeStyle = '#000'; g.strokeRect(s[0] - 3.5, s[1] - 3.5, 7, 7); });
    }
    if (app.hover && /^(pencil|brush|eraser|line|picker|fill)$/.test(app.tool) || (app.hover && /^(rect|ellipse|polygon|lasso)$/.test(app.tool) && app.shape === 'outline')) {   // the brush footprint
      var sz = /^(pencil|picker|fill)$/.test(app.tool) ? 1 : app.size, r0 = Math.floor((sz - 1) / 2), p0 = toScreen(app.hover[0] - r0, app.hover[1] - r0);
      g.strokeStyle = '#000'; g.strokeRect(Math.round(p0[0]) - .5, Math.round(p0[1]) - .5, sz * z + 1, sz * z + 1);
      g.strokeStyle = '#fff'; g.strokeRect(Math.round(p0[0]) + .5, Math.round(p0[1]) + .5, sz * z - 1, sz * z - 1);
    }
  }
  function status(hint) {
    $('#sPos').textContent = app.hover ? app.hover[0] + ', ' + app.hover[1] : '–';
    $('#sSize').textContent = W() + ' × ' + H();
    $('#sHint').textContent = hint || TOOL[app.tool].hint;
  }

  /* ---------------- drawing operations ---------------- */
  // An operation edits one layer: it keeps the layer as it was (before), a mask of the pixels it touches, and the box
  // around them. show() repaints the layer from `before` plus the mask, so a shape can be previewed while you drag.
  var op = null;
  function begin(kind) {
    var L = layer();
    if (L.locked) { toast('“' + L.name + '” is locked. Unlock it in the Layers panel to draw on it.'); return false; }
    if (!L.visible) toast('“' + L.name + '” is hidden, so you won’t see what you draw.');
    op = { kind: kind, li: app.doc.active, before: new Uint8ClampedArray(L.data), mask: new Uint8Array(W() * H()), box: null, shown: null, pts: [] };
    return true;
  }
  function full() { return { x0: 0, y0: 0, x1: W(), y1: H() }; }
  // Repaints op's layer. fieldBox: what the gradient spans (default: the shape's box); style: an override.
  function show(fieldBox, style, erase) {
    var L = layer(op.li), region = D.union(op.shown, op.box); if (!region) return;
    restore(L.data, op.before, region);
    if (op.box && app.allow) { var bx = op.box; for (var y = bx.y0; y < bx.y1; y++) for (var x = bx.x0; x < bx.x1; x++) { var k = y * W() + x; if (!app.allow[k]) op.mask[k] = 0; } }   // card mode: only the cards are paintable
    if (op.box) {
      var st = style || app.style, fb = fieldBox || op.box;
      var field = D.makeField(st, fb, st.grad.type === 'edge' && !fieldBox ? D.edgeDistance(op.mask, W(), op.box) : null);
      var pb = app.sel ? D.intersect(op.box, app.sel) : op.box;   // with a selection, only pixels inside it change
      if (pb) D.paint(L.data, op.before, W(), H(), op.mask, pb, st, { field: field, erase: erase, cache: patternCache });
    }
    op.shown = op.box; redraw(region);
  }
  var patternCache = {};
  function restore(dst, src, b) { for (var y = b.y0; y < b.y1; y++) { var i = (y * W() + b.x0) * 4, j = (y * W() + b.x1) * 4; dst.set(src.subarray(i, j), i); } }
  function commit() {
    if (!op) return;
    var L = layer(op.li), changed = false;
    for (var i = 0; i < L.data.length; i++) if (L.data[i] !== op.before[i]) { changed = true; break; }
    if (changed) pushUndo({ t: 'px', li: op.li, before: op.before, after: new Uint8ClampedArray(L.data) });
    op = null; drawOverlay(); if (changed) { touched(); drawThumbs(); }
  }
  function cancel() { if (!op) return; var L = layer(op.li); L.data.set(op.before); op = null; redraw(); drawOverlay(); }
  function clearMask() { op.mask.fill(0); op.box = null; }
  function mirrored(b) { return app.mirror ? D.mirror(op.mask, W(), H(), b) : b; }
  function snap45(a, b) {   // the end point b, snapped so the line from a is at a multiple of 45°
    var dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + Math.round(Math.cos(ang) * len), a[1] + Math.round(Math.sin(ang) * len)];
  }
  function shapeMask(kind, a, b, shift) {
    clearMask();
    if (shift && (kind === 'rect' || kind === 'ellipse')) { var s = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); b = [a[0] + (b[0] >= a[0] ? s : -s), a[1] + (b[1] >= a[1] ? s : -s)]; }
    if (shift && kind === 'line') b = snap45(a, b);
    var fill = app.shape === 'fill', bx;
    if (kind === 'line') bx = D.line(op.mask, W(), H(), a[0], a[1], b[0], b[1], app.size, app.round);
    else if (kind === 'rect') bx = D.rect(op.mask, W(), H(), a[0], a[1], b[0], b[1], fill, app.size);
    else bx = D.ellipse(op.mask, W(), H(), a[0], a[1], b[0], b[1], fill, app.size);
    op.box = mirrored(bx);
  }
  function polyMask(pts) { clearMask(); op.box = mirrored(D.polygon(op.mask, W(), H(), pts, app.shape === 'fill', app.shape === 'fill' ? 0 : app.size, app.round)); }
  // The style the gradient tool paints with: the panel's style, spanning the dragged handles.
  function handleStyle(a, b) { var st = D.clone(app.style); st.grad.anchor = 'canvas'; st.grad.x0 = a[0]; st.grad.y0 = a[1]; st.grad.x1 = b[0]; st.grad.y1 = b[1]; if (st.mode === 'solid') st.mode = 'gradient'; return st; }
  function regionMask(x, y) {
    var src = app.sampleAll ? comp.data : layer().data;
    if (app.sampleAll) D.composite(comp.data, app.doc.layers, W(), H());
    return D.flood(op.mask, src, W(), H(), x, y, app.tol);
  }

  /* ---------------- pointer input ---------------- */
  var pointers = {}, pinch = null, panning = null, spaceDown = false, lastPencil = null;
  var lastPointerType = 'mouse';
  function onDown(e) {
    lastPointerType = e.pointerType;
    work.setPointerCapture && work.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    closeMenus();
    var ids = Object.keys(pointers);
    if (ids.length === 2) {   // two fingers: stop drawing, pinch and pan instead
      if (op && op.kind !== 'polygon') cancel();
      var p = ids.map(function (i) { return pointers[i]; }), r = work.getBoundingClientRect();
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, z: app.zoom, mx: (p[0].x + p[1].x) / 2 - r.left, my: (p[0].y + p[1].y) / 2 - r.top, px: app.panX, py: app.panY, t0: e.timeStamp, moved: 0, fingers: 2 };
      endLongPress(); return;
    }
    if (ids.length === 3 && pinch) { pinch.fingers = 3; return; }
    if (ids.length > 2) return;
    var a = toArt(e), pi = [Math.floor(a[0]), Math.floor(a[1])], t = app.tool;
    if (e.button === 1 || t === 'hand' || spaceDown) { panning = { x: e.clientX, y: e.clientY, px: app.panX, py: app.panY }; work.classList.add('panning'); e.preventDefault(); return; }
    if (e.button === 2 && t !== 'zoom') return;
    if (t === 'zoom') { var r2 = work.getBoundingClientRect(); zoomStep(e.altKey || e.button === 2 ? -1 : 1, e.clientX - r2.left, e.clientY - r2.top); return; }
    if (t === 'picker') { pick(pi); return; }
    if (t === 'select') { selDrag = { a: pi }; setSel(pi, pi); return; }
    if (t === 'polygon') {
      if (!op) { if (!begin('polygon')) return; op.pts = [pi]; }
      else {
        var f = op.pts[0], near = Math.hypot(pi[0] - f[0], pi[1] - f[1]) * app.zoom < 10;
        if (near && op.pts.length > 2) { finishPolygon(); return; }
        var lp = op.pts[op.pts.length - 1]; if (lp[0] !== pi[0] || lp[1] !== pi[1]) op.pts.push(e.shiftKey || app.snap ? snap45(lp, pi) : pi);
      }
      polyMask(op.pts); show(); drawOverlay(); return;
    }
    if (!begin(t)) return;
    op.start = pi;
    if (e.pointerType === 'touch' && /^(pencil|brush|eraser|line|rect|ellipse|lasso)$/.test(t)) startLongPress(e, pi);
    if (t === 'pencil' || t === 'brush' || t === 'eraser') {
      var sz = t === 'pencil' ? 1 : app.size, rd = t !== 'pencil' && app.round;
      var from = t === 'pencil' && e.shiftKey && lastPencil ? lastPencil : pi;
      op.box = mirrored(D.line(op.mask, W(), H(), from[0], from[1], pi[0], pi[1], sz, rd)); op.last = pi; op.sz = sz; op.rd = rd;
      show(full(), null, t === 'eraser');
    } else if (t === 'line' || t === 'rect' || t === 'ellipse') { shapeMask(t, pi, pi, e.shiftKey || app.snap); show(); }
    else if (t === 'lasso') { op.pts = [pi]; }
    else if (t === 'fill') { op.box = regionMask(pi[0], pi[1]); show(); commit(); }
    else if (t === 'gradient') {
      op.start = a; op.end = a;
      if (app.gradTarget === 'region') op.box = regionMask(pi[0], pi[1]); else { op.mask.fill(1); op.box = full(); }
      drawOverlay();
    } else if (t === 'move') { op.box = full(); }
  }
  // Press and hold a drawing tool on a touch screen to pick the colour under your finger (no keyboard for the picker).
  var hold = null;
  function startLongPress(e, pi) {
    endLongPress();
    hold = { id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(function () {
      if (!hold) return; hold = null; if (op) cancel(); app.rampSel = Math.min(app.rampSel, app.style.ramp.length - 1); pick(pi);
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { }
    }, 550) };
  }
  function endLongPress() { if (hold) { clearTimeout(hold.t); hold = null; } }
  function onMove(e) {
    if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
    if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) endLongPress();
    if (pinch) {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var p = ids.map(function (i) { return pointers[i]; }), r = work.getBoundingClientRect(), mx = (p[0].x + p[1].x) / 2 - r.left, my = (p[0].y + p[1].y) / 2 - r.top;
      var spread = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), z = clamp(pinch.z * spread / pinch.d, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
      pinch.moved = Math.max(pinch.moved, Math.abs(spread - pinch.d) + Math.hypot(mx - pinch.mx, my - pinch.my));
      var ax = (pinch.mx - pinch.px) / pinch.z, ay = (pinch.my - pinch.py) / pinch.z;
      app.zoom = z; app.panX = mx - ax * z; app.panY = my - ay * z; applyView(); return;
    }
    if (panning) { app.panX = panning.px + e.clientX - panning.x; app.panY = panning.py + e.clientY - panning.y; applyView(); return; }
    var a = toArt(e), pi = [Math.floor(a[0]), Math.floor(a[1])];
    var inside = pi[0] >= 0 && pi[1] >= 0 && pi[0] < W() && pi[1] < H();
    app.hover = inside || op ? pi : null; status(); drawOverlay();
    if (selDrag) { setSel(selDrag.a, pi); selDrag.moved = selDrag.moved || pi[0] !== selDrag.a[0] || pi[1] !== selDrag.a[1]; return; }
    if (!op) return;
    var t = op.kind;
    if (t === 'pencil' || t === 'brush' || t === 'eraser') {
      if (pi[0] === op.last[0] && pi[1] === op.last[1]) return;
      op.box = D.union(op.box, mirrored(D.line(op.mask, W(), H(), op.last[0], op.last[1], pi[0], pi[1], op.sz, op.rd))); op.last = pi;
      show(full(), null, t === 'eraser');
    } else if (t === 'line' || t === 'rect' || t === 'ellipse') { shapeMask(t, op.start, pi, e.shiftKey || app.snap); show(); }
    else if (t === 'lasso') { var lp = op.pts[op.pts.length - 1]; if (lp[0] !== pi[0] || lp[1] !== pi[1]) { op.pts.push(pi); polyMask(op.pts); show(); } }
    else if (t === 'polygon') { polyMask(op.pts.concat([e.shiftKey || app.snap ? snap45(op.pts[op.pts.length - 1], pi) : pi])); show(); }
    else if (t === 'gradient') { op.end = e.shiftKey || app.snap ? snapVec(op.start, a) : a; show(full(), handleStyle(op.start, op.end)); }
    else if (t === 'move') { D.shift(layer(op.li).data, op.before, W(), H(), pi[0] - op.start[0], pi[1] - op.start[1]); redraw(); }
  }
  function snapVec(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); return [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len]; }
  function onUp(e) {
    delete pointers[e.pointerId]; endLongPress();
    if (pinch) {
      if (Object.keys(pointers).length) return;
      // a quick tap with two fingers undoes, with three redoes (fingers that barely moved: not a pinch)
      if (e.timeStamp - pinch.t0 < 350 && pinch.moved < 16) { app.zoom = pinch.z; app.panX = pinch.px; app.panY = pinch.py; applyView(); if (pinch.fingers === 3) redo(); else undo(); }
      pinch = null; return;
    }
    if (panning) { panning = null; work.classList.remove('panning'); return; }
    if (selDrag) { if (!selDrag.moved) app.sel = null; selDrag = null; drawOverlay(); status(app.sel ? 'Selected ' + (app.sel.x1 - app.sel.x0) + ' × ' + (app.sel.y1 - app.sel.y0) + ' pixels: drawing stays inside.' : null); return; }
    if (!op || op.kind === 'polygon') return;
    if (op.kind === 'gradient') {
      if (Math.hypot(op.end[0] - op.start[0], op.end[1] - op.start[1]) < .5) { cancel(); toast('Drag across the canvas: the gradient runs from where you press to where you let go.'); return; }
      var g = app.style.grad; g.x0 = +op.start[0].toFixed(2); g.y0 = +op.start[1].toFixed(2); g.x1 = +op.end[0].toFixed(2); g.y1 = +op.end[1].toFixed(2); savePrefs();
    }
    if (op.kind === 'lasso' && op.pts.length < 3) { cancel(); return; }
    if (op.kind === 'pencil') lastPencil = op.last;
    commit();
  }
  var selDrag = null;
  function setSel(a, b) { app.sel = D.box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]) + 1, Math.max(a[1], b[1]) + 1, W(), H()); drawOverlay(); }
  function finishPolygon() {
    if (!op || op.kind !== 'polygon') return;
    if (op.pts.length < (app.shape === 'fill' ? 3 : 2)) { cancel(); return; }
    polyMask(op.pts); show(); commit();
  }
  function pick(pi) {
    if (pi[0] < 0 || pi[1] < 0 || pi[0] >= W() || pi[1] >= H()) return;
    var i = (pi[1] * W() + pi[0]) * 4, c = comp.data, r = app.style.ramp[Math.min(app.rampSel, app.style.ramp.length - 1)];
    r.c = D.hex(c[i], c[i + 1], c[i + 2]); r.a = +(c[i + 3] / 255).toFixed(2); savePrefs(); renderSide();
    toast('Picked ' + r.c + (r.a < 1 ? ' at ' + Math.round(r.a * 100) + '% alpha' : '') + ' into colour ' + (app.rampSel + 1) + '.');
  }

  /* ---------------- history ---------------- */
  // Each step is either a layer's pixels before and after ('px') or a whole-picture snapshot ('doc') for changes to
  // the layer list or canvas size.
  var MAX_UNDO = 60;
  function pushUndo(s) { app.undo.push(s); if (app.undo.length > MAX_UNDO) app.undo.shift(); app.redo = []; }
  function snapshot() { var d = app.doc; return { w: d.w, h: d.h, active: d.active, layers: d.layers.map(function (l) { return { name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, data: new Uint8ClampedArray(l.data) }; }) }; }
  function restoreSnap(s) { app.doc = { w: s.w, h: s.h, active: s.active, layers: s.layers.map(function (l) { return { name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, data: new Uint8ClampedArray(l.data) }; }) }; }
  // Runs fn as one undoable change to the picture's structure.
  function structural(fn) {
    if (op) cancel();
    var before = snapshot(); fn(); pushUndo({ t: 'doc', before: before, after: snapshot() });
    if (art.width !== W() || art.height !== H()) setupCanvas(); else redraw();
    touched(); renderSide();
  }
  function undo() { if (op) { cancel(); return; } var s = app.undo.pop(); if (!s) return toast('Nothing to undo.'); apply(s, 'before'); app.redo.push(s); }
  function redo() { if (op) return; var s = app.redo.pop(); if (!s) return toast('Nothing to redo.'); apply(s, 'after'); app.undo.push(s); }
  function apply(s, which) {
    if (s.t === 'px') { var L = app.doc.layers[s.li]; if (L) L.data.set(s[which]); redraw(); }
    else { var resize = s[which].w !== W() || s[which].h !== H(); restoreSnap(s[which]); if (resize) setupCanvas(); else redraw(); }
    touched(); renderSide();
  }

  /* ---------------- layers ---------------- */
  var CMD = {
    addLayer: function () { structural(function () { var d = app.doc; d.layers.splice(d.active + 1, 0, D.newLayer(W(), H(), 'Layer ' + (d.layers.length + 1))); d.active++; }); },
    dupLayer: function () { structural(function () { var d = app.doc, l = layer(), c = D.newLayer(W(), H(), l.name + ' copy'); c.data.set(l.data); c.opacity = l.opacity; d.layers.splice(d.active + 1, 0, c); d.active++; }); },
    delLayer: function () { if (app.doc.layers.length < 2) return toast('A picture needs at least one layer.'); structural(function () { var d = app.doc; d.layers.splice(d.active, 1); d.active = Math.max(0, d.active - 1); }); },
    layerUp: function () { var d = app.doc; if (d.active >= d.layers.length - 1) return; structural(function () { var l = d.layers.splice(d.active, 1)[0]; d.layers.splice(d.active + 1, 0, l); d.active++; }); },
    layerDown: function () { var d = app.doc; if (d.active === 0) return; structural(function () { var l = d.layers.splice(d.active, 1)[0]; d.layers.splice(d.active - 1, 0, l); d.active--; }); },
    mergeDown: function () {
      var d = app.doc; if (d.active === 0) return toast('There’s no layer below this one.');
      structural(function () { var top = d.layers[d.active], low = d.layers[d.active - 1], out = new Uint8ClampedArray(low.data.length);
        D.composite(out, [{ visible: true, opacity: low.opacity, data: low.data }, { visible: top.visible, opacity: top.opacity, data: top.data }], W(), H());
        low.data = out; low.opacity = 1; d.layers.splice(d.active, 1); d.active--; });
    },
    clearLayer: function () { if (!begin('clear')) return; var b = app.sel || full(), d = layer().data; for (var y = b.y0; y < b.y1; y++) for (var x = b.x0; x < b.x1; x++) if (!app.allow || app.allow[y * W() + x]) d.fill(0, (y * W() + x) * 4, (y * W() + x) * 4 + 4); redraw(); commit(); },
    fillLayer: function () { if (!begin('fillLayer')) return; op.mask.fill(1); op.box = full(); show(); commit(); },
    selectAll: function () { app.sel = full(); drawOverlay(); },
    deselect: function () { app.sel = null; drawOverlay(); },
    copy: function () { copySel(false); }, cut: function () { copySel(true); },
    paste: function () {
      var c = app.clip; if (!c) return toast('Nothing copied yet: select an area and press Ctrl+C.');
      structural(function () { var L = D.newLayer(W(), H(), 'Pasted'), x0 = Math.min(c.x0, Math.max(0, W() - c.w)), y0 = Math.min(c.y0, Math.max(0, H() - c.h));
        for (var y = 0; y < c.h && y + y0 < H(); y++) for (var x = 0; x < c.w && x + x0 < W(); x++) { var i = (y * c.w + x) * 4, j = ((y + y0) * W() + x + x0) * 4; L.data[j] = c.data[i]; L.data[j + 1] = c.data[i + 1]; L.data[j + 2] = c.data[i + 2]; L.data[j + 3] = c.data[i + 3]; }
        app.doc.layers.splice(app.doc.active + 1, 0, L); app.doc.active++; });
      setTool('move'); toast('Pasted as a new layer. Drag to place it.');
    },
    ditherLayer: function () { if (!begin('dither')) return; D.ditherBrightness(layer().data, W(), H(), app.style, app.sel || full(), patternCache); redraw(); commit(); toast('Redrawn by brightness in the style’s colours: dark → colour 1, light → the last.'); },
    flipH: function () { if (!begin('flip')) return; D.flip(layer().data, W(), H(), true); redraw(); commit(); },
    flipV: function () { if (!begin('flip')) return; D.flip(layer().data, W(), H(), false); redraw(); commit(); },
    undo: undo, redo: redo,
    zoomIn: function () { zoomStep(1); }, zoomOut: function () { zoomStep(-1); }, fit: fit, actual: function () { zoomTo(1); },
    grid: function () { app.grid = !app.grid; savePrefs(); drawOverlay(); toast('Pixel grid ' + (app.grid ? 'on (from 800% zoom)' : 'off') + '.'); },
    bg: function () { var o = ['checker', 'white', 'grey', 'dark']; app.bg = o[(o.indexOf(app.bg) + 1) % o.length]; art.className = app.bg === 'checker' ? 'checker' : 'bg-' + app.bg; savePrefs(); toast('Background behind transparency: ' + { checker: 'checkerboard', white: 'white', grey: 'grey', dark: 'dark' }[app.bg] + '. (It isn’t part of the picture.)'); },
    mirror: function () { app.mirror = !app.mirror; renderOpts(); drawOverlay(); toast('Mirror drawing ' + (app.mirror ? 'on: everything you draw is copied across the middle.' : 'off.')); },
    new: function () { newDialog(); }, open: function () { pickFile('.dithry,.json,image/*', openFile); }, save: saveProject,
    import: function () { pickFile('image/*', importImage); }, export: exportDialog, copyPicture: copyPicture, example: function () { confirmDiscard(function () { exampleScene(); }); },
    cards: function () { if (hooks.enter) hooks.enter(); },
    resize: resizeDialog, guide: guideDialog, keys: keysDialog, about: aboutDialog
  };

  /* ---------------- files ---------------- */
  function touched() { app.dirty = true; renderTitle(); scheduleAutosave(); hooks.change.forEach(function (f) { f(); }); }
  function layerPNG(l) { return toCanvas(l.data, W(), H()).toDataURL('image/png'); }
  function projectJSON() { return { app: 'Dithry', version: 1, name: app.name, w: W(), h: H(), active: app.doc.active, style: app.style,
    layers: app.doc.layers.map(function (l) { return { name: l.name, visible: l.visible, opacity: l.opacity, locked: l.locked, png: layerPNG(l) }; }) }; }
  function decode(url, w, h) {
    return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { var c = document.createElement('canvas'); c.width = w || img.width; c.height = h || img.height;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0); res({ data: g.getImageData(0, 0, c.width, c.height).data, w: img.width, h: img.height, img: img }); }; img.onerror = rej; img.src = url; });
  }
  function loadProject(p) {
    if (hooks.leave) hooks.leave();
    if (!p || p.app !== 'Dithry' || !p.layers) return Promise.reject(new Error('not a Dithry project'));
    return Promise.all(p.layers.map(function (l) { return decode(l.png, p.w, p.h); })).then(function (imgs) {
      app.doc = { w: p.w, h: p.h, active: Math.min(p.active || 0, p.layers.length - 1), layers: p.layers.map(function (l, i) { var L = D.newLayer(p.w, p.h, l.name); L.visible = l.visible !== false; L.opacity = l.opacity == null ? 1 : l.opacity; L.locked = !!l.locked; L.data.set(imgs[i].data); return L; }) };
      if (p.style && app.mode !== 'cards') app.style = Object.assign(D.defaultStyle(), p.style);   // switching cards keeps your brush
      app.name = p.name || 'Untitled'; app.undo = []; app.redo = []; app.dirty = false; app.rampSel = 0;
      setupCanvas(); renderSide(); renderTitle();
    });
  }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function fileName(ext) { return (app.name || 'dithry').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + ext; }
  function saveProject() {
    if (hooks.save && app.mode === 'cards') return hooks.save();   // card mode saves to Kartenspiel
    var j = projectJSON(); download(new Blob([JSON.stringify(j)], { type: 'application/json' }), fileName('.dithry'));
    app.dirty = false; renderTitle(); autosave(); toast('Saved ' + fileName('.dithry') + ' to your downloads. Open it again with File → Open.');
  }
  var saveTimer = null, warnedFull = false;
  function scheduleAutosave() { clearTimeout(saveTimer); if (app.mode !== 'cards') saveTimer = setTimeout(autosave, 900); }   // card mode saves to Kartenspiel instead
  function autosave() {
    if (app.mode === 'cards') return;   // the picture you had open stays saved while you paint cards
    if (!lsSet('dithry.autosave', projectJSON()) && !warnedFull) { warnedFull = true; toast('This picture is too big to keep in the browser between visits. Use File → Save project.'); }
  }
  function pickFile(accept, cb) { var i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = function () { if (i.files && i.files[0]) cb(i.files[0]); }; i.click(); }
  function readFile(f, asText) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; if (asText) r.readAsText(f); else r.readAsDataURL(f); }); }
  function openFile(f) {
    confirmDiscard(function () {
      if (/^image\//.test(f.type)) {   // an image opens as a new picture of its own size (up to 1024 pixels a side)
        readFile(f).then(function (url) { return decode(url); }).then(function (r) {
          var w = Math.min(1024, r.w), h = Math.min(1024, r.h); newDoc(w, h, 'transparent', f.name.replace(/\.[^.]+$/, ''));
          var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.drawImage(r.img, 0, 0); layer().data.set(g.getImageData(0, 0, w, h).data); layer().name = 'Image'; redraw(); renderSide();
        }).catch(function () { toast('That file couldn’t be read as an image.'); });
        return;
      }
      readFile(f, true).then(function (t) { return loadProject(JSON.parse(t)); }).then(function () { toast('Opened ' + f.name + '.'); }).catch(function () { toast('That file isn’t a Dithry project.'); });
    });
  }
  function importImage(f) {
    readFile(f).then(function (url) { return decode(url); }).then(function (r) {
      structural(function () {
        var s = Math.min(1, W() / r.w, H() / r.h), w = Math.max(1, Math.round(r.w * s)), h = Math.max(1, Math.round(r.h * s));
        var c = document.createElement('canvas'); c.width = W(); c.height = H(); var g = c.getContext('2d'); g.imageSmoothingEnabled = s >= 1;
        g.drawImage(r.img, Math.floor((W() - w) / 2), Math.floor((H() - h) / 2), w, h);
        var L = D.newLayer(W(), H(), f.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Image'); L.data.set(g.getImageData(0, 0, W(), H()).data);
        app.doc.layers.splice(app.doc.active + 1, 0, L); app.doc.active++;
      });
      toast(r.w > W() || r.h > H() ? 'Imported and scaled down to fit the canvas.' : 'Imported as a new layer.');
    }).catch(function () { toast('That file couldn’t be read as an image.'); });
  }
  function copySel(cut) {
    var b = app.sel || full(), L = layer(), w = b.x1 - b.x0, h = b.y1 - b.y0, data = new Uint8ClampedArray(w * h * 4);
    for (var y = 0; y < h; y++) data.set(L.data.subarray(((y + b.y0) * W() + b.x0) * 4, ((y + b.y0) * W() + b.x1) * 4), y * w * 4);
    app.clip = { x0: b.x0, y0: b.y0, w: w, h: h, data: data };
    if (cut) CMD.clearLayer(); toast((cut ? 'Cut ' : 'Copied ') + w + ' × ' + h + ' pixels. Ctrl+V pastes them as a new layer.');
  }
  function flatten() { var out = new Uint8ClampedArray(W() * H() * 4); D.composite(out, app.doc.layers, W(), H()); return out; }
  function scaled(scale, bgColour) {
    var src = toCanvas(flatten(), W(), H()), c = document.createElement('canvas'); c.width = W() * scale; c.height = H() * scale;
    var g = c.getContext('2d'); if (bgColour) { g.fillStyle = bgColour; g.fillRect(0, 0, c.width, c.height); }
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height); return c;
  }
  function copyPicture() {
    if (!(navigator.clipboard && window.ClipboardItem)) return toast('This browser can’t copy pictures. Use File → Export PNG instead.');
    scaled(1).toBlob(function (b) { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { toast('Copied the picture.'); }, function () { toast('The browser didn’t allow copying. Use File → Export PNG instead.'); }); });
  }

  /* ---------------- dialogs ---------------- */
  function modal(title, body, btns, onKey) {
    closeModal();
    var bg = document.createElement('div'); bg.className = 'modalbg'; bg.id = 'modal';
    bg.innerHTML = '<div class="modal raised" role="dialog" aria-label="' + esc(title) + '"><div class="titlebar"><span>' + esc(title) + '</span><span class="grow"></span><button class="btn" data-close style="min-height:18px;padding:0 6px" aria-label="Close">×</button></div><div class="body">' + body + '</div><div class="btns">' + (btns || '<button class="btn def" data-close>OK</button>') + '</div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
    var f = bg.querySelector('input, select, .btn.def'); if (f) f.focus();
    return bg;
  }
  function closeModal() { var m = $('#modal'); if (m) m.remove(); }
  function confirmDiscard(go) {
    if (!app.dirty) return go();
    var m = modal('Unsaved changes', '<p>“' + esc(app.name) + '” has changes that aren’t saved to a file. They’ll be lost.</p>', '<button class="btn" data-close>Cancel</button><button class="btn" id="mSave">Save first</button><button class="btn def" id="mGo">Discard them</button>');
    $('#mGo', m).onclick = function () { closeModal(); go(); };
    $('#mSave', m).onclick = function () { saveProject(); closeModal(); go(); };
  }
  var SIZES = [['Kartenspiel card art', 64, 24], ['Card art, more detail', 96, 36], ['Hand-card texture', 44, 59], ['Board-card texture', 52, 52], ['Board backdrop', 320, 200], ['Scene', 160, 100], ['Icon', 32, 32], ['Sprite', 64, 64]];
  function newDialog() {
    var m = modal('New picture', '<div class="presetlist">' + SIZES.map(function (s, i) { return '<button class="btn" data-size="' + i + '">' + esc(s[0]) + '<br><span class="small muted">' + s[1] + ' × ' + s[2] + '</span></button>'; }).join('') + '</div>' +
      '<h3>Or any size</h3><div class="row">Width <input type="number" id="nW" min="1" max="1024" value="' + W() + '" style="width:70px"> Height <input type="number" id="nH" min="1" max="1024" value="' + H() + '" style="width:70px"> pixels</div>' +
      '<h3>Start with</h3><div class="row"><select id="nBg"><option value="transparent">Transparent</option><option value="white">White</option><option value="grey">Grey</option><option value="style">The current style</option></select></div>' +
      '<p class="small muted">Card art shows 30 pixels tall on the board and 120 in the big card view, cropped to fit; 64 × 24 keeps the pixels crisp in both.</p>',
      '<button class="btn" data-close>Cancel</button><button class="btn def" id="nGo">Create</button>');
    m.querySelectorAll('[data-size]').forEach(function (b) { b.onclick = function () { var s = SIZES[+b.getAttribute('data-size')]; $('#nW', m).value = s[1]; $('#nH', m).value = s[2]; }; });
    $('#nGo', m).onclick = function () {
      var w = clamp(parseInt($('#nW', m).value, 10) || 64, 1, 1024), h = clamp(parseInt($('#nH', m).value, 10) || 24, 1, 1024), bg = $('#nBg', m).value;
      closeModal(); confirmDiscard(function () { newDoc(w, h, bg); });
    };
  }
  function newDoc(w, h, bg, name) {
    if (hooks.leave) hooks.leave();
    app.doc = { w: w, h: h, active: 0, layers: [D.newLayer(w, h, 'Background')] };
    var d = layer().data;
    if (bg === 'white' || bg === 'grey') { var c = bg === 'white' ? [255, 255, 255] : [192, 192, 192]; for (var i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } }
    app.name = name || 'Untitled'; app.undo = []; app.redo = []; app.dirty = false; op = null;
    setupCanvas();
    if (bg === 'style') { begin('fillLayer'); op.mask.fill(1); op.box = full(); show(); op = null; }
    renderSide(); renderTitle(); autosave();
  }
  function resizeDialog() {
    var m = modal('Canvas size', '<div class="row">Width <input type="number" id="rW" min="1" max="1024" value="' + W() + '" style="width:70px"> Height <input type="number" id="rH" min="1" max="1024" value="' + H() + '" style="width:70px"></div>' +
      '<div class="row" style="margin-top:6px">Keep the picture at <select id="rA"><option value="tl">the top left</option><option value="c" selected>the centre</option><option value="b">the bottom middle</option></select></div><p class="small muted">This adds or trims canvas around the picture; it doesn’t stretch it.</p>',
      '<button class="btn" data-close>Cancel</button><button class="btn def" id="rGo">Resize</button>');
    $('#rGo', m).onclick = function () {
      var w = clamp(parseInt($('#rW', m).value, 10) || W(), 1, 1024), h = clamp(parseInt($('#rH', m).value, 10) || H(), 1, 1024), an = $('#rA', m).value; closeModal();
      structural(function () {
        var ox = an === 'tl' ? 0 : Math.round((w - W()) / 2), oy = an === 'tl' ? 0 : an === 'c' ? Math.round((h - H()) / 2) : h - H(), ow = W(), oh = H();
        app.doc.layers.forEach(function (l) { var nd = new Uint8ClampedArray(w * h * 4);
          for (var y = 0; y < oh; y++) { var ty = y + oy; if (ty < 0 || ty >= h) continue; for (var x = 0; x < ow; x++) { var tx = x + ox; if (tx < 0 || tx >= w) continue; var i = (y * ow + x) * 4, j = (ty * w + tx) * 4; nd[j] = l.data[i]; nd[j + 1] = l.data[i + 1]; nd[j + 2] = l.data[i + 2]; nd[j + 3] = l.data[i + 3]; } }
          l.data = nd; });
        app.doc.w = w; app.doc.h = h;
      });
    };
  }
  function exportDialog() {
    var m = modal('Export PNG', '<div class="ctl"><span>Name</span><input type="text" id="eN" value="' + esc(fileName('').replace(/-$/, '') || 'dithry') + '"></div>' +
      '<div class="ctl" style="margin-top:4px"><span>Scale</span><select id="eS">' + [1, 2, 3, 4, 6, 8, 12, 16].map(function (s) { return '<option value="' + s + '">' + s + '× (' + W() * s + ' × ' + H() * s + ')</option>'; }).join('') + '</select></div>' +
      '<label class="row" style="margin-top:6px"><input type="checkbox" id="eT" checked> Keep transparency</label>' +
      '<p class="small muted">For Kartenspiel card art, export at 1× and choose the file under <b>Artwork</b> in the Card Builder: small pixel art stays crisp there. Scale up for sharing anywhere else, so it isn’t blurred.</p>',
      '<button class="btn" data-close>Cancel</button><button class="btn def" id="eGo">Download PNG</button>');
    $('#eGo', m).onclick = function () {
      var s = +$('#eS', m).value, nm = ($('#eN', m).value || 'dithry').replace(/[^\w\- ]+/g, '').trim() || 'dithry';
      scaled(s, $('#eT', m).checked ? null : getComputedStyle(art).backgroundColor || '#ffffff').toBlob(function (b) { download(b, nm + (s > 1 ? '@' + s + 'x' : '') + '.png'); });
      closeModal(); toast('Exported ' + nm + '.png.');
    };
  }
  function guideDialog() {
    modal('Dithry quick guide', '<p><b>How it works.</b> Every tool decides <i>which pixels</i> to touch; the panels on the right decide <i>what colour</i> each one gets. That style is a ramp of 1–4 colours and a gradient: each pixel gets a value from 0 to 1, and the dither pattern turns that smooth value into pixels of the ramp’s colours.</p>' +
      '<h3>Making a dithered shape</h3><p>Pick two colours in <b>Colours</b> (colour 1 is where the gradient starts). Choose a <b>Gradient</b> type and angle, then draw a rectangle, ellipse or polygon: the gradient spans each shape. <b>Softness</b> sets how wide the blend is; <b>Midpoint</b> pushes it toward one end.</p>' +
      '<h3>Big gradients</h3><p>Use the <b>Gradient tool</b>: drag across the canvas and the whole layer (or the area under your first point) fills along that line. Set <b>Spans</b> to “Gradient-tool handles” to make brushes and shapes use that same line.</p>' +
      '<h3>The look</h3><p><b>Pattern</b> picks the dither (Bayer cross-hatch, halftone, lines, masonry, grass, vines…). <b>Dithering</b> at 0% gives hard bands; 100% blends fully. <b>Ripples</b> bend the frontier into waves, and <b>Turbulence</b> roughens it. <b>Follows the shape’s edge</b> shades from the outline inward. Transparent ramp colours let a style tint what’s underneath.</p>' +
      '<h3>Selections and pictures</h3><p>The <b>Select</b> tool keeps drawing inside a rectangle, which is handy for a gradient over part of a layer. <b>Image → Dither layer by brightness</b> redraws a layer (or the selection) in the style’s colours, so an imported picture becomes dithered pixel art.</p>' +
      '<h3>Layers</h3><p>Put sky, ground, water and buildings on separate layers so you can redo one without the others. Lock a layer to protect it.</p>' +
      '<h3>Kartenspiel card art</h3><p>Start from <b>File → New → Kartenspiel card art</b> (64 × 24), export at 1×, and choose the PNG under <b>Artwork</b> in the Card Builder. Try <b>File → Open the example scene</b> to see how a picture is built up.</p>', null);
  }
  function keysDialog() {
    var rows = TOOLS.map(function (t) { return [t.key, t.name]; }).concat([['[ ]', 'Brush size'], ['X', 'Reverse the colour ramp'], ['Shift', 'Snap lines to 45°; squares and circles'], ['Space (hold)', 'Pan'], ['Enter / Esc', 'Finish / cancel a polygon'], ['+ − 0 1', 'Zoom in, out, fit, actual size'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+S / Ctrl+O / Ctrl+E', 'Save, open, export'], ['Ctrl+Shift+N', 'New layer'], ['Shift+M', 'Mirror drawing'], ['Delete', 'Clear the layer (or the selection)'], ['Ctrl+A / Ctrl+D', 'Select all / deselect'], ['Ctrl+C / X / V', 'Copy, cut, paste as a new layer'], ['F1', 'Quick guide']]);
    modal('Keyboard shortcuts', '<table>' + rows.map(function (r) { return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>');
  }
  function aboutDialog() { modal('About Dithry', '<p><b>Dithry</b> — Pixel Art and Dithered Gradient Tool.</p><p>Made for Kartenspiel, to draw art in the same dithered style as its cards and board. Your work stays in this browser until you save or export it.</p>'); }
  var toastTimer = null;
  function toast(msg) { var t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast raised'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3200); }

  /* ---------------- menus ---------------- */
  function closeMenus() { document.querySelectorAll('.mi.open').forEach(function (m) { m.classList.remove('open'); }); }
  function run(cmd) { closeMenus(); if (CMD[cmd]) CMD[cmd](); }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'radio' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if ($('#modal')) { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && !typing) { var d = $('#modal .btn.def'); if (d) d.click(); } return; }
    if (typing) return;
    var c = e.ctrlKey || e.metaKey, k = e.key;
    if (c) {
      var lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
      if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); return redo(); }
      if (lk === 's') { e.preventDefault(); return saveProject(); }
      if (lk === 'o') { e.preventDefault(); return run('open'); }
      if (lk === 'e') { e.preventDefault(); return exportDialog(); }
      if (lk === 'g') { e.preventDefault(); return run('grid'); }
      if (lk === 'a') { e.preventDefault(); return run('selectAll'); }
      if (lk === 'd') { e.preventDefault(); return run('deselect'); }
      if (lk === 'c') { e.preventDefault(); return run('copy'); }
      if (lk === 'x') { e.preventDefault(); return run('cut'); }
      if (lk === 'v') { e.preventDefault(); return run('paste'); }
      if (lk === 'm') { e.preventDefault(); return run('mergeDown'); }
      if (lk === 'n' && e.shiftKey) { e.preventDefault(); return run('addLayer'); }
      if (lk === 'n' && e.altKey) { e.preventDefault(); return newDialog(); }
      return;
    }
    if (k === ' ') { spaceDown = true; work.classList.add('panning'); e.preventDefault(); return; }
    if (k === 'Escape') { if (op) cancel(); else if (app.sel) run('deselect'); closeMenus(); return; }
    if (k === 'Enter') { if (op && op.kind === 'polygon') { e.preventDefault(); finishPolygon(); } return; }
    if (k === 'Backspace') { if (op && op.kind === 'polygon') { e.preventDefault(); op.pts.pop(); if (!op.pts.length) cancel(); else { polyMask(op.pts); show(); drawOverlay(); } } return; }
    if (k === 'Delete') { e.preventDefault(); return run('clearLayer'); }
    if (k === 'F1') { e.preventDefault(); return guideDialog(); }
    if (k === '+' || k === '=') return zoomStep(1);
    if (k === '-' || k === '_') return zoomStep(-1);
    if (k === '0') return fit();
    if (k === '1') return zoomTo(1);
    if (k === '[') { app.size = Math.max(1, app.size - 1); savePrefs(); renderOpts(); drawOverlay(); return; }
    if (k === ']') { app.size = Math.min(64, app.size + 1); savePrefs(); renderOpts(); drawOverlay(); return; }
    if (k === 'x' || k === 'X') { app.style.ramp.reverse(); savePrefs(); renderSide(); return; }
    if (e.shiftKey && (k === 'M' || k === 'm')) return run('mirror');
    if (e.shiftKey && (k === 'F' || k === 'f')) return run('fillLayer');
    var tl = TOOLS.filter(function (x) { return x.key.toLowerCase() === k.toLowerCase(); })[0];
    if (tl && !e.shiftKey && !e.altKey) setTool(tl.id);
  }
  function setTool(id) { if (op) { if (op.kind === 'polygon') finishPolygon(); else cancel(); } app.tool = id; savePrefs(); renderOpts(); drawOverlay(); }

  /* ---------------- side-panel and option events ---------------- */
  function onSideInput(e) {
    var t = e.target, k = t.getAttribute('data-k');
    if (t.hasAttribute('data-opt')) return onOpt(e);   // the tool's options, in the phone's Tool sheet
    if (k) {
      var v = t.type === 'checkbox' ? t.checked : t.tagName === 'SELECT' ? t.value : parseFloat(t.value);
      if (t.type === 'number' && isNaN(v)) return;
      setPath(app.style, k, v);
      var lbl = $('[data-v="' + k + '"]'); if (lbl) { var f = /angle/.test(k) ? '°' : /start|end|mid|contrast|level|opacity|mix/.test(k) ? '%' : /scale$/.test(k) && /dither/.test(k) ? 'x' : ''; lbl.textContent = fmtV(v, f); }
      if (t.tagName === 'SELECT' && /grad\.(type|anchor)/.test(k)) { renderSide(); if (k === 'grad.anchor') drawOverlay(); }
      drawPreview(); savePrefs(); return;
    }
    var a = t.getAttribute('data-act'), sel = app.style.ramp[Math.min(app.rampSel, app.style.ramp.length - 1)];
    if (a === 'colour') { sel.c = t.value; $('[data-act="hex"]').value = t.value; updateRampSwatch(); }
    else if (a === 'hex') { if (/^#?[0-9a-f]{6}$/i.test(t.value.trim())) { sel.c = '#' + t.value.trim().replace('#', '').toLowerCase(); $('[data-act="colour"]').value = sel.c; updateRampSwatch(); } return; }
    else if (a === 'alpha') { sel.a = parseFloat(t.value); $('#alphaV').textContent = Math.round(sel.a * 100) + '%'; updateRampSwatch(); }
    else if (a === 'layerOpacity') { layer().opacity = parseFloat(t.value); $('#lopV').textContent = Math.round(layer().opacity * 100) + '%'; redraw(); touched(); return; }
    else if (a === 'palette' && e.type === 'change') { app.palette = t.value; savePrefs(); renderSide(); return; }
    else if (a === 'preset' && e.type === 'change') {
      var v2 = t.value; if (!v2) return;
      app.style = v2[0] === 'b' ? D.applyPreset(app.style, D.PRESETS[+v2.slice(1)]) : Object.assign(D.defaultStyle(), D.clone(app.userPresets[+v2.slice(1)].s));
      app.rampSel = 0; savePrefs(); renderSide(); toast('Style: ' + t.options[t.selectedIndex].text + '.'); return;
    }
    else if (t.getAttribute('data-mode')) { app.style.mode = t.getAttribute('data-mode'); renderSide(); }
    else if (t.hasAttribute('data-vis')) { var L = app.doc.layers[+t.getAttribute('data-vis')]; L.visible = t.checked; redraw(); touched(); return; }
    drawPreview(); savePrefs();
  }
  function updateRampSwatch() { var b = $('.sw.sel i'); if (b) { var s = app.style.ramp[app.rampSel]; b.style.background = swatchBG(s.c, s.a); } drawPreview(); savePrefs(); }
  function onSideClick(e) {
    if (e.target.tagName === 'INPUT') return;   // checkboxes and fields act through onSideInput
    var t = e.target.closest('button, .ph, .layer'); if (!t) return;
    if (t.classList.contains('ph')) { var p = t.parentNode.getAttribute('data-panel'); app.shut[p] = !app.shut[p]; savePrefs(); renderSide(); return; }
    if (t.getAttribute('data-m') === 'close') { app.sheet = null; renderSide(); keepInView(); return; }
    if (t.hasAttribute('data-cmd')) { if (app.sheet === 'menu') { app.sheet = null; renderSide(); keepInView(); } return run(t.getAttribute('data-cmd')); }
    if (t.hasAttribute('data-ramp')) { app.rampSel = +t.getAttribute('data-ramp'); renderSide(); return; }
    if (t.hasAttribute('data-pal')) {
      var r = app.style.ramp[Math.min(app.rampSel, app.style.ramp.length - 1)], c = t.getAttribute('data-pal');
      if (c === 'transparent') r.a = 0; else { r.c = c; if (r.a === 0) r.a = 1; }
      savePrefs(); renderSide(); return;
    }
    if (t.hasAttribute('data-lock')) { var L = app.doc.layers[+t.getAttribute('data-lock')]; L.locked = !L.locked; renderSide(); return; }
    if (t.classList.contains('layer')) { if (op) cancel(); app.doc.active = +t.getAttribute('data-layer'); renderSide(); return; }
    var a = t.getAttribute('data-act'), st = app.style;
    if (a === 'rampAdd' && st.ramp.length < 4) { var last = st.ramp[st.ramp.length - 1]; st.ramp.push({ c: last.c, a: last.a }); app.rampSel = st.ramp.length - 1; }
    else if (a === 'rampDel' && st.ramp.length > 1) { st.ramp.splice(app.rampSel, 1); app.rampSel = Math.min(app.rampSel, st.ramp.length - 1); }
    else if (a === 'rampRev') st.ramp.reverse();
    else if (a === 'dice') st.dither.seed = Math.floor(Math.random() * 99999);
    else if (a === 'keepColour') { var s2 = st.ramp[app.rampSel]; if (app.custom.indexOf(s2.c) < 0) app.custom.push(s2.c); app.palette = 'custom'; toast('Kept ' + s2.c + ' in My colours.'); }
    else if (a === 'savePreset') {
      var m = modal('Save style preset', '<div class="ctl"><span>Name</span><input type="text" id="pN" value="My style ' + (app.userPresets.length + 1) + '"></div>', '<button class="btn" data-close>Cancel</button><button class="btn def" id="pGo">Save</button>');
      $('#pGo', m).onclick = function () { app.userPresets.push({ name: ($('#pN', m).value || 'My style').slice(0, 40), s: D.clone(app.style) }); savePrefs(); closeModal(); renderSide(); toast('Saved the style preset.'); };
      return;
    } else return;
    savePrefs(); renderSide();
  }
  function onSideDbl(e) {
    var row = e.target.closest('.layer'); if (!row) return;
    var i = +row.getAttribute('data-layer'), L = app.doc.layers[i], nm = row.querySelector('.nm');
    nm.innerHTML = '<input type="text" value="' + esc(L.name) + '" style="width:100%">'; var inp = nm.querySelector('input'); inp.focus(); inp.select();
    function done() { L.name = (inp.value || L.name).slice(0, 40); touched(); renderSide(); }
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') renderSide(); ev.stopPropagation(); });
    inp.addEventListener('blur', done);
  }
  function onOpt(e) {
    var t = e.target, k = t.getAttribute('data-opt'); if (!k) return;
    var v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? parseInt(t.value, 10) : t.value;
    if (t.type === 'number' && isNaN(v)) return;
    if (t.type === 'range') v = parseInt(t.value, 10);
    if (k === 'size') { v = clamp(v, 1, 64); document.querySelectorAll('[data-optv="size"]').forEach(function (b) { b.textContent = v; }); } if (k === 'tol') v = clamp(v, 0, 255);
    app[k] = v; savePrefs(); if ((k === 'shape' || k === 'mirror' || k === 'snap') && e.type === 'change') renderOpts(); drawOverlay();
  }

  /* ---------------- the example scene ---------------- */
  // A small night prairie, built with the same operations as the tools, layer by layer.
  function exampleScene() {
    newDoc(160, 100, 'transparent', 'Night prairie');
    var w = 160, h = 100, hz = 46, keep = app.style;
    function layerNamed(name) { var d = app.doc; if (d.layers.length === 1 && d.layers[0].name === 'Background' && !d.layers[0].used) { d.layers[0].name = name; d.layers[0].used = true; return; } d.layers.push(D.newLayer(w, h, name)); d.active = d.layers.length - 1; }
    function draw(style, maskFn, fieldBox) { app.style = style; begin('example'); op.box = maskFn(op.mask); show(fieldBox); op = null; }
    function preset(name, over) { var p = D.PRESETS.filter(function (q) { return q.name === name; })[0], s = D.applyPreset(D.defaultStyle(), p); over && over(s); return s; }
    layerNamed('Sky');
    draw(preset('Night sky', function (s) { s.ripple.amp = .04; s.grad.end = 1.05; }), function (m) { return D.rect(m, w, h, 0, 0, w - 1, hz, true, 1); });
    layerNamed('Moon');
    draw(preset('Moonlit glow', function (s) { s.grad.contrast = .7; }), function (m) { return D.ellipse(m, w, h, 112, 4, 136, 28, true, 1); });
    var moon = D.defaultStyle(); moon.mode = 'solid'; moon.ramp = [{ c: '#fff7d6', a: 1 }];
    draw(moon, function (m) { return D.ellipse(m, w, h, 118, 10, 130, 22, true, 1); });
    app.style = moon; begin('example'); op.box = D.ellipse(op.mask, w, h, 122, 8, 133, 20, true, 1); show(null, null, true); op = null;   // carve the crescent
    var star = D.defaultStyle(); star.mode = 'solid'; star.ramp = [{ c: '#e8ecff', a: 1 }]; var R = D.rng(5);
    draw(star, function (m) { var b = null; for (var i = 0; i < 40; i++) { var x = Math.floor(R() * w), y = Math.floor(R() * (hz - 8)); if (Math.hypot(x - 124, y - 16) > 16) b = D.union(b, D.stamp(m, w, h, x, y, 1)); } return b; });
    layerNamed('City');
    var city = D.defaultStyle(); city.ramp = [{ c: '#1a1c26', a: 1 }, { c: '#2a2d3a', a: 1 }]; city.grad.reverse = false; city.grad.contrast = .6; city.dither.pattern = 'masonry';
    draw(city, function (m) {
      var b = D.rect(m, w, h, 46, hz - 6, 104, hz, true, 1);
      for (var x = 46; x < 104; x += 3) b = D.union(b, D.rect(m, w, h, x, hz - 7, x + 1, hz - 7, true, 1));
      [[46, 11], [60, 13], [75, 12], [90, 14], [101, 11]].forEach(function (t) { b = D.union(b, D.rect(m, w, h, t[0], hz - t[1], t[0] + 4, hz, true, 1)); b = D.union(b, D.polygon(m, w, h, [[t[0] - 1, hz - t[1]], [t[0] + 2, hz - t[1] - 5], [t[0] + 5, hz - t[1]]], true, 0)); });
      b = D.union(b, D.rect(m, w, h, 66, hz - 18, 76, hz, true, 1)); b = D.union(b, D.polygon(m, w, h, [[69, hz - 18], [71, hz - 28], [73, hz - 18]], true, 0));
      return b;
    });
    layerNamed('Prairie');
    draw(preset('Wind-bent grass', function (s) { s.ramp = [{ c: '#2f3a2c', a: 1 }, { c: '#141a14', a: 1 }]; s.grad.contrast = 1; s.ripple.amp = .03; s.ripple.freq = 2; }), function (m) { return D.rect(m, w, h, 0, hz + 1, w - 1, h - 1, true, 1); });
    layerNamed('River');
    var pts = [], pts2 = [];
    for (var y = hz + 1; y < h; y += 2) { var t = (y - hz) / (h - hz), cx = 80 + Math.sin(1.6 / (t + .06) + 1.3) * 32 * t, rw = 1 + 24 * Math.pow(t, 1.4); pts.push([Math.round(cx - rw), y]); pts2.unshift([Math.round(cx + rw), y]); }
    pts.push([pts[pts.length - 1][0], h]); pts2.unshift([pts2[0][0], h]);
    draw(preset('River water', function (s) { s.ramp = [{ c: '#8a96b8', a: 1 }, { c: '#3a4462', a: 1 }]; s.grad.reverse = true; s.grad.contrast = .8; }), function (m) { return D.polygon(m, w, h, pts.concat(pts2), true, 0); });
    app.doc.layers.forEach(function (l) { delete l.used; });
    app.style = keep; app.undo = []; app.redo = []; app.dirty = false; redraw(); renderSide(); renderTitle(); fit(); autosave();
    toast('The example scene: each part is on its own layer. Hide layers to see how it’s built.');
  }

  /* ---------------- start-up ---------------- */
  function start() {
    document.getElementById('app').innerHTML = shellHTML();
    art = $('#art'); over = $('#over'); octx = over.getContext('2d'); work = $('#work');
    var saved = lsGet('dithry.autosave');
    var cardsFirst = /^#card/.test(location.hash);   // opening straight into card mode: no example scene first
    var ready = saved ? loadProject(saved).catch(function () { exampleScene(); }) : Promise.resolve(cardsFirst ? newDoc(64, 24, 'transparent') : exampleScene());
    app.doc = app.doc || { w: 64, h: 24, active: 0, layers: [D.newLayer(64, 24, 'Background')] };
    if (!saved) { /* exampleScene ran above */ } else setupCanvas();
    renderOpts(); renderSide(); renderTitle();
    ready.then(function () { renderOpts(); if (hooks.start) return hooks.start(); }).then(function () { window.dithryReady = true; });

    // on a phone, tapping the tool you already have opens its options
    onTap($('.tools'), '[data-tool]', function (b) { var id = b.getAttribute('data-tool'); if (mobile() && app.tool === id) openSheet('tool'); else { setTool(id); if (mobile() && app.sheet === 'tool') renderSide(); } });
    onTap($('.mtop'), '[data-m]', function (b) { var m = b.getAttribute('data-m');
      if (m === 'menu') openSheet('menu'); else if (m === 'undo') undo(); else if (m === 'redo') redo(); else if (m === 'fit') fit(); });
    onTap($('#mtabs'), '[data-sheet]', function (b) { openSheet(b.getAttribute('data-sheet')); });
    onTap($('#polybar'), '[data-poly]', function (b) { if (!op || op.kind !== 'polygon') return; var a = b.getAttribute('data-poly');
      if (a === 'done') finishPolygon(); else if (a === 'cancel') cancel(); else { op.pts.pop(); if (!op.pts.length) cancel(); else { polyMask(op.pts); show(); drawOverlay(); } } });
    $('#polybar').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    if (PHONE.addEventListener) PHONE.addEventListener('change', function () { app.sheet = null; renderSide(); renderOpts(); setTimeout(fit, 50); });
    $('.menubar').addEventListener('click', function (e) {
      var cmd = e.target.closest('[data-cmd]'); if (cmd) return run(cmd.getAttribute('data-cmd'));
      var mi = e.target.closest('.mi'); if (!mi) return; var was = mi.classList.contains('open'); closeMenus(); if (!was) mi.classList.add('open');
    });
    $('.menubar').addEventListener('mouseover', function (e) { var mi = e.target.closest('.mi'); if (mi && document.querySelector('.mi.open') && !mi.classList.contains('open')) { closeMenus(); mi.classList.add('open'); } });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.menubar')) closeMenus(); }, true);
    var side = $('#side'); side.addEventListener('input', onSideInput); side.addEventListener('change', onSideInput); onTap(side, 'button, .ph, .layer', function (b, e) { onSideClick({ target: e.target.tagName === 'INPUT' ? e.target : b }); }); side.addEventListener('dblclick', onSideDbl);
    var opts = $('#opts'); opts.addEventListener('change', onOpt); opts.addEventListener('input', onOpt);
    work.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    work.addEventListener('dblclick', function () { if (lastPointerType !== 'touch') finishPolygon(); });   // on touch, quick taps on nearby corners look like a double-click: the Finish bar ends a polygon there
    work.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    work.addEventListener('pointerleave', function () { if (!op) { app.hover = null; status(); drawOverlay(); } });
    work.addEventListener('wheel', function (e) { e.preventDefault(); var r = work.getBoundingClientRect(); if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) { wheelAcc += e.deltaY; if (Math.abs(wheelAcc) >= (e.ctrlKey ? 8 : 40)) { zoomStep(wheelAcc < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); wheelAcc = 0; } } else { app.panX -= e.deltaX; applyView(); } }, { passive: false });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; work.classList.remove('panning'); } });
    window.addEventListener('resize', function () { drawOverlay(); });
    window.addEventListener('beforeunload', function () { if (app.dirty) autosave(); });
  }
  var wheelAcc = 0;
  // Buttons that act when a finger lifts off them, not on the click that follows: Chrome drops a tap that comes just
  // after a stroke (it waits to see if it's a double-tap), and you often reach for Undo right after drawing.
  // A click without a pointer before it (the keyboard) still works.
  function onTap(root, sel, fn) {
    var down = null, last = -1e9;
    root.addEventListener('pointerdown', function (e) { var b = e.target.closest(sel); down = b && root.contains(b) ? { b: b, id: e.pointerId, x: e.clientX, y: e.clientY } : null; });
    root.addEventListener('pointerup', function (e) {
      var d = down; down = null; if (!d || e.pointerId !== d.id || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
      last = e.timeStamp; fn(d.b, e);
    });
    root.addEventListener('pointercancel', function () { down = null; });
    root.addEventListener('click', function (e) { var b = e.target.closest(sel); if (b && root.contains(b) && e.timeStamp - last > 700) fn(b, e); });
  }
  // For card mode (cards.js) and tests.
  window.DithryApp = { app: app, D: D, hooks: hooks, run: run, setTool: setTool, flatten: function () { return flatten(); }, projectJSON: projectJSON, loadProject: loadProject,
    setupCanvas: function () { setupCanvas(); }, PALETTES: PALETTES, redraw: redraw, renderSide: function () { renderSide(); }, renderTitle: renderTitle, renderOpts: renderOpts, toast: toast, modal: modal, closeModal: closeModal,
    confirmDiscard: confirmDiscard, decode: decode, toCanvas: toCanvas, layerPNG: layerPNG, autosaved: function () { return lsGet('dithry.autosave'); }, fit: fit, applyView: applyView, drawOverlay: drawOverlay,
    cancel: function () { if (op) cancel(); }, lsGet: lsGet, lsSet: lsSet, esc: esc, work: function () { return work; } };
  start();
})();
