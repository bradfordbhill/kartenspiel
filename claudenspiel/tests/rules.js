const assert = require('assert');
const K = require('../engine.js'), S = require('./sim.js');
const C = K.C;
let n = 0; const t = (name, f) => { f(); n++; };

t('new game deals hands, supply sane', () => {
  const st = K.newGame({ seed: 7, houses: ['verdant', 'tide'] });
  assert.equal(st.players[0].hand.length, 5); assert.equal(st.players[1].hand.length, 6 - 0);
  assert.equal(st.kingdom.length, 10); assert.equal(st.supply.curse, 10);
  assert.equal(st.players[0].tab[0].id, 'seat-verdant');
});
t('placement obeys adjacency and 4x4 window', () => {
  const st = K.newGame({ seed: 1, houses: ['forge', 'tide'] });
  const p = st.players[0];
  p.hand = ['grove']; assert.ok(K.legalPlace(st, 0, 1, 0)); assert.ok(!K.legalPlace(st, 0, 5, 5));
  p.tab = [0, 1, 2, 3].map((x) => ({ id: 'grove', x, y: 0 }));
  assert.ok(!K.legalPlace(st, 0, 4, 0), 'fifth in a row exceeds window');
  assert.ok(K.legalPlace(st, 0, 3, 1));
});
t('buying spends coins and enforces buys', () => {
  const st = K.newGame({ seed: 3, houses: ['verdant', 'tide'] });
  const p = st.players[0]; p.hand = ['penny', 'penny', 'penny', 'penny', 'penny'];
  assert.equal(K.apply(st, { t: 'buy', id: 'idol' }), null);
  assert.equal(K.avail(st), 0); assert.notEqual(K.apply(st, { t: 'buy', id: 'shard' }), null);
});
t('regions and rules score', () => {
  const st = K.newGame({ seed: 1, houses: ['verdant', 'tide'] });
  const p = st.players[0]; p.deck = []; p.hand = []; p.discard = [];
  p.tab = [{ id: 'seat-verdant', x: 0, y: 0 }, { id: 'grove', x: 1, y: 0 }, { id: 'orchard', x: 2, y: 0 }];
  const b = K.score(st, 0);
  assert.equal(b.regions, K.REGION[3]); assert.equal(b.tiles, 1);
  p.tab.push({ id: 'crossroads', x: 3, y: 0 });
  assert.equal(K.regions(p).filter((g) => g.suit === 'Wood')[0].size, 4);
});
t('curse attack, ward blocks', () => {
  const st = K.newGame({ seed: 1, houses: ['forge', 'verdant'] });
  st.players[0].hand = ['volcano']; st.players[0].tab.push();
  assert.equal(K.apply(st, { t: 'place', i: 0, x: 1, y: 0 }), null);
  assert.equal(st.players[1].discard.filter((x) => x === 'curse').length, 1);
  st.players[1].tab.push({ id: 'watchtower', x: 1, y: 0 });
  st.players[0].hand = ['volcano']; K.apply(st, { t: 'place', i: 0, x: 0, y: 1 });
  assert.equal(st.players[1].discard.filter((x) => x === 'curse').length, 1);
});
t('trash pending must be resolved', () => {
  const st = K.newGame({ seed: 1, houses: ['verdant', 'tide'] });
  st.players[0].hand = ['scavenge', 'curse', 'penny'];
  K.apply(st, { t: 'event', i: 0 });
  assert.notEqual(K.apply(st, { t: 'end' }), null);
  assert.equal(K.apply(st, { t: 'trash', idxs: [0, 1] }), null);
  assert.equal(st.ti.coins, K.income(st, 0) + 2); assert.equal(st.players[0].hand.length, 0);
});
t('500 bot games finish legally', () => {
  const H = Object.keys(K.HOUSES);
  for (let i = 0; i < 500; i++) {
    const st = S.play(i + 100, [H[i % 4], H[(i >> 2) % 4]], ['balanced', i % 3 ? 'builder' : 'money']);
    assert.ok(st.round <= K.MAX_ROUNDS);
  }
});
t('3 and 4 player games work', () => {
  const st = S.play(9, ['verdant', 'crypt', 'tide', 'forge'], ['builder', 'balanced', 'builder', 'money']);
  assert.ok(st.over);
});
console.log('claudenspiel rules: ' + n + ' groups passed');
