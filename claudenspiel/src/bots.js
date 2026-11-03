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
  // In an imagined world (the Genius's), a step can reach a card the world doesn't hold; that counts as illegal too.
  function ap(st,a){let r; try{ r=E.apply(st,a); }catch(e){ if(!st.sharedDefs) throw e; return null; } if(r.error) return null; if(st._botLog) r._botLog=st._botLog.concat([a]); return r;}
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
    if(strat==='genius') return geniusChoose(st,p);
    if(pd.kind==='cell'){ const opts=pd.options;
      if((strat==='warlord'||strat==='gsim')&&p===me&&pd.verb!=='bury'&&opts.length<=12){ v=trial(st,me,strat,opts.concat(pd.optional?[null]:[])); }
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
    else if(pd.kind==='player'&&strat==='gsim'&&p===me&&pd.options.length>1){ v=trial(st,me,strat,pd.options); }
    else if(pd.kind==='player'){ v=pd.options.length?pd.options[0]:null; }
    else if(pd.kind==='confirm'&&strat==='gsim'&&p===me){ v=trial(st,me,strat,[true,false]); }
    else if(pd.kind==='confirm'){ v = (st.res&&st.res.kind==='reaction') ? true : (p===me); }
    else v=true;
    return v; }
  // Is the pending suit choice recolouring a card p doesn't own?
  function recolouringRival(st,p){ const pk=st.res&&st.res.sub&&st.res.sub.picked; if(!pk||!pk.length) return false; const t=E.top(st,pk[0]); return !!(t&&!st.cards[t].claimants.includes(p)); }
  // Answer every pending prompt the way this bot would. Returns the new state, or null if it got stuck.
  // With strats (a style per seat), each prompt is answered in the style of the player it is addressed to.
  function resolve(st,me,strat,strats){
    let g=0; while(st&&st.pending&&g++<16){ const pd=st.pending, who=strats&&strats[pd.player]!=null&&pd.player!==me?pd.player:me;
      const sty=who===me?strat:strats[who], v=sty==='genius'?geniusChoose(st,who):choose(st,who,sty==='genius'?'tactician':sty);
      const n=ap(st,{t:'answer',v}); if(!n) { const n2=ap(st,{t:'answer',v:pd.kind==='cell'?(pd.options[0]||null):v}); if(!n2) return null; st=n2; } else st=n; }
    if(st&&st.reveal) st=ap(st,{t:'closeReveal'}); return st; }
  // Answer a prompt by trying each option and keeping the one that scores best (a quick look ahead).
  function trial(st,me,strat,opts){ let best=opts[0],bv=-1e9; for(const o of opts){ const n=ap(st,{t:'answer',v:o}); if(!n) continue; const v=evalState(st,n,me,strat); if(v>bv){bv=v;best=o;} } return best; }
  // How much better st is than st0 for player p: own ◇ and ● gained, progress toward its archetype's goal,
  // minus what opponents gained. A player paid for War (Warcamp) values it like a warlord, whatever its style.
  function evalState(st0,st,p,strat){ if(strat==='gsim') return gEval(st,p)-gEval(st0,p);
    const rem=6, g=profile(st,p);
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
        if((strat==='greedy'||strat==='quick') && !(d.ability&&d.ability.kind==='exchange')) continue;
        const s=resolve(ap(st,{t:'ability',k}),p,strat); if(!s||s.pending) continue;
        if(strat!=='raider' && strat!=='warlord' && d.ability.kind!=='exchange' && evalState(st,s,p,strat) < (strat==='gsim'?0.05:-0.5)) continue;
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
    if(strat==='genius') return geniusTurn(st,stats,strats);
    if(!(st.turn&&st.turn.started)){ const r=reclaim(st,p); if(r){ stats.reclaims=(stats.reclaims||0)+1; return r; } }
    let s0=st.turn&&st.turn.started?st:ap(st,{t:'startTurn'}); if(!s0) return null; st=mainPhase(s0,p,strat,stats);
    stats.left.push(st.players[p].ap); stats.inc.push(E.income(st,p));
    let e=ap(st,{t:'endTurn'}); if(e&&e.pending) e=resolve(e,p,strat); if(e) st=e; else return null;
    return st; }
  // The body of a started turn, up to (not including) endTurn: Foundation, abilities, up to 6 best plays (each with
  // its best claim), a last claim, abilities again, dead cards swapped away.
  // 'quick' (the Genius's model of its opponents) looks at fewer spaces; 'gsim' (the Genius thinking) at more, and it
  // plays anything that helps, since ● left at the end of a turn is lost anyway.
  function mainPhase(st,p,strat,stats){ const pl=()=>st.players[p], gs=strat==='gsim', cells=strat==='quick'?8:gs?16:14;
    if(!pl().foundationPlaced){ const s=placeFoundation(st,p,strat); if(s) st=s; }
    if(strat!=='greedy'&&strat!=='quick') st=useAbilities(st,p,strat,stats);
    for(let it=0; it<6; it++){ let best=null,bv=gs?0.05:0.5; const cash=E.funds(pl());
      for(const u of pl().hand){ const d=st.defs[st.cards[u].def]; if(E.playBlock(st,p,u)) continue;
        if(!E.needsPlacement(d)){ if((E.isFree(st,u)?0:+d.cost)>cash) continue; let s=resolve(ap(st,{t:'cast',uid:u}),p,strat); if(!s||s.pending) continue; const v=evalState(st,s,p,strat)+(gs?0:0.8-0.12*d.cost); if(v>bv){bv=v;best={s,u,d}} continue; }
        const L=E.legalCells(st,u); const ks=Object.keys(L).filter(k=>L[k]<=cash).slice(0,cells);
        for(const k of ks){ let s=resolve(ap(st,{t:'play',uid:u,k}),p,strat); if(!s||s.pending) continue; const c=st.turn.claimed?s:(bestClaim(s,p,strat)||s); const v=evalState(st,c,p,strat)-(gs?0:0.12*L[k]); if(v>bv){bv=v;best={s,u,d,k}} } }
      if(!best) break; st=best.s; stats.played[best.d.id]=(stats.played[best.d.id]||0)+1;
      if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; } }
    if(!st.turn.claimed){ const c=bestClaim(st,p,strat); if(c) st=c; }
    if(strat!=='greedy'&&strat!=='quick') st=useAbilities(st,p,strat,stats); else st=useAbilities(st,p,'greedy',stats);
    st=buyClaim(st,p,strat,stats);
    return swapDead(st,p,stats); }
  // Claudenspiel: pay for a second claim when the best claim is worth more than the ● would bank (10● ≈ 1.7◇).
  function buyClaim(st,p,strat,stats){ if(!st.opts.buyClaim||!st.turn.claimed||st.turn.boughtClaim) return st;
    const s=ap(st,{t:'buyClaim'}); if(!s) return st; const c=bestClaim(s,p,strat); if(!c) return st;
    const bar=strat==='gsim'?1:(st.opts.banking?1.7:0.5);
    if(evalState(st,c,p,strat)>bar){ stats.bought=(stats.bought||0)+1; return c; } return st; }

  // The rest of the current player's turn as a list of actions, for replaying one at a time (single player).
  // It ends with endTurn and any answers given right after it; replay stops early at a prompt meant for someone else.
  // ---- The Genius ----
  // The strongest fair player: it never looks at anything a player at the table couldn't see. Every decision starts
  // from E.redact (its own hand, the board, the discard pile; other hands and the deck order hidden), and the hidden
  // cards are filled in at random from the cards it hasn't seen, several times over ("worlds"). In those imagined
  // worlds it:
  //   1. lists its opening moves (every card at every space with its best claim, every ability, every claim) and keeps
  //      the best few, plus its plain best line;
  //   2. plays each one out to the end of its turn, thinking in 'gsim' (each prompt answered by trying every option);
  //   3. lets every opponent reply with a full turn of its own ('quick', an archetype-aware greedy model), in each world;
  //   4. scores where that leaves the race (gEval) and keeps the line that does best on average.
  // It then plays that line up to the first moment it learns something new (a draw, a revealed card, a prompt for
  // someone else) and thinks again from the real game. KBots.GENIUS sets how many worlds, lines and milliseconds it uses.
  const GENIUS={ worlds:3, lines:5, budget:1500, depth:1 };
  const now=()=>Date.now();
  // A small seeded random generator, so a decision is repeatable (seeded from what the player can see).
  function rng(seed){ let a=seed>>>0||1; return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
  function seedOf(st,p){ let h=2166136261; const s=st.round+'|'+st.cur+'|'+p+'|'+st.log.length+'|'+E.keys(st).join(';')+'|'+st.players[p].hand.join(','); for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
  // One imagined world for player p: what p can see (E.redact), with every hidden card replaced by a random card it
  // hasn't seen (the library, minus the board, the discard pile and its own hand), and a fresh random seed.
  function determinize(st0,p,R){
    const st=E.redact(st0,p); st.log=[]; st.sharedDefs=true; delete st._botLog;
    const left={}; Object.keys(st.defs).forEach(id=>{ const d=st.defs[id]; if(d.type==='Foundation'||d.type==='Hidden') return; left[id]=(left[id]||0)+(+d.copies||0); });
    Object.keys(st.cards).forEach(u=>{ const id=st.cards[u].def; if(left[id]) left[id]--; });
    const pool=[]; Object.keys(left).forEach(id=>{ for(let i=0;i<left[id];i++) pool.push(id); });
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); const t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    const ids=Object.keys(left), pick=()=>pool.length?pool.pop():ids[Math.floor(R()*ids.length)];
    Object.keys(st.cards).forEach(u=>{ if(st.defs[st.cards[u].def]&&st.defs[st.cards[u].def].type==='Hidden') st.cards[u].def=pick(); });
    st.deck=st.deck.map((_,i)=>{ const u='w'+i; st.cards[u]={uid:u,def:pick(),suit:null,ruined:false,overwhelmed:false,claimants:[],tokens:0,copyOf:null,prevClaimants:null,fixed:false}; return u; });
    st.seed=1+Math.floor(R()*2147483000);
    return st; }
  // ◇ the player could lose: its cards one enemy away from being Overwhelmed (its Foundation most of all).
  function danger(st,q){ let d=0; E.kingdom(st,q).forEach(k=>{ const oc=E.overwhelmCount(st,k); if(!oc||!oc.th) return; const u=E.top(st,k), c=st.cards[u];
      const w=c.fixed?15:E.cardValue(st,k,q)+2*E.cardIncome(st,k); if(oc.n>=oc.th-1) d+=0.5*w; else if(oc.n>=oc.th-2) d+=0.15*w; }); return d; }
  // How good st is for p: its chance of winning the race to the target, in percent. Fitted on bot self-play (see
  // README, "The Genius"): a player scores about 6◇ a turn plus 0.8◇ for each playable card in hand (up to 6), and
  // ● per turn makes no measurable difference, since one claim a turn is the real limit. So each player needs
  // (target − ◇) / pace more turns; counting seats in turn order, the player due to get there first is most likely to
  // win: chance ∝ e^(−0.24 × seat-turns). A player's ◇ is adjusted for what the score doesn't show yet: cards held
  // toward its archetype's goal, cards at risk of Overwhelm, War pressure (Warcamp) and Reserves.
  const RACE={ base:6, perCard:0.8, cap:3, perInc:0, lambda:0.24, goalW:0.5, dangerW:1, afford:0.5 };
  function gEval(st,p){
    if(st.winner!=null) return st.winner===p?100:0;
    if(st.players[p].out) return 0;
    const sc=E.scores(st), T=+st.opts.target||48, N=st.players.length; let lead=0; sc.forEach((s,i)=>{ if(!st.players[i].out) lead=Math.max(lead,s.total); });
    const soon=Math.min(1,Math.max(0.25,(T-lead)/14));
    let Z=0, mine=0;
    st.players.forEach((pl,q)=>{ if(pl.out) return; const g=profile(st,q);
      const s=sc[q].total + soon*RACE.goalW*goal(st,q) - RACE.dangerW*danger(st,q) + (g&&g.war?0.5*soon*pressure(st,q):0) + 0.15*(pl.reserve||0);
      // Cards it can play and pay for next turn (its ● per turn plus Reserves): with none, it stalls.
      const cash=E.income(st,q)+(pl.reserve||0), cards=pl.hand.filter(u=>!E.playBlock(st,q,u)&&(+E.rawDef(st,u).cost||0)<=cash).length;
      const pace=(RACE.base*(cards||!RACE.afford?1:RACE.afford)+RACE.perCard*Math.min(cards,RACE.cap)+RACE.perInc*Math.min(E.income(st,q),30))*(pl.meeples>0?1:0.6);
      const tau=Math.max(0,T-s)/pace*N + (q-st.cur+N)%N, z=Math.exp(-RACE.lambda*tau); Z+=z; if(q===p) mine=z; });
    return Z?100*mine/Z:0; }
  // Finish p's turn in an imagined world (if it is still p's turn), then let everyone else take theirs; score the
  // position when p's next turn comes round, or the win or loss if the game ends first.
  function rollout(s,p){ const strats=s.players.map((_,i)=>i===p?'gsim':'quick'), stats=newStats(); let g=0;
    if(s.pending) s=resolve(s,p,'gsim',strats);
    if(s&&s.winner==null&&s.cur===p){ if(!(s.turn&&s.turn.started)) s=ap(s,{t:'startTurn'})||s;
      s=mainPhase(s,p,'gsim',stats); let e=ap(s,{t:'endTurn'}); if(e&&e.pending) e=resolve(e,p,'gsim',strats); if(e) s=e; }
    const others=()=>{ while(s&&s.winner==null&&s.cur!==p&&g++<40){ if(s.pending){ s=resolve(s,s.cur,'quick',strats); continue; } if(s.reveal){ s=ap(s,{t:'closeReveal'})||s; continue; } s=turn(s,stats,strats); } };
    others();
    // Deeper: its own next turns too (played quickly), each followed by everyone else's.
    for(let d=2;d<=GENIUS.depth&&s&&s.winner==null&&s.cur===p;d++){ const q=strats.slice(); q[p]='quick'; s=turn(s,stats,q); if(s&&s.pending) s=resolve(s,s.cur,'quick',strats); others(); }
    return s?gEval(s,p):0; }
  // Replay a line of actions in another world, as far as it still applies there.
  function replay(s,acts){ for(const a of acts){ const n=ap(s,a); if(!n) break; s=n; } return s; }
  // Opening moves from w (p's turn under way, nothing pending), best first, one state each.
  function openings(w,p){ const out=[], add=(s,key)=>{ if(s&&!s.pending) out.push({s,key,v:gEval(s,p)}); }, pl=w.players[p];
    add(w,'line');
    if(!pl.foundationPlaced){ const u=pl.foundationUid, L=E.legalCells(w,u); Object.keys(L).slice(0,24).forEach(k=>add(resolve(ap(w,{t:'play',uid:u,k}),p,'gsim'),'F'+k)); }
    else { const cash=E.funds(pl);
      pl.hand.forEach(u=>{ const d=E.rawDef(w,u); if(E.playBlock(w,p,u)) return;
        if(!E.needsPlacement(d)){ if((E.isFree(w,u)?0:+d.cost)<=cash) add(resolve(ap(w,{t:'cast',uid:u}),p,'gsim'),u); return; }
        const L=E.legalCells(w,u); Object.keys(L).filter(k=>L[k]<=cash).slice(0,24).forEach(k=>{ const s=resolve(ap(w,{t:'play',uid:u,k}),p,'gsim'); if(!s||s.pending) return; add(s.turn.claimed?s:(bestClaim(s,p,'gsim')||s),u); }); });
      E.keys(w).forEach(k=>{ if(E.abilityReady(w,k)) add(resolve(ap(w,{t:'ability',k}),p,'gsim'),'A'+k); });
      E.claimOptions(w,p).forEach(k=>add(ap(w,{t:'claim',k}),'C'+k));
      const bw=ap(w,{t:'buyClaim'}); if(bw) E.claimOptions(bw,p).forEach(k=>add(ap(bw,{t:'claim',k}),'B'+k)); }
    out.sort((a,b)=>b.v-a.v); const seen={}, keep=[];
    for(const o of out){ if((seen[o.key]||0)>=2&&o.key!=='line') continue; seen[o.key]=(seen[o.key]||0)+1; keep.push(o); if(keep.length>=GENIUS.lines) break; }
    if(!keep.some(o=>o.key==='line')) keep.push(out.find(o=>o.key==='line'));
    return keep; }
  // The part of a line to play now: up to the first thing p learns (a draw, a reveal) or a prompt for someone else.
  function prefix(w,p,acts){ const out=[]; let s=w;
    for(const a of acts){ if(a.t==='answer'&&!(s.pending&&s.pending.player===p)) break;
      const before=s.deck.length, hand=s.players[p].hand.slice(), n=ap(s,a); if(!n) break; out.push(a); s=n;
      if(a.t==='endTurn'||a.t==='reclaim') { if(!(s.pending&&s.pending.player===p)) break; continue; }
      if(s.deck.length<before||(s.reveal&&s.reveal.to===p)||s.players[p].hand.some(u=>!hand.includes(u))) break; }
    return out; }
  // The Genius's next actions in the real game st0 (its turn, nothing pending).
  function geniusDecide(st0,p){ const t0=now(), R=rng(seedOf(st0,p)), W=[]; for(let i=0;i<GENIUS.worlds;i++) W.push(determinize(st0,p,R));
    const w0=Object.assign({},W[0],{_botLog:[]}), pl=w0.players[p]; let lines;
    if(!(w0.turn&&w0.turn.started)){
      lines=[[{t:'startTurn'}]];
      if(pl.meeples===0&&pl.foundationPlaced) E.kingdom(w0,p).map(k=>({k,c:w0.cards[E.top(w0,k)]})).filter(o=>!o.c.fixed&&!o.c.ascended)
        .map(o=>({k:o.k,w:E.cardValue(w0,o.k,p)+2*E.cardIncome(w0,o.k)})).sort((a,b)=>a.w-b.w).slice(0,2).forEach(o=>lines.push([{t:'reclaim',k:o.k}]));
      if(lines.length===1) return lines[0]; }
    else { const stats=newStats(); lines=openings(w0,p).map(o=>{ let s=mainPhase(o.s,p,'gsim',stats), e=ap(s,{t:'endTurn'}); if(e&&e.pending) e=resolve(e,p,'gsim'); return (e||s)._botLog||[]; }); }
    const tot=lines.map(()=>0); let done=0;
    for(let i=0;i<W.length;i++){ if(i>0&&now()-t0>GENIUS.budget) break;
      lines.forEach((acts,j)=>{ tot[j]+=rollout(replay(W[i],acts),p); }); done++; }
    let best=0; tot.forEach((v,j)=>{ if(v>tot[best]) best=j; });
    if(GENIUS.debug) GENIUS.debug({lines,values:tot.map(v=>v/done),best,worlds:done,ms:now()-t0});
    const out=prefix(W[0],p,lines[best]);
    return out.length?out:[{t:w0.turn&&w0.turn.started?'endTurn':'startTurn'}]; }
  // The Genius's answer to a prompt addressed to it, tried in imagined worlds (a choice of several cards falls back
  // to keeping what its archetype needs).
  function geniusChoose(st0,p){ const pd=st0.pending; let opts=null;
    if(pd.kind==='cell') opts=pd.options.concat(pd.optional?[null]:[]);
    else if(pd.kind==='suit'||pd.kind==='player') opts=pd.options;
    else if(pd.kind==='confirm') opts=[true,false];
    else if(pd.kind==='hand'&&pd.count===1&&(pd.options||[]).length<=10) opts=pd.options.map(u=>[u]);
    if(!opts||opts.length<2||opts.length>16) return choose(st0,p,'tactician');
    const R=rng(seedOf(st0,p)), tot=opts.map(()=>0), ok=opts.map(()=>0);
    for(let i=0;i<GENIUS.worlds;i++){ const w=determinize(st0,p,R); if(!w.pending) break;
      opts.forEach((o,j)=>{ let n=ap(w,{t:'answer',v:o}); if(!n) return; n=resolve(n,p,'gsim'); if(!n) return; tot[j]+=gEval(n,p); ok[j]++; }); }
    let best=-1; opts.forEach((o,j)=>{ if(ok[j]&&(best<0||tot[j]/ok[j]>tot[best]/ok[best])) best=j; });
    return best<0?choose(st0,p,'tactician'):opts[best]; }
  // A whole Genius turn in the real game (the simulator): decide, play the part it is sure of, look again.
  function geniusTurn(st,stats,strats){ const p=st.cur; let g=0;
    while(st&&st.winner==null&&st.cur===p&&g++<80){
      if(st.pending){ st=resolve(st,p,'genius',strats); continue; }
      if(st.reveal){ st=ap(st,{t:'closeReveal'})||st; if(st.reveal) break; continue; }
      let moved=false;
      for(const a of geniusDecide(st,p)){ const n=ap(st,a); if(!n) break; st=n; moved=true;
        if(a.t==='play'||a.t==='cast'){ const id=st.cards[a.uid]&&st.cards[a.uid].def; if(id) stats.played[id]=(stats.played[id]||0)+1; }
        if(a.t==='ability'){ const u=E.top(st,a.k), id=u&&st.cards[u].def; if(id) stats.abil[id]=(stats.abil[id]||0)+1; }
        if(st.cur!==p||st.pending) break; }
      if(!moved){ const n=ap(st,{t:st.turn&&st.turn.started?'endTurn':'startTurn'}); if(!n) return null; st=n; } }
    return st; }

  function plan(st0,style){
    if(style==='genius') return geniusDecide(st0,st0.cur);
    const st=Object.assign({},st0,{_botLog:[]}), end=turn(st,newStats(),st0.players.map(()=>style));
    return end&&end._botLog.length ? end._botLog : [{t:st0.turn&&st0.turn.started?'endTurn':'startTurn'}]; }

  return { STYLES: ['greedy', 'tactician', 'raider', 'warlord', 'genius'], GENIUS: GENIUS, RACE: RACE, plan: plan, choose: choose, resolve: resolve, turn: turn, newStats: newStats, evalState: evalState,
    profile: profile, goal: goal, keepValue: keepValue, determinize: determinize, gEval: gEval };
})();
if (typeof module !== 'undefined') module.exports = KBots;
