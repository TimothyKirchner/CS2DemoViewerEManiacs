// Anti-strat report: a per-map "how to beat them" page built from the roster, buy library, positions and
// tendencies. Every habit carries its sample ("12 of 15 rounds") and evidence round references; the counter
// ideas are heuristics, not predictions.
import {opponentRounds} from './opponent.mjs';
import {buyLibrary} from './opponent-buys.mjs';
import {positionAnalysis} from './opponent-positions.mjs';
import {tendencyAnalysis} from './opponent-tendencies.mjs';
import {escapeHtml as esc} from './scouting.mjs';

// Editable default pool (CS2 Active Duty as assumed for late 2026). Maps outside the pool still get pages.
export const DEFAULT_POOL=Object.freeze(['de_ancient','de_anubis','de_dust2','de_inferno','de_mirage','de_nuke','de_overpass']);
// A habit is reported when it holds in at least `share` of at least `minRounds` rounds.
export const HABIT_LIMITS=Object.freeze({minRounds:4,anchorShare:.6,tAnchorShare:.45,tradeEdge:.1,setupShare:.4,stackShare:.3,utilityShare:.5,awpShare:.5,placeOpenings:5,lowTrade:.35,forceShare:.5,minClutches:4,minCounter:5,retakeHigh:.45,retakeLow:.2,tUtilityShare:.25,duelEdge:.15,tightTiming:4,minTimingRounds:5});
const SMALL=10,MIN_COUNTER=8;
const pct=v=>`${Math.round(v*100)}%`;
// Wording follows the number: "most" only from 60 %.
export const often=share=>share>=.6?'in most rounds':share>=.4?'in about half of the rounds':'in some rounds';
const sideName=s=>s===2?'T':'CT';
const of=(n,total,unit='rounds')=>`${n} of ${total} ${unit}`;
const ref=e=>e&&{entryId:e.entryId,roundIndex:e.roundIndex,number:e.number,source:e.source,tick:e.tick};
const refs=list=>(list??[]).filter(Boolean).slice(0,5).map(ref);

// Round and match results of the target team per map, from every matched round (stand-ins included).
export function opponentMapResults(entries,detection){
  const byId=new Map(entries.map(e=>[e.id,e])),maps=new Map();
  for(const d of detection.demos){
    const entry=byId.get(d.entryId);if(!entry)continue;
    const m=maps.get(d.map)??{map:d.map,demos:0,matchWins:0,matchLosses:0,matchDraws:0,rounds:0,wins:0,decided:0,sides:{2:{wins:0,decided:0},3:{wins:0,decided:0}},entryIds:[]};
    let own=0,opp=0;
    entry.replay.rounds.forEach((round,i)=>{const side=d.sides[i],winner=Number(round.winner);if(!side)return;m.rounds++;if(![2,3].includes(winner))return;
      m.decided++;m.sides[side].decided++;if(winner===side){m.wins++;m.sides[side].wins++;own++;}else opp++;});
    m.demos++;m.entryIds.push(d.entryId);if(own>opp)m.matchWins++;else if(own<opp)m.matchLosses++;else m.matchDraws++;
    maps.set(d.map,m);
  }
  return [...maps.values()].map(m=>({...m,winRate:m.decided?m.wins/m.decided:null,sample:of(m.wins,m.decided,'decided rounds won'),
    sideRates:Object.fromEntries([2,3].map(s=>[s,m.sides[s].decided?m.sides[s].wins/m.sides[s].decided:null]))}))
    .sort((a,b)=>(b.winRate??-1)-(a.winRate??-1)||a.map.localeCompare(b.map));
}

