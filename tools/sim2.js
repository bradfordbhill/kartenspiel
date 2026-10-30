// Self-play with three bot personalities:
//  greedy    – best short-term gain for itself (as in the first analysis)
//  tactician – greedy, plus uses every ready ability every turn (Tithing Hall, Funeral Pyre, Confessional, University, ...)
//  raider    – values damage to opponents highly; aims Ruins and Curses at opponents' biggest ● and ◇ producers; also uses abilities
const D=require('../src/data.js'), E=require('../src/engine.js'), fs=require('fs');
const ARCH=['Archbishop','Hedonist','Warmonger','Cryptkeeper','Gardener','Philosopher'], STRATS=['greedy','tactician','raider'];
const MAIN={Archbishop:'Sceptre',Hedonist:'Goblet',Warmonger:'Sword',Cryptkeeper:'Bone',Gardener:'Leaf',Philosopher:'Tome'};
function ap(st,a){const r=E.apply(st,a); return r.error?null:r;}
function tot(st,p){return E.scores(st)[p].total;}
function oppSum(st,p,f){let m=0;st.players.forEach((q,i)=>{if(i!==p&&!q.out)m+=f(st,i)});return m;}
function oppBest(st,p){let m=0;st.players.forEach((q,i)=>{if(i!==p&&!q.out)m=Math.max(m,tot(st,i))});return m;}
function cardWorth(st,k){ const u=E.top(st,k), c=st.cards[u]; if(!c.claimants.length) return 0; return E.cardValue(st,k,c.claimants[0])+2*E.cardIncome(st,k); }
function resolve(st,me,strat){
  let g=0; while(st&&st.pending&&g++<16){ const pd=st.pending, p=pd.player; let v;
    if(pd.kind==='cell'){ const opts=pd.options;
      if(pd.verb==='ruin'||pd.verb==='curse'||(pd.verb==='target'&&p===me)){
        let best=null,bv=-1e9; opts.forEach(k=>{const u=E.top(st,k); if(!u){ if(bv<-1e8){bv=-1e8;best=k;} return;} const c=st.cards[u]; const own=c.claimants.includes(p); const s=own?-100:(strat==='raider'?cardWorth(st,k):(c.claimants.length?E.cardValue(st,k,c.claimants[0])+E.cardIncome(st,k):0)); if(s>bv){bv=s;best=k}});
        v=(pd.optional&&bv<=0&&pd.verb!=='target')?null:best; }
      else if(pd.verb==='suit'){ let best=opts[0]; for(const k of opts){ if(st.cards[E.top(st,k)].claimants.includes(p)){best=k;break;} } v=best; }
      else if(pd.verb==='bury'){ let best=opts[0]; for(const k of opts){ if(E.kingdom(st,p).includes(k)){best=k;break;} } v=best; }
      else if(pd.verb==='move'||pd.verb==='claim'||pd.verb==='copy'||pd.verb==='dig'||pd.verb==='cleanse'||pd.verb==='restore') v=opts[0];
      else v=opts[0]; }
    else if(pd.kind==='hand'){ const pool=(pd.options||st.players[p].hand).slice().sort((a,b)=>(+st.defs[st.cards[a].def].cost)-(+st.defs[st.cards[b].def].cost)); v=pool.slice(0,pd.count); }
    else if(pd.kind==='suit'){ v=MAIN[st.players[p].arch]; if(!pd.options.includes(v)) v=pd.options[0];
      // when recolouring an opponent's card, a raider picks a suit that is an enemy of its neighbours' owners
      if(strat==='raider'&&st.res&&st.res.sub&&st.res.sub.picked&&st.res.sub.picked.length){ const t=E.top(st,st.res.sub.picked[0]); if(t&&!st.cards[t].claimants.includes(p)) v=pd.options.includes('Sword')?'Sword':pd.options[0]; } }
    else if(pd.kind==='player'){ v=pd.options.length?pd.options[0]:null; }
    else if(pd.kind==='confirm'){ v = (st.res&&st.res.kind==='reaction') ? true : (p===me); }
    else v=true;
    const n=ap(st,{t:'answer',v}); if(!n) { const n2=ap(st,{t:'answer',v:pd.kind==='cell'?(pd.options[0]||null):v}); if(!n2) return null; st=n2; } else st=n; }
  if(st&&st.reveal) st=ap(st,{t:'closeReveal'}); return st; }
function evalState(st0,st,p,strat){ const rem=6;
  const mine=(tot(st,p)-tot(st0,p)) + 0.5*(E.income(st,p)-E.income(st0,p))*rem/3;
  if(strat==='raider') return mine - 1.0*(oppSum(st,p,tot)-oppSum(st0,p,tot)) - 0.4*(oppSum(st,p,E.income)-oppSum(st0,p,E.income))*rem/3;
  return mine - 0.6*(oppBest(st,p)-oppBest(st0,p)); }
