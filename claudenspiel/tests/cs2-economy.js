// Claudenspiel 0.2 rules: Grounds (Marsh, Battlefield, Crossroads), banking, the bought second claim, and the
// Obelisk and Fountain changes. Run: node tests/cs2-economy.js
const D=require('../src/data.js'), E=require('../src/engine.js');
const R=[]; const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
const game=(archs,opts)=>E.newGame(D.STARTER,Object.assign({players:archs.map((a,i)=>({name:'P'+i,arch:a})),seed:11},opts||{}));
const must=(st,a)=>{ const n=E.apply(st,a); if(n.error) throw new Error(a.t+': '+n.error); return n; };
const tryA=(st,a)=>E.apply(st,a);
const put=(st,id,k,owner)=>{ st=must(st,{t:'sbPlace',id,k}); if(owner!=null) st=must(st,{t:'sbClaim',k,owner}); return st; };
const take=(st,id,p)=>{ const u=Object.keys(st.cards).find(x=>st.cards[x].def===id&&(st.deck.includes(x)||st.players.some(q=>q.hand.includes(x)))); if(st.deck.includes(u)) st.deck.splice(st.deck.indexOf(u),1); st.players.forEach(q=>{ const i=q.hand.indexOf(u); if(i>=0) q.hand.splice(i,1); }); st.players[p].hand.push(u); return u; };

// 1. Grounds. (The archetype ban applies to them too: a Gardener can't place a Goblet Crossroads.)
let st=game(['Gardener','Warmonger']);
st=put(st,'orchard','0,0',0); st=put(st,'sanctuary','1,0',0); st=put(st,'marsh','2,0');
const base=E.overwhelmCount(game(['Gardener','Warmonger']) && put(put(game(['Gardener','Warmonger']),'orchard','0,0',0),'sanctuary','1,0',0),'1,0').th;
chk('Grounds', E.overwhelmCount(st,'1,0').th===base+1, 'a card next to Marsh needs one more enemy to be Overwhelmed ('+base+' → '+E.overwhelmCount(st,'1,0').th+')');
st=put(st,'battlefield','1,1');
chk('Grounds', E.overwhelmCount(st,'1,0').th===base, 'a Battlefield beside it takes that back');
chk('Grounds', E.overwhelmCount(st,'2,0').th===99&&E.overwhelmCount(st,'2,0').n===0, 'Grounds themselves are never Overwhelmed');
const sw=game(['Gardener','Archbishop']); let s2=put(put(sw,'cathedral','0,0',1),'communion','1,0',1); s2=put(s2,'battlefield','2,0');
chk('Grounds', E.overwhelmCount(s2,'1,0').n===0, 'a Sword Grounds card never counts as an enemy');
st=must(st,{t:'startTurn'}); const mu=take(st,'marsh',0); const mk=Object.keys(E.legalCells(st,mu))[0]; st=must(st,{t:'play',uid:mu,k:mk});
chk('Grounds', E.top(st,mk)===mu, 'Grounds are placed on the board like a Structure');
st=game(['Philosopher','Warmonger']); st=put(st,'observatory','0,0',0); st=must(st,{t:'startTurn'}); st.players[0].ap=30;
const cr=take(st,'crossroads',0), crk='0,1';
st=must(st,{t:'play',uid:cr,k:crk});
chk('Grounds', E.claimOptions(st,0).indexOf(crk)<0, 'nobody can claim a Grounds card');
const fair=take(st,'fairgrounds',0), L=E.legalCells(st,fair);
chk('Grounds', L['1,1']===9-3, 'placing Fairgrounds (9●) next to Crossroads costs 3● less ('+L['1,1']+'●)');