// Heuristic veto: ban their strongest map, pick their weakest; unseen pool maps are unknowns, not weaknesses.
export function vetoSuggestion(results,{pool=DEFAULT_POOL,minRounds=HABIT_LIMITS.minRounds*4}={}){
  const inPool=new Set(pool),seen=results.filter(r=>inPool.has(r.map)&&r.decided>0),reliable=seen.filter(r=>r.decided>=minRounds);
  const ranked=(reliable.length?reliable:seen).slice().sort((a,b)=>b.winRate-a.winRate||b.decided-a.decided);
  const ban=ranked[0]??null,pick=ranked.length>1?ranked[ranked.length-1]:null,unseen=pool.filter(m=>!results.some(r=>r.map===m));
  const line=r=>`${r.map}: ${pct(r.winRate)} of rounds won (${r.sample}), matches ${r.matchWins}-${r.matchLosses}${r.matchDraws?`-${r.matchDraws}`:''}`;
  const notes=['Heuristic: based only on the imported demos of this opponent, not on your own map strength.'];
  if(!reliable.length&&seen.length)notes.push(`Small sample: no map has ${minRounds}+ decided rounds.`);
  const thin=seen.filter(r=>r.demos<2).map(r=>`${r.map} (${r.demos} demo)`);
  if(thin.length)notes.push(`Weak data: only one demo for ${thin.join(', ')}; one match result can flip this ranking.`);
  if(unseen.length)notes.push(`No demos for ${unseen.join(', ')}: they may be their permaban or untested, so treat them as unknown.`);
  return {ban:ban&&{map:ban.map,reason:`${ban.demos<2?'Highest round win rate, weak data (1 demo)':'Their strongest map'}. ${line(ban)}.`},pick:pick&&pick.map!==ban?.map?{map:pick.map,reason:`${pick.demos<2?'Lowest round win rate, weak data (1 demo)':'Their weakest map'}. ${line(pick)}.`}:null,
    ranking:ranked.map(line),unseen,notes,heuristic:true};
}

const habit=(kind,text,count,total,counter,evidence,extra={})=>({kind,text,count,total,share:total?count/total:0,sample:of(count,total),
  small:total<SMALL,counter:total<MIN_COUNTER?'':total<SMALL?`Check the evidence rounds first. ${counter}`:counter,evidence:refs(evidence),heuristic:true,...extra});

// Top reads of one map: the strongest non-small habits on both sides, weighted by share and sample size.
export function topReads(sides,n=3){
  const all=sides.flatMap(s=>s.habits.filter(h=>!h.small&&!['starts','plants'].includes(h.kind)).map(h=>({...h,side:s.side})));
  return all.sort((a,b)=>b.share*Math.sqrt(b.total)-a.share*Math.sqrt(a.total)).slice(0,n).map(({side,...h})=>({...h,side,ref:sides.find(s=>s.side===side).habits.find(x=>x.text===h.text)}));
}

