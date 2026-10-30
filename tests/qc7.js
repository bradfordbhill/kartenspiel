// Abilities, reactions and burial effects: Royal Seal, Artillery, Scrying Pool, Repent, Brambles,
// Standard Bearer, Destroying Angel, Decay, and others. Run: node tests/qc7.js
const D=require('../src/data.js'), E=require('../src/engine.js');
let st, R=[]; function A(a){const r=E.apply(st,a); if(r.error) throw new Error(a.t+': '+r.error); st=r;}
const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]); const ans=v=>A({t:'answer',v});
function T(n,f){ try{f()}catch(e){R.push([n,'FAIL','threw '+e.message])} }
function game(a0,a1){ st=E.newGame(D.STARTER,{players:[{name:'A',arch:a0},{name:'B',arch:a1||'Warmonger'}],seed:11}); A({t:'startTurn'}); st.players[0].ap=99; A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); }
const give=(id,p)=>{A({t:'sbGive',i:p||0,id}); const h=st.players[p||0].hand; return h[h.length-1];};
const top=k=>st.cards[E.top(st,k)], nm=k=>st.defs[top(k).def].name;
function toB(){ A({t:'endTurn'}); A({t:'startTurn'}); st.players[1].ap=99; if(!st.players[1].foundationPlaced) A({t:'play',uid:st.players[1].foundationUid,k:'0,-1'}); }
T('Royal Seal',()=>{ game('Hedonist'); A({t:'sbPlace',id:'reconstructed-map',k:'1,0'}); const n0=st.players[0].hand.length; const r=give('royal-seal'); A({t:'cast',uid:r}); ans('1,0');
  while(st.pending){ const pd=st.pending; ans(pd.kind==='hand'?[ (pd.options||st.players[0].hand)[0] ]:pd.options?pd.options[0]:true); }
  chk('Royal Seal', top('1,0').claimants[0]===0 && st.log.some(l=>/placement effect triggers again/.test(l)), 'claimed and Map’s draw/discard re-ran'); });
T('Artillery',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'artillery',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1});
  chk('Artillery', E.abilityReady(st,'1,0'), 'ready next to an enemy card'); A({t:'ability',k:'1,0'}); ans('2,0'); chk('Artillery', top('2,0').ruined, 'paid 6● and Ruined it'); });
T('Scrying Pool',()=>{ game('Philosopher'); A({t:'sbPlace',id:'scrying-pool',k:'0,1'}); A({t:'sbClaim',k:'0,1',owner:0}); A({t:'sbPlace',id:'reconstructed-map',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0});
  const ap0=st.players[0].ap; A({t:'ability',k:'0,1'}); ans('1,0'); while(st.pending){ const pd=st.pending; ans(pd.kind==='hand'?[(pd.options||st.players[0].hand)[0]]:pd.options?pd.options[0]:true); }
  chk('Scrying Pool', st.players[0].ap===ap0-3 && st.log.some(l=>/triggers again/.test(l)), 'paid 3● and replayed'); });
T('Repent',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1}); A({t:'sbPlace',id:'acorn',k:'1,1'}); A({t:'sbClaim',k:'1,1',owner:1});
  give('repent',1); const h=give('halberd-strike'); A({t:'cast',uid:h}); ans('2,0'); if(st.pending&&st.pending.kind==='cell'&&st.pending.verb==='bury') ans(st.pending.options[0]);
  chk('Repent', st.pending&&st.pending.kind==='confirm'&&st.pending.player===1, 'victim’s opponent may Repent'); ans(true); chk('Repent', st.pending&&st.pending.options.includes('1,0'), 'targets the attacker’s card next to own'); ans('1,0');
  chk('Repent', top('1,0').ruined && st.players[1].debt===3, 'Ruined; 3● owed next turn'); while(st.pending) ans(st.pending.kind==='confirm'?false:st.pending.options[0]); A({t:'endTurn'}); A({t:'startTurn'}); chk('Repent', st.log.some(l=>/owed for reactions/.test(l)), 'debt paid at turn start'); });
