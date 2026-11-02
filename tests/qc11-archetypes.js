// Bots know what their archetype is playing for (src/bots.js profile/goal): each reads its Foundation's goal, keeps the
// cards that serve it, gets rid of cards it can't play, and the Warmonger spends its Reserves. Run: node tests/qc11-archetypes.js
const D=require('../src/data.js'), E=require('../src/engine.js'), B=require('../src/bots.js');
const R=[]; const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
const ARCH=['Archbishop','Hedonist','Warmonger','Cryptkeeper','Gardener','Philosopher'];
const game=(a0,a1,seed)=>E.newGame(D.STARTER,{players:[{name:'A',arch:a0},{name:'B',arch:a1}],seed:seed||3});
// Move a named card from the deck (or the other hand) into player p's hand; returns its uid.
function give(st,p,id){ let u=st.deck.find(x=>st.cards[x].def===id);
  if(u) st.deck.splice(st.deck.indexOf(u),1); else { st.players.forEach(q=>{ const i=q.hand.findIndex(x=>st.cards[x].def===id); if(i>=0&&!u){ u=q.hand[i]; q.hand.splice(i,1); } }); }
  st.players[p].hand.push(u); return u; }
const ask=(st,p,kind,options,count,prompt)=>{ const s=JSON.parse(JSON.stringify(st)); s.pending={kind,player:p,count,options,prompt:prompt||'Discard'}; return B.choose(s,p,'greedy'); };

// 1. Every archetype's goal is read from its Foundation.
const want={ Archbishop:['perSuitInKingdom','Sceptre','Tome',false], Hedonist:['perSuitSplit','Goblet','Sceptre',false], Warmonger:['none','Sword','Bone',true],
  Cryptkeeper:['perBuriedInKingdom','Bone','Leaf',false], Gardener:['largestRegion','Leaf','Goblet',false], Philosopher:['perDistinctSuitInKingdom','Tome','Sword',false] };
ARCH.forEach(a=>{ const g=B.profile(game(a,a===ARCH[0]?ARCH[1]:ARCH[0]),0), w=want[a];
  chk('Goal', g&&g.kind===w[0]&&g.suit===w[1]&&g.weak===w[2]&&g.war===w[3], a+' reads its goal ('+(g&&[g.kind,g.suit,'cannot play '+g.weak,g.war?'paid for War':''].join(' ').trim())+')'); });

// 2. Every archetype discards a card of its banned suit first.
const banned={ Archbishop:'scrying-pool', Hedonist:'tithing-hall', Warmonger:'embalm', Cryptkeeper:'overgrowth', Gardener:'ballroom', Philosopher:'halberd-strike' };
ARCH.forEach(a=>{ const st=game(a,a===ARCH[0]?ARCH[1]:ARCH[0]); const bad=give(st,0,banned[a]), ok=give(st,0,a==='Hedonist'?'alchemy-lab':'sanctuary');
  const d=E.rawDef(st,bad); const v=ask(st,0,'hand',[ok,bad],1);
  chk('Dead cards', d.suit===B.profile(st,0).weak && v[0]===bad, a+' discards '+d.name+' ('+d.suit+') before '+E.rawDef(st,ok).name); });