// Exploitable habits of one map side. `pos` = sideSetups(), `tend` = one side of tendencyAnalysis(), `buys` =
// buyLibrary side. Only core players are named; stand-ins appear as team totals and stand-in notes.
export function sideHabits(side,{pos,tend,buys},limits=HABIT_LIMITS){
  const out=[],L={...HABIT_LIMITS,...limits},rounds=tend?.rounds??pos?.rounds??0;
  if(rounds<L.minRounds)return out;
  for(const p of pos?.players??[])if(p.rounds>=L.minRounds&&p.count/p.rounds>=(side===2?L.tAnchorShare:L.anchorShare))
    out.push(habit('position',`${p.place} (${p.zone}) ${side===3?'anchored':'taken'} by ${p.name}`,p.count,p.rounds,
      side===3?`Expect ${p.name} on ${p.place}; pre-plan flashes or a utility clear for that spot.`:`Expect ${p.name} on ${p.place} at 20 s; hold an angle on it early.`,p.evidence,{player:p.name}));
  const setup=pos?.setups?.[0];
  const at=side===3?'15 s':'20 s',aliveNote=g=>{const n=Object.values(g?.zones??{}).reduce((a,b)=>a+b,0);return n&&n<5?`, ${n} alive (one died before ${at})`:'';};
  if(setup&&pos.rounds>=L.minRounds&&setup.share>=L.setupShare)out.push(habit('setup',`Default ${side===3?'CT setup':'T spread'} (living players at ${at}): ${setup.label}${aliveNote(setup)}`,setup.count,pos.rounds,
    side===3?`Hit the site with the fewest players in this setup (${setup.label}).`:'Their spread at 20 s is predictable; plan a mid-round rotate against it.',setup.evidence));
  // T side without a dominant spread still gets its most common one, so the IGL sees the structure.
  // T starts per core player at 20 s (by callout, since mid lanes all count as "mid" in the spread).
  if(side===2&&pos.rounds>=SMALL){const seen=new Set(),starts=(pos.players??[]).filter(p=>p.rounds>=L.minRounds&&!seen.has(p.name)&&seen.add(p.name)).slice(0,5);
    if(starts.length)out.push(habit('starts',`T starts at 20 s (share of each player's rounds): ${[...starts].sort((a,b)=>b.count/b.rounds-a.count/a.rounds).map(p=>`${p.name} ${p.place} ${pct(p.count/p.rounds)}`).join(', ')}`,starts.filter(p=>p.count/p.rounds>=.4).length,starts.length,
      '',starts.flatMap(p=>p.evidence??[]).slice(0,5),{unit:'core players on a 40 %+ spot',small:false,countsOnly:true,
      counter:'Use these as the first spots to check with utility or info; a share under 50 % is a lean, not a default.'}));}
  // A T spread under the default threshold is not shown: per-player T starts carry that information.
  const awp=pos?.awp?.spots?.[0];
  if(awp&&pos.awp.rounds>=L.minRounds&&awp.share>=L.awpShare)out.push(habit('awp',`AWP on ${awp.place} (${awp.zone})${awp.holders[0]&&!awp.holders[0].label.startsWith('stand-in')?`, usually ${awp.holders[0].label}`:''}`,awp.count,pos.awp.rounds,
    'Smoke or flash that AWP angle before you cross it.',awp.evidence,{unit:'AWP rounds'}));
  const st=tend?.stacks;
  if(st&&st.sampled>=L.minRounds&&st.stacks.share>=L.stackShare){const tie=st.stacks.A===st.stacks.B,site=st.stacks.A>st.stacks.B?'A':'B',other=site==='A'?'B':'A';
    out.push(habit('stack',`Stack ${st.minPlayers}+ on one site (A ${st.stacks.A}, B ${st.stacks.B})`,st.stacks.count,st.sampled,
      side===3?(tie?'They stack either site: get early info before you commit.':`Show early presence at ${site} to keep the stack there, then hit ${other}.`)
        :(tie?'They commit 4+ to one site, either A or B: hold passive, delay and retake as five.':`Expect a ${st.minPlayers}-player hit on ${site}; play ${site} heavier and retake ${other}.`),st.stacks.evidence));}
  if(side===3&&st&&st.plants.count>=L.minRounds&&(st.plants.retakeShare>=L.retakeHigh||st.plants.retakeShare<=L.retakeLow))out.push(habit('retake',`Site left empty at the plant (no living CT on the plant site)`,st.plants.retakes,st.plants.count,
    st.plants.retakeShare>=L.retakeHigh?'They give up sites often and retake: plant fast and set a post-plant crossfire.':'They hold sites until the plant: bring utility for the entry.',[],{unit:'plants'}));
  const o=tend?.duels?.openings;
  // Only a clear edge over a 50 % coin flip is a habit (default 15 points).
  if(o&&o.count>=L.minRounds&&Math.abs(o.winRate-.5)>=L.duelEdge)out.push(habit('openings',`Opening duels won`,o.wins,o.count,
    o.winRate>=.5?'They win the first duel often: avoid dry peeks, trade in pairs.':'They lose the first duel often: take early fights with a trade ready.',[],{unit:'openings'}));
  // Opening spots where they clearly win or clearly lose the first duel (70 % / 30 %).
  for(const p of (tend?.duels?.places??[]).filter(p=>p.count>=L.placeOpenings&&(p.wins/p.count>=.7||p.wins/p.count<=.3)).slice(0,3))out.push(habit('opening-place',`Opening duels at ${p.place} (${p.zone}) won`,p.wins,p.count,
    p.wins/p.count>=.7?`Do not dry-peek ${p.place}; use utility or a second angle.`:`Challenge ${p.place} early: they lose that duel more often than not.`,p.evidence,{unit:'openings there'}));
  const tr=tend?.duels?.trades;
  // Trades against a baseline: their opponents' trade rate in the same rounds; 10+ points apart is a habit.
  const base=tr?.baseline;
  if(tr&&tr.deaths>=L.minRounds*2&&base?.deaths>=L.minRounds*2&&Math.abs(tr.share-base.share)>=L.tradeEdge){const low=tr.share<base.share;
    out.push(habit('trades',`Deaths traded within ${tr.seconds} s (their opponents: ${pct(base.share)} of ${base.deaths})`,tr.traded,tr.deaths,
      low?'They trade less than their opponents: isolate players and take 1v1 fights.':'They trade more than their opponents: do not take fights you cannot trade back.',tr.evidence,{unit:'deaths'}));}
  for(const [type,label] of [['smoke','Smoke'],['fire','Molly'],['flash','Flash']]){
    const c=tend?.utility?.types?.[type]?.clusters?.[0];
    // Clusters without a nearby callout are dropped: raw coordinates are not usable before a match.
    if(!c||!c.place||c.place==='unknown'||c.share<(side===2?L.tUtilityShare:L.utilityShare)||rounds<L.minRounds||(side===2&&c.share<L.utilityShare&&c.rounds<MIN_COUNTER))continue;
    // "Fixed timing" only for a tight window (25-75 % range <= 4 s) seen in 5+ rounds; otherwise just the window.
    const fixed=c.lateSeconds-c.earlySeconds<=L.tightTiming&&c.rounds>=L.minTimingRounds;
    out.push(habit('utility',`${label} near ${c.place} at ${c.medianSeconds.toFixed(0)} s (25-75 %: ${c.earlySeconds.toFixed(0)}-${c.lateSeconds.toFixed(0)} s)${fixed?', fixed timing':', timing varies'}`,c.rounds,rounds,
      fixed?(side===3?`Their CT ${label.toLowerCase()} there lands by ${c.lateSeconds.toFixed(0)} s: do not walk into it; wait it out or take another lane.`
          :`Hold that area before ${c.earlySeconds.toFixed(0)} s or play off it: their ${label.toLowerCase()} lands at a fixed time, so it marks the start of their move.`)
        :`Expect ${label.toLowerCase()} there ${often(c.share)}, but the timing varies (${c.earlySeconds.toFixed(0)}-${c.lateSeconds.toFixed(0)} s): do not plan a timing around it.`,c.evidence,{fixed}));
  }
  // T plant split over all buys: the site structure even without a full-buy default.
  if(side===2){const plants={A:0,B:0};for(const t of (buys?.types??[]).filter(t=>t.type!=='post-plant-save')){for(const r of t.routes??[]){const m=/^([AB]) plant$/.exec(r.name);if(m)plants[m[1]]+=r.count;}}
    const site=plants.A>=plants.B?'A':'B',n=plants.A+plants.B,even=Math.abs(plants.A-plants.B)<=Math.max(1,n*.1);
    if(rounds>=SMALL&&n)out.push(habit('plants',`Plant split: A ${plants.A} / B ${plants.B} / no plant ${Math.max(0,rounds-n)}; ${even?'even split':`${site} most`}`,plants[site],n,
      !even&&plants[site]/n>=.65?`They favour ${site}: lean one extra player toward ${site} and rotate early from the other site.`:'No site preference: play standard and rotate on info.',[],{unit:'plants',countsOnly:even}));}
  // T full buys: the plant site they choose most (rounds without a plant do not count as a route).
  const full=(buys?.types??[]).find(t=>t.type==='full'),plant=full?.routes?.find(r=>/^[AB] plant$/.test(r.name));
  if(side===2&&plant&&full.count>=L.minRounds&&plant.count/full.count>=L.setupShare){const site=plant.name[0];
    out.push(habit('route',`Full buys plant ${site}`,plant.count,full.count,`On their full buys, play one extra player toward ${site}.`,[],{unit:'full-buy rounds'}));}
  const cl=(tend?.players?.players??[]).filter(p=>p.clutchAttempts>=L.minClutches).sort((a,b)=>b.clutchWins-a.clutchWins)[0];
  if(cl&&cl.clutchWins/cl.clutchAttempts>=.5)out.push(habit('clutch',`${cl.name} clutches`,cl.clutchWins,cl.clutchAttempts,
    '',[],{unit:'clutches',player:cl.name}));
  return out.sort((a,b)=>Number(a.small)-Number(b.small)||b.share-a.share);
}

