/* Kartenspiel bots, shared by the single-player game (ui.js) and the balance simulator (tools/sim2.js).
   Bot styles:
     greedy    – best short-term gain for itself
     tactician – greedy, plus uses every ready ability every turn (Tithing Hall, Funeral Pyre, Confessional, University, ...)
     raider    – values damage to opponents highly; aims Ruins and Curses at opponents' biggest ● and ◇ producers; also uses abilities
     warlord   – plays for War and Conquest: values every Ruin and Overwhelm it causes, Reserves, and pressure on rival cards
                 (enemy-suit neighbours piling up toward their Overwhelm number); uses every ability, aims like a raider
   Every bot move is tried on a copy of the state with KEngine.apply and scored with evalState; the best one is kept.
   The bots see the whole state, including other players' hands, though they only look at their own. */
var KBots = (function () {
  const E = typeof KEngine !== 'undefined' ? KEngine : require('./engine.js');
  const MAIN = { Archbishop: 'Sceptre', Hedonist: 'Goblet', Warmonger: 'Sword', Cryptkeeper: 'Bone', Gardener: 'Leaf', Philosopher: 'Tome' };

  // Apply an action, or null if it's illegal. While planning (st._botLog exists), each state remembers the actions that led to it.
  function ap(st,a){const r=E.apply(st,a); if(r.error) return null; if(st._botLog) r._botLog=st._botLog.concat([a]); return r;}
  function tot(st,p){return E.scores(st)[p].total;}
  function oppSum(st,p,f){let m=0;st.players.forEach((q,i)=>{if(i!==p&&!q.out)m+=f(st,i)});return m;}
  function oppBest(st,p){let m=0;st.players.forEach((q,i)=>{if(i!==p&&!q.out)m=Math.max(m,tot(st,i))});return m;}
  // Ruins and Overwhelms credited to player p so far (from the log).
  function ruinsBy(st,p){ const me=' by '+st.players[p].name+'.'; return st.log.filter(l=>(/ is (Ruined|Overwhelmed) by /.test(l))&&l.endsWith(me)).length; }
  // How close rival cards are to being Overwhelmed: each enemy-suit neighbour counts, one away from the number counts triple.
  function pressure(st,p){ let s=0; E.keys(st).forEach(k=>{ const u=E.top(st,k), c=st.cards[u]; if(c.ruined||!c.claimants.length||c.claimants.includes(p)||E.untargetable(st,u)) return;
    const oc=E.overwhelmCount(st,k); if(!oc||!oc.n) return; s+= oc.n>=oc.th-1 ? 3 : oc.n/oc.th; }); return s; }
  function cardWorth(st,k){ const u=E.top(st,k), c=st.cards[u]; if(!c.claimants.length) return 0; return E.cardValue(st,k,c.claimants[0])+2*E.cardIncome(st,k); }

  // The answer this bot (player `me`, style `strat`) gives to the pending prompt, whoever it is addressed to.
  function choose(st,me,strat){ const pd=st.pending, p=pd.player; let v;
    if(pd.kind==='cell'){ const opts=pd.options;
      if(strat==='warlord'&&p===me&&pd.verb!=='bury'&&opts.length<=12){ v=trial(st,me,strat,opts.concat(pd.optional?[null]:[])); }
      else if(pd.verb==='ruin'||pd.verb==='curse'||(pd.verb==='target'&&p===me)){
        let best=null,bv=-1e9; opts.forEach(k=>{const u=E.top(st,k); if(!u){ if(bv<-1e8){bv=-1e8;best=k;} return;} const c=st.cards[u]; const own=c.claimants.includes(p); const s=own?-100:(strat==='raider'||strat==='warlord'?cardWorth(st,k):(c.claimants.length?E.cardValue(st,k,c.claimants[0])+E.cardIncome(st,k):0)); if(s>bv){bv=s;best=k}});
        v=(pd.optional&&bv<=0&&pd.verb!=='target')?null:best; }
      else if(pd.verb==='suit'){ let best=opts[0]; for(const k of opts){ if(st.cards[E.top(st,k)].claimants.includes(p)){best=k;break;} } v=best; }
      else if(pd.verb==='bury'){ let best=opts[0]; for(const k of opts){ if(E.kingdom(st,p).includes(k)){best=k;break;} } v=best; }
      else v=opts[0]; }
    else if(pd.kind==='hand'){ const pool=(pd.options||st.players[p].hand).slice().sort((a,b)=>(+st.defs[st.cards[a].def].cost)-(+st.defs[st.cards[b].def].cost)); v=pool.slice(0,pd.count); }
    else if(pd.kind==='suit'&&strat==='warlord'&&p===me){ v=trial(st,me,strat,pd.options); }
    else if(pd.kind==='suit'){ v=MAIN[st.players[p].arch]; if(!pd.options.includes(v)) v=pd.options[0];
      // when recolouring an opponent's card, a raider picks a suit that is an enemy of its neighbours' owners
      if(strat==='raider'&&st.res&&st.res.sub&&st.res.sub.picked&&st.res.sub.picked.length){ const t=E.top(st,st.res.sub.picked[0]); if(t&&!st.cards[t].claimants.includes(p)) v=pd.options.includes('Sword')?'Sword':pd.options[0]; } }
    else if(pd.kind==='player'){ v=pd.options.length?pd.options[0]:null; }
    else if(pd.kind==='confirm'){ v = (st.res&&st.res.kind==='reaction') ? true : (p===me); }
    else v=true;
    return v; }
  // Answer every pending prompt the way this bot would. Returns the new state, or null if it got stuck.
  function resolve(st,me,strat){
    let g=0; while(st&&st.pending&&g++<16){ const pd=st.pending, v=choose(st,me,strat);
      const n=ap(st,{t:'answer',v}); if(!n) { const n2=ap(st,{t:'answer',v:pd.kind==='cell'?(pd.options[0]||null):v}); if(!n2) return null; st=n2; } else st=n; }
    if(st&&st.reveal) st=ap(st,{t:'closeReveal'}); return st; }
  // Warlord: answer a prompt by trying each option and keeping the one that scores best (a quick look ahead).
  function trial(st,me,strat,opts){ let best=opts[0],bv=-1e9; for(const o of opts){ const n=ap(st,{t:'answer',v:o}); if(!n) continue; const v=evalState(st,n,me,strat); if(v>bv){bv=v;best=o;} } return best; }
  // How much better st is than st0 for player p: own ◇ and ● gained, minus what opponents gained.
  function evalState(st0,st,p,strat){ const rem=6;
    const mine=(tot(st,p)-tot(st0,p)) + 0.5*(E.income(st,p)-E.income(st0,p))*rem/3;
    if(strat==='warlord') return mine + 3*(ruinsBy(st,p)-ruinsBy(st0,p)) + 1.5*(pressure(st,p)-pressure(st0,p)) + 0.25*((st.players[p].reserve||0)-(st0.players[p].reserve||0))
      - 0.5*(oppSum(st,p,tot)-oppSum(st0,p,tot));
    if(strat==='raider') return mine - 1.0*(oppSum(st,p,tot)-oppSum(st0,p,tot)) - 0.4*(oppSum(st,p,E.income)-oppSum(st0,p,E.income))*rem/3;
    return mine - 0.6*(oppBest(st,p)-oppBest(st0,p)); }
  // Try every possible claim and keep the best one, if any is worth it.
  function bestClaim(st,p,strat){ let best=null,bv=0.01; for(const k of E.claimOptions(st,p)){ const s=ap(st,{t:'claim',k}); if(!s) continue; const v=evalState(st,s,p,strat); if(v>bv){bv=v;best=s;} } return best; }
  // Use ready abilities. Greedy bots only use ●-for-◇ exchanges.
  function useAbilities(st,p,strat,stats){
    for(let pass=0;pass<3;pass++){ let used=false;
      for(const k of E.keys(st)){ if(!E.abilityReady(st,k)) continue; const d=E.def(st,E.top(st,k));
        if(strat==='greedy' && !(d.ability&&d.ability.kind==='exchange')) continue;
        const s=resolve(ap(st,{t:'ability',k}),p,strat); if(!s||s.pending) continue;
        if(strat!=='raider' && strat!=='warlord' && d.ability.kind!=='exchange' && evalState(st,s,p,strat) < -0.5) continue;
        st=s; used=true; stats.abil[d.id]=(stats.abil[d.id]||0)+1; }
      if(!used) break; }
    return st; }
  function newStats(){ return {played:{},abil:{},left:[],inc:[]}; }
  // One whole bot turn for st.cur (strats[seat] = style): start, Foundation, abilities, then up to 6 best plays
  // (each with its best claim), then end. A turn already started is carried on from where it is.
  function turn(st,stats,strats){ const p=st.cur, strat=strats[p]; let s0=st.turn&&st.turn.started?st:ap(st,{t:'startTurn'}); if(!s0) return null; st=s0; const pl=()=>st.players[p];
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

  // The rest of the current player's turn as a list of actions, for replaying one at a time (single player).
  // It ends with endTurn and any answers given right after it; replay stops early at a prompt meant for someone else.
  function plan(st0,style){
    const st=Object.assign({},st0,{_botLog:[]}), end=turn(st,newStats(),st0.players.map(()=>style));
    return end&&end._botLog.length ? end._botLog : [{t:st0.turn&&st0.turn.started?'endTurn':'startTurn'}]; }

  return { STYLES: ['greedy', 'tactician', 'raider', 'warlord'], plan: plan, choose: choose, resolve: resolve, turn: turn, newStats: newStats, evalState: evalState };
})();
if (typeof module !== 'undefined') module.exports = KBots;
