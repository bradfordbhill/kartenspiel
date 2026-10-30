const fs=require('fs'); const files=fs.readdirSync(__dirname + '/simout').filter(f=>f.endsWith('.json'));
let G=[], played={}, abil={}, left=[], inc=[], cards={};
files.forEach(f=>{ const o=JSON.parse(fs.readFileSync(__dirname + '/simout/'+f)); G=G.concat(o.games); for(const k in o.stats.played) played[k]=(played[k]||0)+o.stats.played[k]; for(const k in o.stats.abil) abil[k]=(abil[k]||0)+o.stats.abil[k]; left=left.concat(o.stats.left); inc=inc.concat(o.stats.inc);
  for(const id in o.cards){ const a=cards[id]=cards[id]||{v:[],i:[],win:0,any:0,exp:0}; const b=o.cards[id]; a.v=a.v.concat(b.v); a.i=a.i.concat(b.i); a.win+=b.win; a.any+=b.any; a.exp+=b.exp; } });
const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?a[a.length>>1]:null}, avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const out={};
out.byN=[2,3,4].map(n=>{ const g=G.filter(x=>x.n===n), fin=g.filter(x=>x.winner!=null); return {n,games:g.length,finished:fin.length,finishedPct:Math.round(100*fin.length/g.length),medRounds:med(fin.map(x=>x.rounds)),
  ruins:+avg(g.map(x=>x.ruins)).toFixed(2),over:+avg(g.map(x=>x.over)).toFixed(2),curses:+avg(g.map(x=>x.curses)).toFixed(2),defended:+avg(g.map(x=>x.defended)).toFixed(2),ascended:+avg(g.map(x=>x.ascended)).toFixed(3),elim:+avg(g.map(x=>x.elim)).toFixed(3)}; });
function rates(key){ const r={}; G.forEach(x=>{ x[key].forEach((a,i)=>{ const o=r[a]=r[a]||{seats:0,wins:0,exp:0,score:[]}; o.seats++; o.exp+=1/x.n; o.score.push(x.scores[i]); if(x.winner===i) o.wins++; }); });
  return Object.keys(r).map(a=>({name:a,seats:r[a].seats,wins:r[a].wins,winPct:+(100*r[a].wins/r[a].seats).toFixed(1),winIndex:+(r[a].wins/r[a].exp).toFixed(2),medScore:med(r[a].score)})).sort((a,b)=>b.winIndex-a.winIndex); }
out.arch=rates('archs'); out.strat=rates('strats');
out.archByN={}; [2,3,4].forEach(n=>{ const sub=G.filter(x=>x.n===n); const r={}; sub.forEach(x=>x.archs.forEach((a,i)=>{const o=r[a]=r[a]||{s:0,w:0}; o.s++; if(x.winner===i)o.w++;})); out.archByN[n]=Object.fromEntries(Object.keys(r).map(a=>[a,+(100*r[a].w/r[a].s).toFixed(0)])); });
const AS={}; G.forEach(x=>x.archs.forEach((a,i)=>{ const k=a+'|'+x.strats[i]; const o=AS[k]=AS[k]||{s:0,w:0,e:0}; o.s++; o.e+=1/x.n; if(x.winner===i)o.w++; })); out.archStrat=Object.fromEntries(Object.keys(AS).map(k=>[k,{seats:AS[k].s,winIndex:+(AS[k].w/AS[k].e).toFixed(2)}]));
const seat={}; G.forEach(x=>x.archs.forEach((a,i)=>{ const k=x.n+'p seat '+(i+1); const o=seat[k]=seat[k]||{s:0,w:0,e:0}; o.s++; o.e+=1/x.n; if(x.winner===i)o.w++; })); out.seat=Object.fromEntries(Object.keys(seat).map(k=>[k,+(seat[k].w/seat[k].e).toFixed(2)]));
out.ap={avgIncome:+avg(inc).toFixed(1),avgLeft:+avg(left).toFixed(1),unspentPct:Math.round(100*avg(left)/avg(inc))};
out.cards=Object.keys(cards).map(id=>{const c=cards[id];return {id,owned:c.any,val:+avg(c.v).toFixed(1),inc:+avg(c.i).toFixed(1),winIndex:c.exp?+(c.win/c.exp).toFixed(2):null,played:played[id]||0,abil:abil[id]||0}}).sort((a,b)=>b.winIndex-a.winIndex);
out.total=G.length; out.played=played; out.abil=abil;
fs.writeFileSync(__dirname + '/analysis2.json',JSON.stringify(out,null,1));
console.log(JSON.stringify({total:out.total,byN:out.byN,arch:out.arch,strat:out.strat,archByN:out.archByN,seat:out.seat,ap:out.ap},null,0));
console.log('archStrat',JSON.stringify(out.archStrat));
console.log('top cards',out.cards.filter(c=>c.owned>=15).slice(0,12).map(c=>c.id+' '+c.winIndex+' v'+c.val+' i'+c.inc+' n'+c.owned).join(' | '));
console.log('bottom cards',out.cards.filter(c=>c.owned>=15).slice(-12).map(c=>c.id+' '+c.winIndex+' v'+c.val+' i'+c.inc+' n'+c.owned).join(' | '));
console.log('never/rarely owned', out.cards.filter(c=>c.owned<15).map(c=>c.id+':'+c.owned).join(', '));
console.log('abilities', JSON.stringify(abil)); 
console.log('least played', Object.entries(played).sort((a,b)=>a[1]-b[1]).slice(0,12).map(e=>e.join(':')).join(', '));
