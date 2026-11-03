// Bot self-play for balance analysis. The bots themselves live in src/bots.js (greedy, tactician, raider, warlord).
// Usage: node tools/sim2.js <players> <first game> <last game> <output.json> [lineup]
//   lineup (optional) fixes styles instead of rotating them, e.g. "Warmonger=warlord,*=greedy".
//   An archetype named in it plays in every game.
const D=require('../src/data.js'), E=require('../src/engine.js'), B=require('../src/bots.js'), fs=require('fs');
const ARCH=['Archbishop','Hedonist','Warmonger','Cryptkeeper','Gardener','Philosopher'], STRATS=['greedy','tactician','raider'];
// lineup = { Archetype: style, '*': style } or null (rotate styles as before).
function game(n,g,stats,lineup){
  let combos=[]; (function rec(s,a){ if(a.length===n){combos.push(a);return;} for(let i=s;i<6;i++) rec(i+1,a.concat(ARCH[i])); })(0,[]);
  if(lineup) { const must=Object.keys(lineup).filter(a=>a!=='*'); combos=combos.filter(c=>must.every(a=>c.includes(a))); }
  const c=combos[g%combos.length], rot=Math.floor(g/combos.length)%n; const archs=c.slice(rot).concat(c.slice(0,rot));
  const strats=archs.map((a,i)=>lineup ? (lineup[a]||lineup['*']||'greedy') : STRATS[(g+i*(n===3?1:2)+Math.floor(g/combos.length))%3]);
  let st=E.newGame(D.STARTER,{players:archs.map((a,i)=>({name:'P'+i,arch:a})),seed:5000+g+n*1000,seatTokens:process.env.SEATTOK!=null?+process.env.SEATTOK:undefined}); let guard=0;
  while(st.winner==null && st.round<=30 && guard++<400){ if(st.pending) { st=B.resolve(st,st.cur,strats[st.cur],strats); if(!st) break; continue; } const s=B.turn(st,stats,strats); if(!s) break; st=s; }
  return {st,archs,strats}; }
// Command line: play games [from, to) (stopping after ~255 s) and save results for analyze2.js.
if(require.main===module){
  const n=+process.argv[2], from=+process.argv[3], to=+process.argv[4], out=process.argv[5];
  const lineup=process.argv[6] ? Object.fromEntries(process.argv[6].split(',').map(x=>x.split('='))) : null;
  const stats={played:{},abil:{},left:[],inc:[]}, games=[], cards={};
  const t0=Date.now();
  for(let g=from; g<to; g++){ if(Date.now()-t0>(+process.env.SECS||255)*1000) break; const {st,archs,strats}=game(n,g,stats,lineup); const sc=E.scores(st);
    const L=st.log, cnt=re=>L.filter(l=>re.test(l)).length;
    games.push({n,g,rounds:st.round,winner:st.winner,archs,strats,scores:sc.map(s=>s.total),income:st.players.map((q,i)=>E.income(st,i)),out:st.players.map(q=>q.out),
      ruins:cnt(/ is Ruined/), over:cnt(/ is Overwhelmed/), curses:cnt(/ is tucked under| covers |Curse/)-cnt(/destroyed|absorbs/), defended:cnt(/absorbs/), ascended:cnt(/ASCENDS/), elim:cnt(/out of the game/),
      ruinsBy:st.players.map(q=>cnt(new RegExp(' is Ruined by '+q.name+'\\.$'))), overBy:st.players.map(q=>cnt(new RegExp(' is Overwhelmed by '+q.name+'\\.$'))),
      warcamp:st.players.map(q=>L.filter(l=>l.startsWith(q.name+' banks ')&&l.endsWith('(Warcamp).')).reduce((s,l)=>s+(+(l.match(/banks (\d+)/)||[0,0])[1]),0))});
    st.players.forEach((q,p)=>E.kingdom(st,p).forEach(k=>{ const id=st.cards[E.top(st,k)].def; const r=cards[id]=cards[id]||{v:[],i:[],win:0,any:0,exp:0}; r.v.push(E.cardValue(st,k,p)); r.i.push(E.cardIncome(st,k)); r.any++; r.exp+=1/n; if(p===st.winner) r.win++; })); }
  fs.writeFileSync(out,JSON.stringify({games,stats,cards})); console.log('done',games.length,'games in',((Date.now()-t0)/1000).toFixed(0)+'s');
}