T('Front Lines',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'front-lines',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); A({t:'sbPlace',id:'sanctuary',k:'2,1'}); A({t:'sbClaim',k:'2,1',owner:1}); A({t:'sbPlace',id:'acorn',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1});
  chk('Front Lines', E.cardValue(st,'1,0',0)===4, '2◇ × 2 enemy neighbours incl. diagonal'); });
T('Vineyard',()=>{ game('Hedonist'); A({t:'sbPlace',id:'vineyard',k:'1,0'}); A({t:'sbPlace',id:'acorn',k:'2,0'}); A({t:'sbBury',id:'burrow',k:'1,0'}); chk('Vineyard', E.cardValue(st,'1,0',0)===4, 'adjacent + buried Leaf'); });
T('Post Office',()=>{ game('Philosopher'); A({t:'sbPlace',id:'post-office',k:'1,0'}); A({t:'sbPlace',id:'acorn',k:'2,0'}); A({t:'sbPlace',id:'eureka',k:'1,1'}); A({t:'sbBury',id:'convert',k:'1,0'}); chk('Post Office', E.cardValue(st,'1,0',0)===4, 'Acorn + buried Convert; Tome neighbours don’t count ('+E.cardValue(st,'1,0',0)+')'); });
T('Bread and Circuses',()=>{ game('Hedonist'); ['1,0','2,0','3,0'].forEach(k=>A({t:'sbPlace',id:'acorn',k})); A({t:'sbRuin',k:'3,0'}); const b=give('bread-and-circuses'); A({t:'cast',uid:b}); ans('0,0'); if(st.pending) ans(st.pending.options[0]); chk('Bread and Circuses', st.players[0].tokens===2, '2 unbroken cards east'); });
T('Flowers',()=>{ game('Cryptkeeper'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); const f=give('flowers'); A({t:'cast',uid:f}); if(st.pending) ans('1,0'); chk('Flowers', E.cardIncome(st,'1,0')===6, 'Fairgrounds 3+3●'); });
T('Eye for an Eye',()=>{ game('Archbishop'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); const f=give('eye-for-an-eye'); A({t:'cast',uid:f}); if(st.pending) ans('1,0'); chk('Eye for an Eye', E.cardValue(st,'1,0',0)===7, '4+3◇'); });
T('Standard Bearer',()=>{ game('Warmonger','Archbishop'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); const f=give('standard-bearer'); A({t:'cast',uid:f}); if(st.pending) ans('1,0');
  A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbPlace',id:'phalanx',k:'1,1'}); A({t:'sbPlace',id:'tithe',k:'1,-1'}); A({t:'sbCheck'}); chk('Standard Bearer', !top('1,0').ruined, 'surrounded by enemies but not Overwhelmed'); });
T('Destroying Angel',()=>{ game('Gardener','Archbishop'); A({t:'sbPlace',id:'acorn',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); A({t:'sbPlace',id:'sanctuary',k:'2,0'}); const d=give('destroying-angel'); A({t:'cast',uid:d}); ans('2,0');
  chk('Destroying Angel', top('2,0').ruined && st.board['2,0'].length===2, 'Ruined and tucked under'); });
T('Brambles',()=>{ game('Warmonger','Gardener'); toB(); A({t:'endTurn'}); A({t:'startTurn'}); st.players[0].ap=99; give('brambles',1);
  A({t:'sbPlace',id:'fairgrounds',k:'5,5'}); A({t:'sbClaim',k:'5,5',owner:0}); A({t:'sbPlace',id:'phalanx',k:'6,5'}); const s=give('encampment'); A({t:'sbPlace',id:'halberd-strike',k:'5,4'}); A({t:'sbCheck'});
  chk('Brambles', st.pending&&st.pending.kind==='confirm'&&st.pending.player===1, 'offered when one away'); ans(true);
  chk('Brambles', nm('5,5')==='Brambles' && st.board['5,5'].length===2 && top('5,5').claimants[0]===1 && st.players[1].debt===3, 'buried target, claimed, 3● debt'); });
T('Decay',()=>{ game('Cryptkeeper'); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); const d=give('decay'); A({t:'play',uid:d,k:'2,0'}); ans('1,0'); chk('Decay', top('1,0').decay===1, 'token placed (no effect yet)'); });
R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
