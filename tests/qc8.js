// Online play support: the resign action and redact() (what each player is allowed to see).
// Run: node tests/qc8.js
const D=require('../src/data.js'), E=require('../src/engine.js');
let st, R=[]; function A(a){const r=E.apply(st,a); if(r.error) throw new Error(a.t+': '+r.error); st=r;}
const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]); const ans=v=>A({t:'answer',v});
function T(n,f){ try{f()}catch(e){R.push([n,'FAIL','threw '+e.message])} }
function game(n){ const A3=['Archbishop','Hedonist','Warmonger']; st=E.newGame(D.STARTER,{players:A3.slice(0,n||2).map((a,i)=>({name:'P'+i,arch:a})),seed:4}); }

T('Redact',()=>{ game(3); A({t:'startTurn'});
  const v=E.redact(st,1), mine=st.players[1].hand, other=v.players[0].hand;
  chk('Redact', JSON.stringify(v.players[1].hand)===JSON.stringify(mine) && mine.every(u=>v.cards[u]), 'own hand intact');
  chk('Redact', other.length===st.players[0].hand.length && other.filter(u=>v.cards[u].def==='__hidden').length===other.length-1, 'other hand hidden except the Foundation');
  chk('Redact', other.includes(st.players[0].foundationUid), 'Foundation stays visible');
  chk('Redact', v.deck.length===st.deck.length && v.deck.every(u=>u===null) && v.seed===0, 'deck order and seed hidden');
  const real=st.players[0].hand.filter(u=>u!==st.players[0].foundationUid);
  chk('Redact', real.every(u=>!v.cards[u]) && st.deck.every(u=>!v.cards[u]), 'hidden cards removed from the card table');
  chk('Redact', E.abilityReady(v,'0,0')===false && v.players[0].hand.every(u=>E.rawDef(v,u)), 'helpers still work on the redacted state');
  chk('Redact', st.deck[0]!==null, 'the real state is untouched'); });

T('Resign',()=>{ game(3); A({t:'startTurn'}); A({t:'resign',p:0});
  chk('Resign', st.players[0].out && st.cur===1 && !st.turn.started, 'current player resigns: next player is up');
  A({t:'resign',p:2}); chk('Resign', st.winner===1, 'last player standing wins');
  game(2); A({t:'startTurn'}); A({t:'resign',p:1}); chk('Resign', st.winner===0 && st.log.some(l=>/P1 leaves the game/.test(l)), 'other player resigns: game over');
  game(3); A({t:'startTurn'}); let bad=E.apply(st,{t:'resign',p:5}); chk('Resign', !!bad.error, 'unknown player rejected'); });

T('Resign mid-effect',()=>{ game(2); A({t:'startTurn'}); st.players[0].ap=99; A({t:'play',uid:st.players[0].foundationUid,k:'0,0'});
  A({t:'sbPlace',id:'sanctuary',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:1}); for(let i=0;i<4;i++) A({t:'sbGive',i:1,id:'eureka'});
  A({t:'sbGive',i:0,id:'portcullis'}); const pc=st.players[0].hand[st.players[0].hand.length-1]; A({t:'play',uid:pc,k:'1,1'}); ans('1,0');
  chk('Resign mid-effect', st.pending && st.pending.player===1, 'victim must discard'); A({t:'resign',p:1});
  chk('Resign mid-effect', !st.pending && !st.res && st.winner===0, 'effect dropped, game over'); });

R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