// Economy habits (team level, all maps): force after a lost pistol and after a lost buy round.
export function economyNotes(economy,limits=HABIT_LIMITS){
  const counter={eco:'Expect an eco: play anti-eco, keep distance and do not give away rifles.',force:'Expect a force: play at range and avoid giving them easy rifle kills.',
    half:'Expect a half buy: play at range and avoid giving them easy rifle kills.',full:'Expect a full buy: bring your full utility.','anti-eco':'They full buy into your eco: save or play for exit kills.'};
  return (economy?.rows??[]).filter(r=>r.count>=limits.minRounds).map(r=>{const next=[...(r.next??[])].sort((a,b)=>b.count-a.count)[0],force=(r.force??0)+(r.half??0);
    return next?habit('economy',`${r.label}: next round mostly ${next.label.toLowerCase()}${next.type==='anti-eco'?' (full buy against your eco)':''}`,next.count,r.count,counter[next.type]??'Check the rounds before planning around it.',[],{unit:'rounds',force})
      :habit('economy',`${r.label}: force or half buy next`,force,r.count,force/r.count>=limits.forceShare?counter.force:counter.eco,[],{unit:'rounds'});});
}

export function standInNotes(detection,map){
  const demos=detection.demos.filter(d=>!map||d.map===map),notes=[];
  for(const p of detection.players.filter(p=>!p.core&&(!map||p.maps.includes(map))))notes.push(`${p.name}: ${p.description}. Not named in player habits; counts only in team totals.`);
  const withStandIns=demos.filter(d=>d.standIns.length);
  if(withStandIns.length)notes.push(`${of(withStandIns.length,demos.length,'demos')} on ${map||'all maps'} had a stand-in. Spots of absent core players are labelled "filled by stand-in".`);
  return notes;
}

