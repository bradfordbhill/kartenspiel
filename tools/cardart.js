// Merges a card art pack (exported from Dithry's card mode: Art pack… → Download) into src/cardart.js, so the
// painted cards are built into the game and every player sees them. Run: node tools/cardart.js kartenspiel-card-art.json
// Cards in the pack replace those already in the file; a card set to null in the pack is removed.
// The site's service worker and players' browsers pick the new art up on their next visit after it's deployed.
const fs = require('fs'), path = require('path');
const file = process.argv[2]; if (!file) { console.error('Usage: node tools/cardart.js kartenspiel-card-art.json'); process.exit(1); }
const pack = JSON.parse(fs.readFileSync(file, 'utf8')); if (!pack || !pack.faces) { console.error(file + ' is not a card art pack.'); process.exit(1); }
const out = process.argv[3] || path.join(__dirname, '..', 'src', 'cardart.js'),   // a second argument writes somewhere else (tests)
      cur = (() => { try { return require(out); } catch (e) { return {}; } })();
const ok = u => typeof u === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(u);
let added = 0, removed = 0;
for (const id in pack.faces) {
  const f = pack.faces[id];
  if (f === null) { if (cur[id]) { delete cur[id]; removed++; } continue; }
  if (!f || !ok(f.hand) || !ok(f.board)) { console.warn('skipped ' + id + ': not two PNG pictures'); continue; }
  cur[id] = { hand: f.hand, board: f.board }; added++;
}
const ids = Object.keys(cur).sort();
fs.writeFileSync(out, '/* Painted card faces committed to the game, so every player sees them: { cardId: { hand, board } } as PNG data URLs.\n' +
  '   Dithry\'s card mode exports an art pack; tools/cardart.js merges it in here. */\nvar KCardArt = {\n' +
  ids.map(id => '  ' + JSON.stringify(id) + ': ' + JSON.stringify(cur[id])).join(',\n') + '\n};\nif (typeof module !== \'undefined\') module.exports = KCardArt;\n');
console.log('src/cardart.js: ' + added + ' card(s) added or updated, ' + removed + ' removed, ' + ids.length + ' in all. Run ./build.sh, then commit.');
