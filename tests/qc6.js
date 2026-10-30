const D=require('../src/data.js'), E=require('../src/engine.js');
let st, R=[]; function A(a,soft){const r=E.apply(st,a); if(r.error){ if(soft) return; throw new Error(a.t+': '+r.error);} st=r;}
const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]); const ans=v=>A({t:'answer',v});
function game(a0,a1,a2){ const ps=[{name:'A',arch:a0},{name:'B',arch:a1||'Warmonger'}]; if(a2) ps.push({name:'C',arch:a2}); st=E.newGame(D.STARTER,{players:ps,seed:9}); }
const give=(id,p)=>{A({t:'sbGive',i:p||0,id}); const h=st.players[p||0].hand; return h[h.length-1];};
const top=k=>st.cards[E.top(st,k)];
// seat start
game('Archbishop','Hedonist','Gardener'); A({t:'startTurn'}); const a1=st.players[0].ap; A({t:'endTurn'}); A({t:'startTurn'}); const a2=st.players[1].ap; A({t:'endTurn'}); A({t:'startTurn'}); const a3=st.players[2].ap;
chk('Seat start', a1===3&&a2===6&&a3===9, 'first-turn ● by seat: '+[a1,a2,a3]);
// mausoleum, palace, obelisk
game('Cryptkeeper'); A({t:'startTurn'}); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbBury',id:'eureka',k:'0,0'});
chk('Mausoleum', E.cardValue(st,'0,0',0)===3, '3◇ per buried card ('+E.cardValue(st,'0,0',0)+')');
game('Hedonist'); A({t:'startTurn'}); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'fairgrounds',k:'5,5'}); chk('Palace', E.cardValue(st,'0,0',0)===4+3, '4 own + 3 for an outside Goblet ('+E.cardValue(st,'0,0',0)+')');
A({t:'sbPlace',id:'obelisk',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0}); chk('Obelisk', E.cardIncome(st,'1,0')===6, '6● per turn');
// warcamp reserves
game('Warmonger','Philosopher'); A({t:'startTurn'}); st.players[0].ap=99; A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'eureka',k:'1,1'}); A({t:'sbPlace',id:'sanctuary',k:'2,1'});
const ph=give('phalanx'); A({t:'play',uid:ph,k:'1,0'}); ans('1,1'); if(st.pending) ans(st.pending.options[0]);
chk('Warcamp', st.players[0].reserve===12&&st.players[0].tokens===4, 'Ruin gives 4◇ and 12 Reserves');
st.players[0].ap=0; const s=give('sanctuary'); const L=E.legalCells(st,s); const k=Object.keys(L).find(x=>L[x]<=12); A({t:'play',uid:s,k}); chk('Reserves', st.players[0].reserve===12-L[k], 'spent Reserves when ● ran out ('+st.players[0].reserve+' left)');
A({t:'endTurn'}); A({t:'startTurn'}); A({t:'endTurn'}); A({t:'startTurn'}); chk('Reserves', st.players[0].reserve===12-L[k], 'Reserves kept between turns');
// confessional
game('Hedonist','Archbishop'); A({t:'startTurn'}); st.players[0].ap=99; A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'confessional',k:'1,0'}); A({t:'sbPlace',id:'fairgrounds',k:'0,1'}); A({t:'sbClaim',k:'0,1',owner:0}); A({t:'sbBury',id:'mildew',k:'0,1'});
A({t:'ability',k:'1,0'}); ans('0,1'); chk('Confessional', st.players[0].tokens===3&&!E.isCursed(st,'0,1')&&st.players[1].hand.some(u=>st.cards[u].def==='mildew'), 'confessor +3◇, curse to the Archbishop’s hand');
game('Archbishop','Hedonist'); A({t:'startTurn'}); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'confessional',k:'1,0'}); give('mildew'); chk('Confessional', !E.abilityReady(st,'1,0'), 'Archbishop cannot confess from their own hand');
R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