// Everything for the report. Pass results of earlier steps to avoid recomputing them.
export function antiStratReport(entries,detection,{mapDefs={},pool=DEFAULT_POOL,lib,positions,tendencies,title='How to beat them',notes=''}={}){
  const r=opponentRounds(entries,detection);lib??=buyLibrary(entries,r,{mapDefs});
  positions??=positionAnalysis(entries,detection,r,{mapDefs,buyRounds:lib.rounds});tendencies??=tendencyAnalysis(entries,detection,r,{mapDefs,buyRounds:lib.rounds});
  const results=opponentMapResults(entries,detection);
  const maps=results.map(res=>{const pm=positions.maps.find(m=>m.map===res.map),tm=tendencies.maps.find(m=>m.map===res.map),bm=lib.maps.find(m=>m.map===res.map);
    const side=s=>({side:s,rounds:(s===2?tm?.t:tm?.ct)?.rounds??0,habits:sideHabits(s,{pos:s===2?pm?.t:pm?.ct,tend:s===2?tm?.t:tm?.ct,buys:bm?.sides.find(x=>x.side===s)})});
    const sides=[side(3),side(2)];return {map:res.map,results:res,sites:Boolean(pm?.sites),sides,top:topReads(sides),standIns:standInNotes(detection,res.map).filter(n=>!n.includes('Not named in player habits'))};});
  return {title,notes,generated:new Date().toISOString().slice(0,10),demos:detection.demos.length,total:detection.total,rounds:r.length,
    core:detection.players.filter(p=>p.core).map(p=>({name:p.name,description:p.description})),standIns:standInNotes(detection),
    veto:vetoSuggestion(results,{pool}),economy:economyNotes(tendencies.economy),maps,
    warnings:['Heuristic: every habit and counter idea below is a pattern in the imported demos, not a prediction. Check the sample size before relying on it; "small sample" marks fewer than 10 rounds.',
      'Team-level numbers use every matched round, stand-ins included. Named player habits use core players only.',
      ...positions.warnings.slice(0,2),...tendencies.warnings.slice(2,4)]};
}

const evidenceText=e=>`R${e.number} · ${e.source}${Number.isFinite(e.tick)?` (tick ${e.tick})`:''}`;

