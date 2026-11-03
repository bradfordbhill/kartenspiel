// Claudenspiel 0.1 rules: the last round, the 116-card deck, Observatory's six-suit bonus, Orchard at 3◇,
// reaction cards that can also be played, and storage kept apart from Kartenspiel's. Run: node tests/cs1-rules.js
const D=require('../src/data.js'), E=require('../src/engine.js'), fs=require('fs'), path=require('path');
const R=[]; const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
const game=(archs,opts)=>E.newGame(D.STARTER,Object.assign({players:archs.map((a,i)=>({name:'P'+i,arch:a})),seed:7},opts||{}));
const must=(st,a)=>{ const n=E.apply(st,a); if(n.error) throw new Error(a.t+': '+n.error); return n; };
const turnWith=(st,tokens)=>{ st=must(st,{t:'startTurn'}); st.players[st.cur].tokens=tokens; return must(st,{t:'endTurn'}); };

// 1. The last round (and Seat start is off by default: equal turns already make up for moving later).
let st=game(['Gardener','Hedonist','Philosopher']);
st=turnWith(st,60);
chk('Last round', st.winner==null&&st.lastRound&&st.lastRound.by===0&&st.cur===1, 'seat 1 reaching the target starts the last round instead of winning');
chk('Last round', st.log.some(l=>/the last round begins/.test(l)), 'the log announces it');
st=turnWith(st,10);
chk('Last round', st.winner==null&&st.cur===2, 'the round carries on to the last seat');
st=turnWith(st,70);
chk('Last round', st.winner===2, 'when the round is over, the highest total wins (the last seat, 70◇ against 60◇)');
st=game(['Gardener','Hedonist']); st=turnWith(st,55); st=turnWith(st,55);
chk('Last round', st.winner===0, 'a tie goes to whoever reached the target first');
st=game(['Gardener','Hedonist']); st=turnWith(st,10); st=turnWith(st,50);
chk('Last round', st.winner===1, 'reaching it in the last seat ends the game at once');
st=game(['Gardener','Hedonist'],{lastRound:false}); st=turnWith(st,60);
chk('Last round', st.winner===0, 'with the rule switched off, the classic rule applies (win at once)');

chk('Seat start', game(['Gardener','Hedonist']).opts.seatStart===false, 'Seat start is off by default');

// 2. The deck.
st=game(['Gardener','Hedonist']);
const inPlay=st.deck.length+st.players.reduce((a,p)=>a+p.hand.filter(u=>u!==p.foundationUid).length,0);
chk('Deck', inPlay===122, 'the deck holds 122 cards: 116, plus 6 Grounds from 0.2 ('+inPlay+')');
const bySuit={}; D.STARTER.forEach(c=>{ if(c.type!=='Foundation'&&c.type!=='Grounds') bySuit[c.suit]=(bySuit[c.suit]||0)+c.copies; });
chk('Deck', Object.values(bySuit).every(n=>n>=18&&n<=20), 'every suit has 18 to 20 cards besides Grounds ('+JSON.stringify(bySuit)+')');
chk('Deck', ['obelisk','watchtower','communion','sleeping-giant'].every(id=>D.STARTER.find(c=>c.id===id).copies===1), 'the strongest and strangest cards stay single');

// 3. Foundations.
st=game(['Philosopher','Gardener']); const pf=st.players[0].foundationUid;
st=must(st,{t:'sbPlace',id:'observatory',k:'0,0',owner:0});
['acorn','fairgrounds','sanctuary','encampment'].forEach((id,i)=>{ st=must(st,{t:'sbPlace',id,k:(i+1)+',0'}); st=must(st,{t:'sbClaim',k:(i+1)+',0',owner:0}); });
const v5=E.cardValue(st,'0,0',0);
chk('Observatory', v5===25, 'five suits (with Observatory’s own Tome): 5◇ each = 25 ('+v5+')');
st=must(st,{t:'sbPlace',id:'decay',k:'5,0'}); st=must(st,{t:'sbClaim',k:'5,0',owner:0});
chk('Observatory', E.cardValue(st,'0,0',0)===40, 'all six suits: 30 + 10 = 40 ('+E.cardValue(st,'0,0',0)+')');
chk('Orchard', D.STARTER.find(c=>c.id==='orchard').score.n===3, 'Orchard scores 3◇ a card');

// 4. Reaction cards with a normal play.
st=game(['Warmonger','Gardener']); st=must(st,{t:'startTurn'});
const take=id=>{ const u=Object.keys(st.cards).find(x=>st.cards[x].def===id&&(st.deck.includes(x)||st.players.some(q=>q.hand.includes(x)))); if(st.deck.includes(u)) st.deck.splice(st.deck.indexOf(u),1); st.players.forEach(q=>{ const i=q.hand.indexOf(u); if(i>=0) q.hand.splice(i,1); }); st.players[0].hand.push(u); return u; };
const rv=take('revenge'); const h0=st.players[0].hand.length;
chk('Revenge', !E.playBlock(st,0,rv), 'Revenge can be played from hand');
st=must(st,{t:'cast',uid:rv}); let guard=0; while(st.pending&&guard++<4) st=must(st,{t:'answer',v:st.pending.kind==='hand'?st.pending.options.slice(0,st.pending.count):(st.pending.options||[])[0]});
chk('Revenge', st.players[0].hand.length===h0-1+2-1, 'it draws 2 and discards 1 (hand '+h0+' → '+st.players[0].hand.length+')');
const br=take('brambles');
chk('Brambles', !E.playBlock(st,0,br), 'Brambles can be placed like any Structure');
chk('Reactions', !!E.playBlock(st,0,take('youll-regret-that')), 'You’ll Regret That is still a reaction only');

// 5. Kept apart from Kartenspiel.
const src=['ui.js','engine.js','bots.js','cardface.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8')).join('\n');
chk('Separate', !/['"`]ks\.[a-zA-Z]+['"`]/.test(src), 'no Kartenspiel storage keys (ks.*): saves, settings and painted cards stay apart');
chk('Separate', (src.match(/'cs\.[a-zA-Z]+'/g)||[]).length>10, 'Claudenspiel keeps its own keys (cs.*)');

R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
if(R.some(r=>r[1]==='FAIL')) process.exitCode=1;
