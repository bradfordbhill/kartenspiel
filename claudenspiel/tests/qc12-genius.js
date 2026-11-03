// The Genius bot (src/bots.js): it plays legal, finished games, and it never cheats. Its decisions depend only on
// what its player can see: shuffling everything hidden from it (other hands, the deck) never changes what it does.
// Run: node tests/qc12-genius.js   (about a minute)
const D=require('../src/data.js'), E=require('../src/engine.js'), B=require('../src/bots.js');
const R=[]; const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
B.GENIUS.budget=400;
const game=(archs,seed)=>E.newGame(D.STARTER,{players:archs.map((a,i)=>({name:'P'+i,arch:a})),seed});
// A copy of st with every card hidden from seat p shuffled: other players' hands (not Foundations) and the deck.
function scramble(st,p,salt){ const s=JSON.parse(JSON.stringify(st)), slots=[];
  s.players.forEach((q,i)=>{ if(i!==p) q.hand.forEach((u,j)=>{ if(u!==q.foundationUid) slots.push([q.hand,j]); }); });
  s.deck.forEach((u,j)=>slots.push([s.deck,j]));
  const uids=slots.map(([a,j])=>a[j]); let r=salt; for(let i=uids.length-1;i>0;i--){ r=(r*1103515245+12345)%2147483648; const j=r%(i+1); [uids[i],uids[j]]=[uids[j],uids[i]]; }
  slots.forEach(([a,j],i)=>{ a[j]=uids[i]; }); return s; }
// Play bots until it's seat g's turn (not started) at round r.
function reach(st,g,r,strats){ let n=0; while(st.winner==null&&!(st.cur===g&&st.round>=r&&!(st.turn&&st.turn.started)&&!st.pending)&&n++<200){ st=st.pending?B.resolve(st,st.cur,strats[st.cur],strats):B.turn(st,B.newStats(),strats); } return st; }

// 1. No cheating: the same decisions however the hidden cards lie.
let same=0, tried=0, changedHidden=0, peeks=0;
[['Gardener','Hedonist',3],['Philosopher','Warmonger',4],['Cryptkeeper','Archbishop',2],['Hedonist','Gardener',5],['Warmonger','Philosopher',3],['Archbishop','Cryptkeeper',4],['Gardener','Warmonger',2],['Philosopher','Hedonist',5]].forEach(([a,b,r],i)=>{
  const strats=['tactician','tactician']; let st=reach(game([a,b],300+i),0,r,strats); if(st.winner!=null) return;
  st=E.apply(st,{t:'startTurn'});
  for(let salt=1;salt<=2;salt++){ const sc=scramble(st,0,salt*7919+i);
    if(JSON.stringify(sc.players[1].hand)!==JSON.stringify(st.players[1].hand)||JSON.stringify(sc.deck)!==JSON.stringify(st.deck)) changedHidden++;
    const A=JSON.stringify(B.plan(st,'genius')), Bp=JSON.stringify(B.plan(sc,'genius')); tried++; if(A===Bp) same++;
    // Control: the tactician's look-ahead plays on the full state, so it can be swayed by hidden cards.
    if(JSON.stringify(B.plan(st,'tactician'))!==JSON.stringify(B.plan(sc,'tactician'))) peeks++; } });
chk('Fair', tried>=6&&changedHidden===tried, 'the hidden cards really differ in every shuffled copy ('+changedHidden+'/'+tried+')');
chk('Fair', same===tried, 'the Genius makes the same moves whatever the hidden cards are ('+same+'/'+tried+' positions)');
chk('Fair', peeks>0, 'the check can catch a peek: the tactician (which looks ahead on the full state) changes its moves in '+peeks+'/'+tried+' of the same positions');

// 2. Its plans are legal in the real game, and whole games finish.
let bad=0, steps=0;
(function(){ let st=game(['Archbishop','Warmonger','Gardener'],77); const kinds=['genius','tactician','warlord'];
  for(let n=0;n<400&&st.winner==null&&st.round<=30;n++){
    if(st.pending){ const v=B.choose(st,st.pending.player,kinds[st.pending.player]); const x=E.apply(st,{t:'answer',v}); if(x.error){ bad++; st=B.resolve(st,st.pending.player,'tactician'); } else st=x; continue; }
    if(st.reveal){ st=E.apply(st,{t:'closeReveal'}); continue; }
    const acts=B.plan(st,kinds[st.cur]);
    for(const a of acts){ if(a.t==='answer'&&!(st.pending&&st.pending.player===st.cur)) break; const x=E.apply(st,a); steps++; if(x.error){ bad++; break; } st=x; if(st.pending) break; } }
  chk('Plays', bad===0, 'every Genius action is legal when played ('+steps+' actions, '+bad+' illegal)');
  chk('Plays', st.winner!=null, 'a 3-player game with a Genius finishes (winner '+(st.winner!=null?st.players[st.winner].name+', '+st.players[st.winner].arch:'none')+')'); })();
(function(){ const archs=['Archbishop','Hedonist','Warmonger','Cryptkeeper','Gardener','Philosopher']; let fin=0;
  archs.forEach((a,i)=>{ let st=game([a,archs[(i+3)%6]],900+i); const S=['genius','tactician']; let n=0;
    while(st&&st.winner==null&&st.round<=30&&n++<300) st=st.pending?B.resolve(st,st.cur,S[st.cur],S):B.turn(st,B.newStats(),S);
    if(st&&st.winner!=null) fin++; });
  chk('Plays', fin===6, 'a Genius of every archetype finishes its game ('+fin+'/6)'); })();

R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
if(R.some(r=>r[1]==='FAIL')) process.exitCode=1;