// Markdown or a standalone HTML page. With `play` set, HTML evidence becomes viewer buttons (data-play);
// `fragment` returns a <div> for embedding (prepReport sections, the in-app preview).
export function renderAntiStrat(report,format='markdown',{play=false,fragment=play}={}){
  const md=format==='markdown',h=s=>md?String(s??''):esc(s);
  const ev=list=>list.length?(md?` Evidence: ${list.map(evidenceText).join('; ')}.`:` <span class="report-evidence">${list.map(e=>play?`<button class="scout-evidence" data-play="${esc(e.entryId)}" data-round="${e.roundIndex}" data-tick="${Number.isFinite(e.tick)?e.tick:''}">▶ ${esc(evidenceText(e))}</button>`:esc(evidenceText(e))).join(' · ')}</span>`):'';
  const item=x=>{const head=x.countsOnly?`${h(x.text)}.`:`${h(x.text)}: ${h(pct(x.share))} (${h(of(x.count,x.total,x.unit??'rounds'))})${x.small?' — small sample':''}.`,counter=x.counter?`${md?'*':'<em>'}Counter (heuristic):${md?'*':'</em>'} ${h(x.counter)}`:'Too few rounds for a counter.';
    return md?`- ${head} ${counter}${ev(x.evidence)}`:`<li>${head} ${counter}${ev(x.evidence)}</li>`;};
  const list=items=>items.length?(md?items.map(item).join('\n'):`<ul>${items.map(item).join('')}</ul>`):(md?'- No habit above the thresholds.':'<p class="muted">No habit above the thresholds.</p>');
  const plain=lines=>md?lines.map(l=>`- ${l}`).join('\n'):`<ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`;
  const H=(n,t)=>md?`${'#'.repeat(n)} ${t}`:`<h${n}>${esc(t)}</h${n}>`,P=t=>md?t:`<p>${esc(t)}</p>`;
  const v=report.veto,parts=[H(1,report.title),report.notes?P(report.notes):'',
    P(`Scope: ${report.demos} of ${report.total} demos matched, ${report.rounds} target-team rounds. Generated ${report.generated}.`),
    H(2,'Heuristics'),plain(report.warnings),
    H(2,'Roster'),plain([...report.core.map(p=>`${p.name}: ${p.description}`),...report.standIns]),
    H(2,'Map veto suggestion (heuristic)'),plain([v.ban?`Ban ${v.ban.map}: ${v.ban.reason}`:'Ban: no data.',v.pick?`Pick ${v.pick.map}: ${v.pick.reason}`:'Pick: not enough maps with data.',...v.ranking.map(x=>`Ranking: ${x}`),...v.notes]),
    H(2,'Economy (all maps)'),list(report.economy)];
  for(const m of report.maps){const r=m.results;
    parts.push(H(2,`${m.map}: how to beat them`),P(`${r.demos} ${r.demos===1?'demo':'demos'}, matches ${r.matchWins}-${r.matchLosses}${r.matchDraws?`-${r.matchDraws}`:''}; rounds won ${r.winRate===null?'—':pct(r.winRate)} (${r.sample}); CT ${r.sideRates[3]===null?'—':pct(r.sideRates[3])}, T ${r.sideRates[2]===null?'—':pct(r.sideRates[2])}.${m.sites?'':' No calibrated bombsites for this map: zones fall back to callouts only.'}`));
    const top=(m.top??[]).map(h=>({...h,text:`${sideName(h.side)}: ${h.text}`}));
    parts.push(H(3,'Top reads (10+ rounds)'),top.length?list(top):P('No habit with 10+ rounds yet: treat every line below as a lead to check in the evidence rounds.'));
    const shown=new Set((m.top??[]).map(t=>t.ref));for(const s of m.sides)parts.push(H(3,`Their ${sideName(s.side)} side (${s.rounds} rounds, top reads not repeated)`),list(s.habits.filter(x=>!shown.has(x))));
    if(m.standIns.length)parts.push(H(3,'Stand-in notes'),plain(m.standIns));
  }
  const body=parts.filter(Boolean).join(md?'\n\n':'\n');
  return md?`${body}\n`:fragment?`<div class="anti-strat">${body}</div>`:`<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(report.title)}</title><style>body{font:15px/1.45 system-ui;max-width:60rem;margin:2rem auto;padding:0 1rem}li{margin:.3rem 0}.report-evidence{color:#666;font-size:.9em}.muted{color:#666}</style><body>${body}</body></html>`;
}