function bestClaim(st,p,strat){ let best=null,bv=0.01; for(const k of E.claimOptions(st,p)){ const s=ap(st,{t:'claim',k}); if(!s) continue; const v=evalState(st,s,p,strat); if(v>bv){bv=v;best=s;} } return best; }
function useAbilities(st,p,strat,stats){
  for(let pass=0;pass<3;pass++){ let used=false;
    for(const k of E.keys(st)){ if(!E.abilityReady(st,k)) continue; const d=E.def(st,E.top(st,k));
      if(strat==='greedy' && !(d.ability&&d.ability.kind==='exchange')) continue;
      const s=resolve(ap(st,{t:'ability',k}),p,strat); if(!s||s.pending) continue;
      if(strat!=='raider' && d.ability.kind!=='exchange' && evalState(st,s,p,strat) < -0.5) continue;
      st=s; used=true; stats.abil[d.id]=(stats.abil[d.id]||0)+1; }
    if(!used) break; }
  return st; }
function turn(st,stats,strats){ const p=st.cur, strat=strats[p]; let s0=ap(st,{t:'startTurn'}); if(!s0) return null; st=s0; const pl=()=>st.players[p];
  if(!pl().foundationPlaced){ const L=E.legalCells(st,pl().foundationUid); const k=Object.keys(L)[0]; const s=resolve(ap(st,{t:'play',uid:pl().foundationUid,k}),p,strat); if(s) st=s; }
  if(strat!=='greedy') st=useAbilities(st,p,strat,stats);
  for(let it=0; it<6; it++){ let best=null,bv=0.5;
    for(const u of pl().hand){ const d=st.defs[st.cards[u].def]; if(E.playBlock(st,p,u)) continue;
      if(!E.needsPlacement(d)){ if((E.isFree(st,u)?0:+d.cost)>pl().ap) continue; let s=resolve(ap(st,{t:'cast',uid:u}),p,strat); if(!s||s.pending) continue; const v=evalState(st,s,p,strat)+0.8-0.12*d.cost; if(v>bv){bv=v;best={s,u,d}} continue; }
      const L=E.legalCells(st,u); const ks=Object.keys(L).filter(k=>L[k]<=pl().ap).slice(0,14);
      for(const k of ks){ let s=resolve(ap(st,{t:'play',uid:u,k}),p,strat); if(!s||s.pending) continue; const c=st.turn.claimed?s:(bestClaim(s,p,strat)||s); const v=evalState(st,c,p,strat)-0.12*L[k]; if(v>bv){bv=v;best={s,u,d,k}} } }
    if(!best) break; st=best.s; stats.played[best.d.id]=(stats.played[best.d.id]||0)+1;
    if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; } }
  if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; }
  if(strat!=='greedy') st=useAbilities(st,p,strat,stats); else st=useAbilities(st,p,'greedy',stats);
  stats.left.push(pl().ap); stats.inc.push(E.income(st,p));
  let e=ap(st,{t:'endTurn'}); if(e&&e.pending) e=resolve(e,p,strat); if(e) st=e; else return null;
  return st; }
function game(n,g,stats){
  const combos=[]; (function rec(s,a){ if(a.length===n){combos.push(a);return;} for(let i=s;i<6;i++) rec(i+1,a.concat(ARCH[i])); })(0,[]);
  const c=combos[g%combos.length], rot=Math.floor(g/combos.length)%n; const archs=c.slice(rot).concat(c.slice(0,rot));
  const strats=archs.map((a,i)=>STRATS[(g+i*(n===3?1:2)+Math.floor(g/combos.length))%3]);
  let st=E.newGame(D.STARTER,{players:archs.map((a,i)=>({name:'P'+i,arch:a})),seed:5000+g+n*1000}); let guard=0;
  while(st.winner==null && st.round<=30 && guard++<400){ if(st.pending) { st=resolve(st,st.cur,strats[st.cur]); if(!st) break; continue; } const s=turn(st,stats,strats); if(!s) break; st=s; }
  return {st,archs,strats}; }
if(require.main===module){
  const n=+process.argv[2], from=+process.argv[3], to=+process.argv[4], out=process.argv[5];
  const stats={played:{},abil:{},left:[],inc:[]}, games=[], cards={};
  const t0=Date.now();
  for(let g=from; g<to; g++){ if(Date.now()-t0>255000) break; const {st,archs,strats}=game(n,g,stats); const sc=E.scores(st);
    const L=st.log, cnt=re=>L.filter(l=>re.test(l)).length;
    games.push({n,g,rounds:st.round,winner:st.winner,archs,strats,scores:sc.map(s=>s.total),income:st.players.map((q,i)=>E.income(st,i)),out:st.players.map(q=>q.out),
      ruins:cnt(/ is Ruined/), over:cnt(/ is Overwhelmed/), curses:cnt(/ is tucked under| covers |Curse/)-cnt(/destroyed|absorbs/), defended:cnt(/absorbs/), ascended:cnt(/ASCENDS/), elim:cnt(/out of the game/)});
    st.players.forEach((q,p)=>E.kingdom(st,p).forEach(k=>{ const id=st.cards[E.top(st,k)].def; const r=cards[id]=cards[id]||{v:[],i:[],win:0,any:0,exp:0}; r.v.push(E.cardValue(st,k,p)); r.i.push(E.cardIncome(st,k)); r.any++; r.exp+=1/n; if(p===st.winner) r.win++; })); }
  fs.writeFileSync(out,JSON.stringify({games,stats,cards})); console.log('done',games.length,'games in',((Date.now()-t0)/1000).toFixed(0)+'s');
}
