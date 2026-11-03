// Claudenspiel: apply a JSON list of card changes to src/data.js and write it back in the same layout.
// Usage: node tools/rewrite-data.js changes.json
//   changes.json: { "<id>": { field: value, ... }, ... }  ("_new": [card, ...] appends whole new cards)
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'src', 'data.js'), src = fs.readFileSync(file, 'utf8');
const ch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const start = src.indexOf('var STARTER = ['), end = src.indexOf('  ].map(c);');
const arr = eval(src.slice(start + 'var STARTER = '.length, end + 3));
for (const id in ch) { if (id === '_new') continue; const c = arr.find(x => x.id === id); if (!c) throw new Error('no card ' + id); Object.assign(c, ch[id]); }
(ch._new || []).forEach(c => { if (arr.some(x => x.id === c.id)) throw new Error('duplicate ' + c.id); arr.push(c); });
const body = JSON.stringify(arr, null, 1).split('\n').map((l, i) => i ? '  ' + l : l).join('\n').replace(/\n  \]$/, '\n  ]');
fs.writeFileSync(file, src.slice(0, start) + 'var STARTER = ' + body.replace(/\]$/, '') + src.slice(end + 2));
console.log('cards', arr.length);
