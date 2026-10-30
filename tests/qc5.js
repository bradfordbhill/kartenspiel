// Curse cards (Mildew, Intoxicate, Fortune Teller, Tunnel, Usurp, ...) and You’ll Regret That.
// Run: node tests/qc5.js
const D=require('../src/data.js'), E=require('../src/engine.js');
let st, R=[]; function A(a){const r=E.apply(st,a); if(r.error) throw new Error(a.t+': '+r.error); st=r;}
const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
function game(a0,a1){ st=E.newGame(D.STARTER,{players:[{name:'A',arch:a0},{name:'B',arch:a1||'Warmonger'}],seed:7}); A({t:'startTurn'}); st.players[0].ap=99; A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); }
const give=(id,p)=>{A({t:'sbGive',i:p||0,id}); const h=st.players[p||0].hand; return h[h.length-1];};
const top=k=>st.cards[E.top(st,k)], ans=v=>A({t:'answer',v});
function T(n,f){ try{f()}catch(e){R.push([n,'FAIL','threw '+e.message])} }
console.log('library size', D.STARTER.length);
T('Mildew',()=>{ game('Gardener','Archbishop'); A({t:'sbPlace',id:'acorn',k:'1,0'}); A({t:'sbPlace',id:'reconstructed-map',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1});
  const m=give('mildew'); A({t:'cast',uid:m}); ans('2,0'); chk('Mildew',E.cardValue(st,'2,0',1)===4,'8◇ halved to '+E.cardValue(st,'2,0',1)); chk('Mildew',E.isCursed(st,'2,0'),'tucked as Curse'); });
T('Intoxicate',()=>{ game('Hedonist'); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); const x=give('intoxicate'); A({t:'cast',uid:x}); ans('1,0');
  chk('Intoxicate',E.cardIncome(st,'1,0')===9&&E.overwhelmCount(st,'1,0').th===2,'income 6→'+E.cardIncome(st,'1,0')+', Overwhelm 3→'+E.overwhelmCount(st,'1,0').th); });
T('Fortune Teller',()=>{ game('Hedonist'); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); const s=st.defs[st.cards[st.deck[0]].def].suit; const f=give('fortune-teller'); A({t:'cast',uid:f}); ans(s);
  chk('Fortune Teller',st.pending&&st.pending.kind==='cell','fortune holds: may Curse'); ans('1,0'); chk('Fortune Teller',E.noIncome(st,'1,0'),'target produces no ●');
  game('Hedonist'); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); const s2=st.defs[st.cards[st.deck[0]].def].suit, other=['Sceptre','Goblet','Sword','Bone','Leaf','Tome'].find(x=>x!==s2); const f2=give('fortune-teller'); A({t:'cast',uid:f2}); ans(other);
  chk('Fortune Teller',!st.pending&&!E.isCursed(st,'1,0'),'fortune fails: nothing cursed, card discarded'); });
T('Tunnel',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'phalanx',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1});
  ['convert','inquisition'].forEach(id=>A({t:'sbBury',id,k:'2,0'})); A({t:'sbCheck'}); const had=top('2,0').dtok;
  const t=give('tunnel'); A({t:'cast',uid:t}); ans('2,0'); chk('Tunnel',had===1&&top('2,0').dtok===0&&st.board['2,0'].length===2,'Defense gone, buried cards removed (Tunnel itself now tucked)'); });
T('Usurp',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:1}); const u=give('usurp'); A({t:'cast',uid:u}); ans('1,0');
  chk('Usurp',top('1,0').claimants.includes(0)&&top('1,0').claimants.includes(1),'both players claim it'); });
T('Raven’s Beak',()=>{ game('Cryptkeeper'); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); const r=give('ravens-beak'); A({t:'cast',uid:r}); ans('1,0'); chk('Raven’s Beak',E.overwhelmCount(st,'1,0').th===2,'Overwhelm 3→2'); });
T('Eye of Newt',()=>{ game('Cryptkeeper'); A({t:'sbPlace',id:'sanctuary',k:'5,5'}); const e=give('eye-of-newt'); A({t:'cast',uid:e}); chk('Eye of Newt',st.pending.options.includes('5,5'),'card with 3+ empty sides'); ans('5,5');
  const s=give('fairgrounds'); const L=E.legalCells(st,s); chk('Eye of Newt',L['6,5']===12,'spaces around it cost +3 (9→'+L['6,5']+')'); });
T('Exile',()=>{ game('Archbishop','Hedonist'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:1}); const x=give('exile'); A({t:'cast',uid:x}); ans('1,0');
  chk('Exile',!top('1,0').claimants.length&&st.players[1].meeples===8,'claim removed, meeple home'); });
T('You’ll Regret That',()=>{ game('Warmonger','Archbishop'); A({t:'endTurn'}); A({t:'startTurn'}); st.players[1].ap=99; A({t:'play',uid:st.players[1].foundationUid,k:'0,1'}); A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1});
  const y=give('youll-regret-that',1); chk('You’ll Regret That',!!E.playBlock(st,1,y),'cannot be played normally'); A({t:'endTurn'}); A({t:'startTurn'}); st.players[0].ap=99;
  const t=give('trebuchet'); A({t:'play',uid:t,k:'-1,0'}); ans('2,0'); chk('You’ll Regret That',st.pending&&st.pending.kind==='confirm'&&st.pending.player===1,'victim is asked'); ans(true);
  chk('You’ll Regret That',E.noIncome(st,'-1,0')&&!st.players[1].hand.includes(y),'Trebuchet cursed'); });
T('Overwhelming Evidence',()=>{ game('Philosopher'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbRuin',k:'1,0'}); const o=give('overwhelming-evidence'); A({t:'cast',uid:o}); ans('1,0'); ans(true);
  chk('Overwhelming Evidence',!top('1,0').ruined&&E.suitOf(st,E.top(st,'1,0'))==='Tome'&&top('1,0').claimants[0]===0,'restored as Tome and claimed'); });
T('Deep Thought',()=>{ game('Philosopher'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); const d=give('deep-thought'); A({t:'cast',uid:d}); ans('1,0'); chk('Deep Thought',E.cardIncome(st,'1,0')===2,'3● halved up to '+E.cardIncome(st,'1,0')); });
T('Overgrowth',()=>{ game('Gardener'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbRuin',k:'1,0'}); const g=give('overgrowth'); A({t:'play',uid:g,k:'0,1'}); chk('Overgrowth',st.pending&&st.pending.options.includes('1,0'),'offers the Ruined card'); ans('1,0');
  chk('Overgrowth',st.defs[top('1,0').def].id==='overgrowth'&&!E.top(st,'0,1'),'took its place'); A({t:'claim',k:'1,0'}); chk('Overgrowth',top('1,0').claimants[0]===0,'claimable where it landed'); });
R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
