const D=require('../src/data.js'), E=require('../src/engine.js');
let st, R=[]; function A(a){const r=E.apply(st,a); if(r.error) throw new Error(a.t+': '+r.error); st=r;}
const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
function game(a0,a1,opts){ st=E.newGame(D.STARTER,Object.assign({players:[{name:'A',arch:a0},{name:'B',arch:a1||'Warmonger'}],seed:3},opts||{})); A({t:'startTurn'}); st.players[0].ap=99; }
const give=(id,p)=>{A({t:'sbGive',i:p||0,id}); const h=st.players[p||0].hand; return h[h.length-1];};
const top=k=>st.cards[E.top(st,k)];
// (1) burial raises Overwhelm number
game('Archbishop'); A({t:'sbPlace',id:'sanctuary',k:'5,5'}); A({t:'sbBury',id:'convert',k:'5,5'}); A({t:'sbBury',id:'acorn',k:'5,5'});
chk('Burial → Overwhelm', E.overwhelmCount(st,'5,5').th===4, 'one same-suit card buried: 3 → '+E.overwhelmCount(st,'5,5').th);
game('Archbishop',null,{burySuitOW:false}); A({t:'sbPlace',id:'sanctuary',k:'5,5'}); A({t:'sbBury',id:'convert',k:'5,5'}); chk('Burial → Overwhelm (off)', E.overwhelmCount(st,'5,5').th===3,'toggle off keeps 3');
// (2) defense tokens
game('Warmonger','Archbishop'); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'sanctuary',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:1});
A({t:'sbBury',id:'convert',k:'1,0'}); A({t:'sbBury',id:'inquisition',k:'1,0'}); A({t:'sbCheck'});
chk('Defense', top('1,0').dtok===1, 'two on-suit buried → 1 token ('+top('1,0').dtok+')');
const h=give('halberd-strike'); A({t:'cast',uid:h}); A({t:'answer',v:'1,0'}); if(st.pending) A({t:'answer',v:st.pending.options[0]});
chk('Defense', !top('1,0').ruined && top('1,0').dtok===0, 'Ruin absorbed, token spent');
A({t:'sbPlace',id:'sanctuary',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:0});
// (3) adjacent discount
game('Archbishop'); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); const s=give('sanctuary'); const L=E.legalCells(st,s); chk('Discount', L['1,0']===9, 'Sanctuary 12● next to your Foundation costs '+L['1,0']);
game('Archbishop',null,{adjDiscount:false}); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); const s2=give('sanctuary'); chk('Discount (off)', E.legalCells(st,s2)['1,0']===12,'toggle off');
// (4) no wandering
game('Hedonist'); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); const c=give('spice-caravan'); A({t:'play',uid:c,k:'0,1'}); A({t:'claim',k:'0,1'});
chk('Spice Caravan', E.cardIncome(st,'0,1')===8, '8● per turn'); A({t:'endTurn'}); chk('No wandering', E.top(st,'0,1')&&st.defs[top('0,1').def].id==='spice-caravan', 'Caravan stays put rather than leave the pack');
game('Hedonist',null,{noWander:false}); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); const c2=give('spice-caravan'); A({t:'play',uid:c2,k:'0,1'}); A({t:'claim',k:'0,1'}); A({t:'endTurn'}); chk('No wandering (off)', !E.top(st,'0,1'),'toggle off: it wanders');
// (6) ascension
game('Philosopher','Warmonger'); A({t:'play',uid:st.players[0].foundationUid,k:'0,0'}); A({t:'sbPlace',id:'fairgrounds',k:'1,0'}); A({t:'sbClaim',k:'1,0',owner:0});
['convert','acorn','phalanx','embalm'].forEach(id=>A({t:'sbBury',id,k:'1,0'})); A({t:'sbCheck'});
const f=top('1,0'); chk('Ascension', f.ascended, 'five suits in the stack'); chk('Ascension', E.cardValue(st,'1,0',0)===12 && E.cardIncome(st,'1,0')===15, 'value 4+8, income 3+12');
chk('Ascension', E.hasSuit(st,f.uid,'Tome')&&E.hasSuit(st,f.uid,'Bone'), 'counts as all suits'); chk('Ascension', E.cardValue(st,'0,0',0)===30, 'Observatory sees 6 suits ('+E.cardValue(st,'0,0',0)+')');
A({t:'endTurn'}); A({t:'startTurn'}); st.players[1].ap=99; const t=give('halberd-strike',1); A({t:'sbPlace',id:'phalanx',k:'2,0'}); A({t:'sbClaim',k:'2,0',owner:1}); A({t:'cast',uid:t});
chk('Ascension', !st.pending || !st.pending.options.includes('1,0'), 'cannot be targeted');
R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