// 3. Each archetype keeps the cards its goal counts.
(function(){ let st=game('Archbishop','Hedonist'); const sc=give(st,0,'tithing-hall'), other=give(st,0,'den-of-sin');
  chk('Keeps', B.keepValue(st,0,sc,B.profile(st,0))>B.keepValue(st,0,other,B.profile(st,0)), 'Archbishop keeps Tithing Hall (Sceptre) over Den of Sin');
  const g1=give(st,1,'ballroom'), g2=give(st,1,'irrigation-canals');
  chk('Keeps', ask(st,1,'hand',[g1,g2],1)[0]===g2, 'Hedonist discards Irrigation Canals before Ballroom (Goblet)');
  st=game('Cryptkeeper','Gardener'); const act=give(st,0,'halberd-strike'), str=give(st,0,'alchemy-lab');
  chk('Keeps', ask(st,0,'hand',[act,str],1)[0]===str, 'Cryptkeeper keeps an Action (it gets buried once played) over a Structure');
  st=game('Philosopher','Gardener'); const p=B.profile(st,0); const tome=give(st,0,'scrying-pool'), leaf=give(st,0,'burrow');
  st.board['0,0']=[st.players[0].foundationUid]; st.cards[st.players[0].foundationUid].claimants=[0]; st.cards[st.players[0].foundationUid].fixed=true; st.players[0].foundationPlaced=true;
  st.players[0].hand=st.players[0].hand.filter(u=>u!==st.players[0].foundationUid);
  chk('Keeps', B.keepValue(st,0,leaf,p)>B.keepValue(st,0,tome,p), 'Philosopher with only Tome in its Kingdom keeps a Leaf card over another Tome card');
  st=game('Gardener','Archbishop'); const pl=give(st,0,'decay'), cast=give(st,0,'seizure');
  chk('Keeps', ask(st,0,'hand',[pl,cast],1)[0]===cast, 'Gardener keeps a card it can place on the board (to grow its region)');
  st=game('Hedonist','Archbishop'); const cheap=give(st,0,'brambles'), dear=give(st,0,'ballroom');
  chk('Keeps', ask(st,0,'hand',[cheap,dear],1,'Set a card aside. You may play it for free on your next turn.')[0]===dear, 'Last Will sets aside the best card, not the cheapest');
})();

// 4. The goal counts toward every move the bot weighs.
(function(){ const st=game('Archbishop','Hedonist'); const before=B.goal(st,0); const s2=JSON.parse(JSON.stringify(st)); give(s2,0,'tithing-hall'); give(s2,0,'communion');
  chk('Weighs', B.goal(s2,0)>before, 'holding Sceptre cards raises the Archbishop’s goal value ('+before.toFixed(1)+' to '+B.goal(s2,0).toFixed(1)+')'); })();

// 5. The Warmonger spends Reserves, swaps away dead cards, and every style of every archetype finishes games.
(function(){ let st=game('Warmonger','Gardener',11); const stats=B.newStats(), S=['tactician','greedy'];
  while(st.winner==null&&st.players[0].turns<3){ st=st.pending?B.resolve(st,st.cur,S[st.cur]):B.turn(st,stats,S); }
  while(st.cur!==0||st.pending) st=st.pending?B.resolve(st,st.cur,S[st.cur]):B.turn(st,stats,S);
  // Its turn started with no ● of its own left but 30● in Reserves and a strong card in hand: it should buy it with Reserves.
  let s1=E.apply(st,{t:'startTurn'}); s1.players[0].ap=0; s1.players[0].reserve=30; give(s1,0,'reconstructed-map');
  const r=B.turn(s1,B.newStats(),S);
  chk('Reserves', r&&(r.players[0].reserve||0)<30, 'with 0● and 30● in Reserves, a Warmonger bot still plays cards (Reserves 30 to '+(r&&r.players[0].reserve)+')');
  st.players[0].reserve=0; give(st,0,'embalm'); give(st,0,'decay');
  const s2=B.turn(JSON.parse(JSON.stringify(st)),B.newStats(),S);
  chk('Swap', s2&&s2.log.some(l=>/^A discards 2 cards and draws/.test(l)), 'holding two Bone cards, the Warmonger uses Discard 2, draw 1'); })();
let unfinished=[];
ARCH.forEach((a,i)=>['greedy','tactician','raider','warlord'].forEach((s,j)=>{ const o=ARCH[(i+1+j)%6]; let st=game(a,o,40+i*4+j); const stats=B.newStats(), S=[s,'tactician']; let g=0;
  while(st&&st.winner==null&&st.round<=30&&g++<300) st=st.pending?B.resolve(st,st.cur,S[st.cur]):B.turn(st,stats,S);
  if(!st||st.winner==null) unfinished.push(a+'/'+s); }));
chk('Games', !unfinished.length, 'all 24 archetype × style games finish'+(unfinished.length?' ('+unfinished.join(', ')+')':''));

R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
if(R.some(r=>r[1]==='FAIL')) process.exitCode=1;
