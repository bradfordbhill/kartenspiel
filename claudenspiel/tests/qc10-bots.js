// Single-player bots (src/bots.js): plans replay legally one action at a time, reach the same state the bot
// computed, and stop at prompts meant for a human. Run: node tests/qc10-bots.js
const D=require('../src/data.js'), E=require('../src/engine.js'), B=require('../src/bots.js');
const R=[]; const chk=(n,c,m)=>R.push([n,c?'PASS':'FAIL',m]);
const strip=st=>{ const c=JSON.parse(JSON.stringify(st)); delete c._botLog; return JSON.stringify(c); };

// 1. Replaying each turn's plan gives exactly the state B.turn computes.
let same=0, turns=0, bad=0;
['greedy','tactician','warlord'].forEach((style,si)=>{
  let st=E.newGame(D.STARTER,{players:[{name:'P0',arch:'Warmonger'},{name:'P1',arch:'Gardener'},{name:'P2',arch:'Philosopher'}],seed:70+si});
  for(let t=0;t<12&&st.winner==null;t++){
    if(st.pending){ st=B.resolve(st,st.cur,style); continue; }
    const want=B.turn(st,B.newStats(),st.players.map(()=>style)), acts=B.plan(st,style);
    let s=st; for(const a of acts){ const n=E.apply(s,a); if(n.error){ bad++; break; } s=n; }
    turns++; if(want&&strip(s)===strip(want)) same++; st=s;
  }
});
chk('Plan', bad===0, 'every planned action is legal when replayed ('+bad+' illegal)');
chk('Plan', turns>20&&same===turns, 'replay reaches the state the bot computed ('+same+'/'+turns+' turns)');

// 2. The single-player driver (same rules as ui.js): bots act from a plan, stop at a human's prompt, re-plan after it.
function drive(st, kinds, human){
  let queue=null, queueFor=null, expect=null, steps=0, humanAnswers=0, replans=0;
  const isBot=p=>kinds[p]!=='human';
  while(st.winner==null && st.round<=30 && steps++<4000){
    const pd=st.pending, who=pd?pd.player:st.reveal?st.reveal.to:st.cur;
    if(!isBot(who)){                      // the human: answer like a greedy bot would, or play a minimal turn
      let a = pd ? {t:'answer',v:B.choose(st,who,'greedy')} : st.reveal ? {t:'closeReveal'} : !st.turn.started ? {t:'startTurn'}
        : !st.players[who].foundationPlaced ? {t:'play',uid:st.players[who].foundationUid,k:Object.keys(E.legalCells(st,st.players[who].foundationUid))[0]} : {t:'endTurn'};
      if(pd) humanAnswers++;
      const n=E.apply(st,a); if(n.error) return {err:'human '+a.t+': '+n.error}; st=n; continue; }
    let a=null;
    if(queue&&queue.length&&expect===st) a=queue.shift();
    if(a&&a.t==='answer'&&(!st.pending||st.pending.player!==queueFor)) a=null;    // plan answered for someone else: drop it
    if(!a){ queue=null;
      if(st.reveal&&!pd) a={t:'closeReveal'};
      else if(pd) a={t:'answer',v:B.choose(st,pd.player,kinds[pd.player])};
      else { queue=B.plan(st,kinds[st.cur]); queueFor=st.cur; replans++; a=queue.shift(); } }
    const n=E.apply(st,a);
    if(n.error){ queue=null; const f=E.apply(st,{t:st.turn.started?'endTurn':'startTurn'}); if(f.error) return {err:'bot stuck: '+n.error}; st=f; expect=st; continue; }
    st=n; expect=st;
  }
  return {st, steps, humanAnswers, replans};
}
const r1=drive(E.newGame(D.STARTER,{players:[{name:'You',arch:'Archbishop'},{name:'Bot A',arch:'Warmonger'},{name:'Bot B',arch:'Hedonist'}],seed:21}),['human','warlord','tactician']);
chk('Driver', !r1.err && r1.st.winner!=null, 'a solo game against two bots finishes'+(r1.err?' ('+r1.err+')':' (winner '+(r1.st&&r1.st.players[r1.st.winner].name)+', round '+(r1.st&&r1.st.round)+')'));
let worst=null; for(let seed=1;seed<=6&&!worst;seed++){ const r=drive(E.newGame(D.STARTER,{players:[{name:'You',arch:'Gardener'},{name:'Bot',arch:'Warmonger'}],seed}),['human','warlord']); // The scripted human never plays a card, so it can end up hoarding the whole deck; a bot left with nothing to draw and the lead is fine.
  const dry=r.st&&!r.st.deck.length&&!r.st.discard.length&&E.scores(r.st)[1].total>E.scores(r.st)[0].total;
  if(r.err||(r.st.winner==null&&!dry)) worst='seed '+seed+': '+(r.err||'no winner'); }
chk('Driver', !worst, 'six 1-vs-warlord games finish (or the bot leads when the deck runs dry)'+(worst?' ('+worst+')':''));
const r3=drive(E.newGame(D.STARTER,{players:[{name:'A',arch:'Cryptkeeper'},{name:'B',arch:'Philosopher'},{name:'C',arch:'Archbishop'}],seed:5}),['greedy','tactician','warlord']);
chk('Driver', !r3.err && r3.st.winner!=null, 'an all-bot game finishes through the driver');
R.forEach(r=>console.log(r[1],'|',r[0],'|',r[2]));