// 2. Banking.
st=game(['Gardener','Warmonger'],{seatTokens:0}); st=must(st,{t:'startTurn'}); st.players[0].ap=13; st=must(st,{t:'endTurn'});
chk('Banking', st.players[0].tokens===2&&st.log.some(l=>/banks 2◇ from unspent ●/.test(l)), '13● left unspent banks 2◇ (every full 6●)');
st=game(['Gardener','Warmonger'],{seatTokens:0}); st=must(st,{t:'startTurn'}); st.players[0].ap=40; st=must(st,{t:'endTurn'});
chk('Banking', st.players[0].tokens===2, 'at most 2◇ a turn');
st=game(['Gardener','Warmonger'],{seatTokens:0}); st=must(st,{t:'startTurn'}); st.players[0].ap=5; st=must(st,{t:'endTurn'});
chk('Banking', (st.players[0].tokens||0)===0, 'less than 6● banks nothing');
st=game(['Gardener','Warmonger'],{banking:false,seatTokens:0}); st=must(st,{t:'startTurn'}); st.players[0].ap=20; st=must(st,{t:'endTurn'});
chk('Banking', (st.players[0].tokens||0)===0, 'switched off, nothing is banked');

// 3. The bought claim.
st=game(['Philosopher','Warmonger']); st=put(st,'observatory','0,0',0); st=must(st,{t:'startTurn'}); st.players[0].ap=40;
chk('Second claim', !!tryA(st,{t:'buyClaim'}).error, 'can’t buy one before using the first claim');
const a1=take(st,'fairgrounds',0); st=must(st,{t:'play',uid:a1,k:'1,0'}); st=must(st,{t:'claim',k:'1,0'});
const a2=take(st,'sanctuary',0); st=must(st,{t:'play',uid:a2,k:'2,0'});
chk('Second claim', !!tryA(st,{t:'claim',k:'2,0'}).error, 'without buying, the second claim is refused');
const apBefore=st.players[0].ap; st=must(st,{t:'buyClaim'});
chk('Second claim', st.players[0].ap===apBefore-E.CLAIM_PRICE, 'buying costs '+E.CLAIM_PRICE+'●');
st=must(st,{t:'claim',k:'2,0'});
chk('Second claim', E.kingdom(st,0).includes('2,0'), 'then the next claim goes through');
chk('Second claim', !!tryA(st,{t:'buyClaim'}).error, 'only one bought claim a turn');
st=game(['Philosopher','Warmonger'],{buyClaim:false}); st=put(st,'observatory','0,0',0); st=must(st,{t:'startTurn'}); st.players[0].ap=40; const b1=take(st,'fairgrounds',0); st=must(st,{t:'play',uid:b1,k:'1,0'}); st=must(st,{t:'claim',k:'1,0'});
chk('Second claim', !!tryA(st,{t:'buyClaim'}).error, 'switched off, it is refused');

// 3b. The bought claim is paid from this turn's ●, never from Reserves.
st=game(['Warmonger','Gardener']); st=put(st,'warcamp','0,0',0); st=must(st,{t:'startTurn'}); st.players[0].ap=0; st.players[0].reserve=40;
const w1=take(st,'rear-guard',0); st=must(st,{t:'play',uid:w1,k:'1,0'}); st=must(st,{t:'claim',k:'1,0'});
chk('Second claim', /Reserves/.test(tryA(st,{t:'buyClaim'}).error||''), 'Reserves can’t pay for the second claim');

// 3c. The seat handicap: earlier seats start with 3◇ for every seat after them.
const s3=game(['Gardener','Warmonger','Hedonist']);
chk('Seat handicap', s3.players.map(q=>q.tokens).join(',')==='6,3,0', '3 players start on 6◇, 3◇ and 0◇');
chk('Seat handicap', game(['Gardener','Warmonger']).players.every(q=>!q.tokens), 'two players get none (they are already even)');
chk('Seat handicap', game(['Gardener','Warmonger','Hedonist'],{seatTokens:0}).players.every(q=>!q.tokens), 'it can be switched off (seatTokens 0)');

// 4. Card changes.
const ob=D.STARTER.find(c=>c.id==='obelisk'), fo=D.STARTER.find(c=>c.id==='fountain');
chk('Cards', ob.score.n===6, 'Obelisk is worth 6◇ (12◇ surrounded)');
chk('Cards', fo.score.n===3&&fo.place.length===4, 'Fountain: 3◇ per Leaf neighbour, and it can join on any side');

R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
if(R.some(r=>r[1]==='FAIL')) process.exitCode=1;
