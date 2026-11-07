const K = require('../engine.js'), B = require('../bot.js');
function play(seed, houses, kinds) {
  const st = K.newGame({ seed, houses });
  let n = 0;
  while (!st.over && n++ < 5000) {
    const a = B.choose(st, kinds[st.active]);
    const err = K.apply(st, a);
    if (err) throw new Error('bot illegal: ' + err + ' ' + JSON.stringify(a));
  }
  if (!st.over) throw new Error('did not finish');
  return st;
}
module.exports = { play };
if (require.main === module) {
  const N = +process.argv[2] || 300;
  const H = Object.keys(K.HOUSES);
  const kinds = (process.argv[3] || 'builder,money').split(',');
  const res = { first: 0, second: 0, tie: 0, rounds: 0, k0: 0, k1: 0, tiles: [0, 0], pts: [0, 0] };
  const house = {}; H.forEach((h) => (house[h] = { w: 0, g: 0 }));
  for (let i = 0; i < N; i++) {
    const h0 = H[i % 4], h1 = H[Math.floor(i / 4) % 4];
    const st = play(i + 1, [h0, h1], kinds);
    res.rounds += st.round;
    if (st.winner === 0) { res.first++; res.k0++; } else if (st.winner === 1) { res.second++; res.k1++; } else res.tie++;
    house[h0].g++; house[h1].g++;
    if (st.winner >= 0) house[st.players[st.winner].house].w++;
    st.players.forEach((p, j) => { res.tiles[j] += p.tab.length; res.pts[j] += K.score(st, j).total; });
  }
  console.log(kinds.join(' vs '), 'first wins', res.first, 'second', res.second, 'ties', res.tie, 'avg rounds', (res.rounds / N).toFixed(1));
  console.log('avg tiles', res.tiles.map((x) => (x / N).toFixed(1)), 'avg pts', res.pts.map((x) => (x / N).toFixed(1)));
  console.log(Object.entries(house).map(([h, v]) => h + ' ' + (100 * v.w / v.g).toFixed(0) + '%').join('  '));
}
