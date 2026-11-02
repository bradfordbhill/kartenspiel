/* Kartenspiel bots, shared by the single-player game (ui.js) and the balance simulator (tools/sim2.js).
   Bot styles (how a bot plays):
     greedy    – best short-term gain for itself
     tactician – greedy, plus uses every ready ability every turn (Tithing Hall, Funeral Pyre, Confessional, University, ...)
     raider    – values damage to opponents highly; aims Ruins and Curses at opponents' biggest ● and ◇ producers; also uses abilities
     warlord   – plays for War and Conquest: values every Ruin and Overwhelm it causes, Reserves, and pressure on rival cards
                 (enemy-suit neighbours piling up toward their Overwhelm number); uses every ability, aims like a raider
   Archetype goals (what a bot plays for, whatever its style), read from its Foundation by profile():
     Archbishop  (Cathedral, 6◇ per Sceptre in your Kingdom)        keeps and plays Sceptre cards
     Hedonist    (Palace, 4◇ / 3◇ per Goblet in / out of it)       keeps and plays Goblet cards
     Philosopher (Observatory, 5◇ per different suit in it)        keeps cards of suits its Kingdom lacks, recolours toward them
     Cryptkeeper (Mausoleum, 3◇ per buried card in it)             keeps Actions and Blessings, which get buried once played
     Gardener    (Orchard, 4◇ per card in the largest region)      keeps cards to grow the region
     Warmonger   (Warcamp, ◇ and 12● Reserves per Ruin/Overwhelm)  values Ruins, Overwhelm pressure and Reserves, and spends Reserves
   Every archetype treats cards of its banned suit as dead: they are the first to be discarded, buried or swapped away
   (Discard 2, draw 1). Every bot places its Foundation where it scores best with open space around it.
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

  // ---- Archetype goals ----
  // What player p's archetype plays for, read from their Foundation's rules (so an edited Foundation still works):
  // kind = its scoring rule, n = ◇ per unit, suit = the suit it counts, weak = the suit it cannot play,
  // war = it is paid for Ruins and Overwhelms (Warcamp).
  function profile(st,p){ const pl=st.players[p]; const fd=pl&&pl.foundation&&st.defs[pl.foundation]; if(!fd) return null;
    const s=fd.score||{kind:'none'}, m=fd.mods||{};
    return { arch:pl.arch, kind:s.kind, n:+s.n||0, suit:s.suit||fd.suit, weak:st.opts.enforceWeak!==false?(fd.weakTo||''):'',
      war:!!(m.payoutOnRuin||m.payoutOnOverwhelm||m.reserveOnRuin) }; }
  // Suits already in p's Kingdom.
  function kingdomSuits(st,p){ const s={}; E.kingdom(st,p).forEach(k=>{ const u=E.top(st,k); if(u&&!st.cards[u].ruined) s[E.suitOf(st,u)]=1; }); return s; }
  // A hand card p can never play: its archetype's banned suit.
  function dead(st,p,u,g){ const d=E.rawDef(st,u); return !!(g&&g.weak&&d.suit===g.weak&&d.type!=='Foundation'); }
  // How much p's archetype wants to keep hand card u, in ◇ it is likely to bring later (a dead card is below zero).
  function fit(st,p,u,g,ks){ if(!g) return 0; const d=E.rawDef(st,u);
    if(d.type==='Foundation') return 50;
    if(dead(st,p,u,g)) return -5;
    switch(g.kind){
      case 'perSuitInKingdom': case 'perSuitSplit': return d.suit===g.suit ? 0.4*g.n : 0;
      case 'perDistinctSuitInKingdom': return (ks||kingdomSuits(st,p))[d.suit] ? 0 : 0.4*g.n;
      case 'perBuriedInKingdom': return (d.type==='Action'||d.type==='Blessing'||(d.onPlay||[]).some(s=>/bury/i.test(s.do||''))) ? 0.4*g.n : 0;
      case 'largestRegion': return E.needsPlacement(d) ? 0.25*g.n : 0;
    }
    return 0; }
  // Worth of a hand card when choosing what to keep: its archetype fit, plus a little for cost (pricier cards do more).
  function keepValue(st,p,u,g,ks){ return fit(st,p,u,g,ks) + 0.15*(+E.rawDef(st,u).cost||0); }
  function suitsFor(st,p,g){ return g&&g.kind==='perDistinctSuitInKingdom' ? kingdomSuits(st,p) : null; }
  // Progress toward p's archetype goal that the score doesn't show yet: the cards held for that goal (for the
  // Philosopher, one per missing suit), minus a little for each dead card clogging the hand.
  function goal(st,p){ const pl=st.players[p]; if(!pl||pl.out) return 0; const g=profile(st,p); if(!g) return 0;
    const ks=suitsFor(st,p,g); let v=0; const seen={};
    pl.hand.forEach(u=>{ const d=E.rawDef(st,u); if(d.type==='Foundation') return;
      if(ks&&!dead(st,p,u,g)){ if(ks[d.suit]||seen[d.suit]) return; seen[d.suit]=1; }
      v+=Math.max(-1,fit(st,p,u,g,ks)); });
    return v; }

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
    else if(pd.kind==='hand'){
      // Give up the cards p's archetype needs least, dead cards first. Setting a card aside to play free later keeps the best one.
      const g=profile(st,p), ks=suitsFor(st,p,g), best=/^Set a card aside/.test(pd.prompt||'');
      const pool=(pd.options||st.players[p].hand).slice().sort((a,b)=>{ const d=keepValue(st,p,a,g,ks)-keepValue(st,p,b,g,ks); return best?-d:d; });
      v=pool.slice(0,pd.count); }
    // Recolouring its own card: try each suit and keep the one that helps its archetype most.
    else if(pd.kind==='suit'&&p===me&&(strat==='warlord'||!recolouringRival(st,p))){ v=trial(st,me,strat,pd.options); }
    else if(pd.kind==='suit'){ v=MAIN[st.players[p].arch]; if(!pd.options.includes(v)) v=pd.options[0];
      // when recolouring an opponent's card, a raider picks a suit that is an enemy of its neighbours' owners
      if(strat==='raider'&&recolouringRival(st,p)) v=pd.options.includes('Sword')?'Sword':pd.options[0]; }
    else if(pd.kind==='player'){ v=pd.options.length?pd.options[0]:null; }
    else if(pd.kind==='confirm'){ v = (st.res&&st.res.kind==='reaction') ? true : (p===me); }
    else v=true;
    return v; }
  // Is the pending suit choice recolouring a card p doesn't own?
  function recolouringRival(st,p){ const pk=st.res&&st.res.sub&&st.res.sub.picked; if(!pk||!pk.length) return false; const t=E.top(st,pk[0]); return !!(t&&!st.cards[t].claimants.includes(p)); }
  // Answer every pending prompt the way this bot would. Returns the new state, or null if it got stuck.
  function resolve(st,me,strat){
    let g=0; while(st&&st.pending&&g++<16){ const pd=st.pending, v=choose(st,me,strat);
      const n=ap(st,{t:'answer',v}); if(!n) { const n2=ap(st,{t:'answer',v:pd.kind==='cell'?(pd.options[0]||null):v}); if(!n2) return null; st=n2; } else st=n; }
    if(st&&st.reveal) st=ap(st,{t:'closeReveal'}); return st; }
  // Answer a prompt by trying each option and keeping the one that scores best (a quick look ahead).
  function trial(st,me,strat,opts){ let best=opts[0],bv=-1e9; for(const o of opts){ const n=ap(st,{t:'answer',v:o}); if(!n) continue; const v=evalState(st,n,me,strat); if(v>bv){bv=v;best=o;} } return best; }
  // How much better st is than st0 for player p: own ◇ and ● gained, progress toward its archetype's goal,
  // minus what opponents gained. A player paid for War (Warcamp) values it like a warlord, whatever its style.
  function evalState(st0,st,p,strat){ const rem=6, g=profile(st,p);
    let mine=(tot(st,p)-tot(st0,p)) + 0.5*(E.income(st,p)-E.income(st0,p))*rem/3 + (goal(st,p)-goal(st0,p));
    if(g&&g.war&&strat!=='warlord') mine+=2*(ruinsBy(st,p)-ruinsBy(st0,p)) + 1*(pressure(st,p)-pressure(st0,p)) + 0.15*((st.players[p].reserve||0)-(st0.players[p].reserve||0));
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
  // Where to put the Foundation: the space that scores best now, with open space around it to grow into,
  // and away from enemy-suit cards that count toward Overwhelming it.
  function placeFoundation(st,p,strat){ const u=st.players[p].foundationUid, L=E.legalCells(st,u); let best=null,bv=-1e9;
    const en=E.enemies(st,E.rawDef(st,u).suit);
    for(const k of Object.keys(L).slice(0,24)){ const s=resolve(ap(st,{t:'play',uid:u,k}),p,strat); if(!s) continue;
      const xy=E.XY(k); let open=0, foes=0;
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){ if(!dx&&!dy) continue; const t=E.top(s,E.K(xy[0]+dx,xy[1]+dy)); if(!t) open++; else if(en.includes(E.suitOf(s,t))) foes++; }
      const v=evalState(st,s,p,strat)+0.3*open-1.5*foes; if(v>bv){bv=v;best=s;} }
    return best; }
  // Discard 2, draw 1 while the hand holds two cards this archetype can't play (or one, in a hand of five or more).
  function swapDead(st,p,stats){ for(let i=0;i<2;i++){ const g=profile(st,p); if(!g||!g.weak) break; const ks=suitsFor(st,p,g);
      const hand=st.players[p].hand.filter(u=>E.rawDef(st,u).type!=='Foundation').sort((a,b)=>keepValue(st,p,a,g,ks)-keepValue(st,p,b,g,ks));
      const nDead=hand.filter(u=>dead(st,p,u,g)).length;
      if(hand.length<2||st.deck.length<3||!(nDead>=2||(nDead===1&&hand.length>=5))) break;
      const s=ap(st,{t:'swap',uids:hand.slice(0,2)}); if(!s) break; st=s; stats.swaps=(stats.swaps||0)+1; }
    return st; }
  // Out of meeples, a bot can no longer claim anything new. Instead of starting its turn it takes back the meeple on its
  // least valuable card when that card is cheap to give up, or after round 10 whatever it is worth (else it can stall for good).
  function reclaim(st,p){ const pl=st.players[p]; if(pl.meeples>0||!pl.foundationPlaced) return null; let best=null,bw=1e9;
    E.keys(st).forEach(k=>{ const u=E.top(st,k), c=st.cards[u]; if(!u||c.fixed||c.ascended||!c.claimants.includes(p)) return;
      const w=E.cardValue(st,k,p)+2*E.cardIncome(st,k); if(w<bw){bw=w;best=k;} });
    if(best==null) return null;
    const playable=pl.hand.filter(u=>!E.playBlock(st,p,u)).length;
    if(bw>3+(playable>=2?3:0)&&st.round<=10) return null;
    return ap(st,{t:'reclaim',k:best}); }
  function newStats(){ return {played:{},abil:{},left:[],inc:[]}; }
  // One whole bot turn for st.cur (strats[seat] = style): start, Foundation, abilities, then up to 6 best plays
  // (each with its best claim), dead cards swapped away, then end. A turn already started is carried on from where it is.
  // ● available includes Reserves (Warcamp).
  function turn(st,stats,strats){ const p=st.cur, strat=strats[p];
    if(!(st.turn&&st.turn.started)){ const r=reclaim(st,p); if(r){ stats.reclaims=(stats.reclaims||0)+1; return r; } }
    let s0=st.turn&&st.turn.started?st:ap(st,{t:'startTurn'}); if(!s0) return null; st=s0; const pl=()=>st.players[p];
    if(!pl().foundationPlaced){ const s=placeFoundation(st,p,strat); if(s) st=s; }
    if(strat!=='greedy') st=useAbilities(st,p,strat,stats);
    for(let it=0; it<6; it++){ let best=null,bv=0.5; const cash=E.funds(pl());
      for(const u of pl().hand){ const d=st.defs[st.cards[u].def]; if(E.playBlock(st,p,u)) continue;
        if(!E.needsPlacement(d)){ if((E.isFree(st,u)?0:+d.cost)>cash) continue; let s=resolve(ap(st,{t:'cast',uid:u}),p,strat); if(!s||s.pending) continue; const v=evalState(st,s,p,strat)+0.8-0.12*d.cost; if(v>bv){bv=v;best={s,u,d}} continue; }
        const L=E.legalCells(st,u); const ks=Object.keys(L).filter(k=>L[k]<=cash).slice(0,14);
        for(const k of ks){ let s=resolve(ap(st,{t:'play',uid:u,k}),p,strat); if(!s||s.pending) continue; const c=st.turn.claimed?s:(bestClaim(s,p,strat)||s); const v=evalState(st,c,p,strat)-0.12*L[k]; if(v>bv){bv=v;best={s,u,d,k}} } }
      if(!best) break; st=best.s; stats.played[best.d.id]=(stats.played[best.d.id]||0)+1;
      if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; } }
    if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; }
    if(strat!=='greedy') st=useAbilities(st,p,strat,stats); else st=useAbilities(st,p,'greedy',stats);
    st=swapDead(st,p,stats);
    stats.left.push(pl().ap); stats.inc.push(E.income(st,p));
    let e=ap(st,{t:'endTurn'}); if(e&&e.pending) e=resolve(e,p,strat); if(e) st=e; else return null;
    return st; }

  // The rest of the current player's turn as a list of actions, for replaying one at a time (single player).
  // It ends with endTurn and any answers given right after it; replay stops early at a prompt meant for someone else.
  function plan(st0,style){
    const st=Object.assign({},st0,{_botLog:[]}), end=turn(st,newStats(),st0.players.map(()=>style));
    return end&&end._botLog.length ? end._botLog : [{t:st0.turn&&st0.turn.started?'endTurn':'startTurn'}]; }

  return { STYLES: ['greedy', 'tactician', 'raider', 'warlord'], plan: plan, choose: choose, resolve: resolve, turn: turn, newStats: newStats, evalState: evalState,
    profile: profile, goal: goal, keepValue: keepValue };
})();
if (typeof module !== 'undefined') module.exports = KBots;
