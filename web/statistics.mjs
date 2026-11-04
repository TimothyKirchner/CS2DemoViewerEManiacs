import {analyzeReplay} from './analysis.mjs';

const idOf=(e,prefix)=>{const x=e[`${prefix}_steamid`];return x==null||String(x)==='0'?null:String(x);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const weaponName=x=>String(x??'unknown').replace(/^weapon_/,'');
const counts=()=>({rounds:0,kills:0,deaths:0,assists:0,headshots:0,openingKills:0,openingDeaths:0,tradeKills:0,tradedDeaths:0,clutchAttempts:0,clutchWins:0,enemyFlashes:0,enemyBlindSeconds:0,teamFlashes:0,damage:0,heDamage:0,fireDamage:0,utilityDamage:0,damageRounds:0,kastRounds:0,kastSuccesses:0,wins:0});
function finish(x){
  const {damageRounds,kastRounds,kastSuccesses,...row}=x;
  row.adr=damageRounds?x.damage/damageRounds:null;
  row.kast=kastRounds?100*kastSuccesses/kastRounds:null;
  if(!kastRounds)for(const k of ['clutchAttempts','clutchWins'])row[k]=null;
  row.damageRounds=damageRounds;row.kastRounds=kastRounds;
  if(!damageRounds)for(const k of ['damage','heDamage','fireDamage','utilityDamage'])row[k]=null;
  return row;
}

/** Aggregate only this imported cohort, never an external ranking.
 * Entries: {id,replay,teamNames:{'team-1':name,'team-2':name},date}.
 * Options: roundRefs:[{entryId,roundIndex}], playerId, side:2|3,
 * tradeWindowSeconds (default 5). Round refs constrain rounds; player/side
 * constrain the subjects, while event context always includes both teams.
 * KAST/clutches require complete broadcast rounds with a fresh 5v5 opening
 * and end snapshot. Legacy/POV recordings retain observed event counts but
 * have null outcome rates and damage metrics. Damage denominators include
 * only complete rounds with explicitly recorded hurt-event coverage.
 * All metrics stop at round_end; retained post-round events are excluded.
 * Teams use user-provided names across demos; unnamed team keys are scoped
 * to a demo because roster-derived team-1 is not a global team identity.
 */
export function computeStatistics(entries,options={}) {
  const tradeWindowSeconds=options.tradeWindowSeconds??5;
  if(!finite(tradeWindowSeconds)||tradeWindowSeconds<0||tradeWindowSeconds>30)throw new RangeError('Trade window must be between 0 and 30 seconds');
  const players=new Map(),teams=new Map(),maps=new Map(),weapons=new Map(),warnings=new Set();
  const coverage={selectedRounds:0,eligibleRounds:0,damageRounds:0,legacyRounds:0,partialRounds:0,observedRounds:0,tradeWindowSeconds};
  const selected=options.roundRefs?new Map(options.roundRefs.map(r=>[`${r.entryId??r.matchId}:${r.roundIndex}`,r])):null;
  for(const entry of entries??[]) {
    const replay=entry.replay;if(!replay?.rounds)continue;
    const rate=replay.tickRate??64,analysis=analyzeReplay(replay),meta=replay.metadata;
    const hasDamage=meta?.eventCoverage?.damage===true;
    const names=new Map((replay.players??[]).map(p=>[String(p.id),p.name]));
    let map=maps.get(replay.map);if(!map){map={map:replay.map,matches:0,rounds:0,kills:0,damage:0,damageRounds:0};maps.set(replay.map,map);}let mapUsed=false;
    for(let ri=0;ri<replay.rounds.length;ri++) {
      if(selected&&!selected.has(`${entry.id}:${ri}`))continue;
      const selectedSides=selected?.get(`${entry.id}:${ri}`)?.sides;
      const r=replay.rounds[ri],opening=r.frames.find(f=>f.tick>=r.live&&f.tick<=r.live+rate*.5);
      const roster=new Map((opening?.players??[]).filter(p=>[2,3].includes(p.team)).map(p=>[String(p.id),p]));
      const end=r.frames.at(-1),fullRoster=[2,3].every(s=>[...roster.values()].filter(p=>p.team===s&&p.alive!==false&&p.hp!==0).length===5);
      const complete=!r.incomplete&&[2,3].includes(Number(r.winner))&&fullRoster&&end?.tick>=r.end-rate*.5&&[...roster.keys()].every(id=>end.players.some(p=>String(p.id)===id))&&meta?.recording==='broadcast'&&meta?.eventCoverage?.deaths===true;
      coverage.selectedRounds++;coverage.observedRounds++;map.rounds++;mapUsed=true;
      if(complete)coverage.eligibleRounds++;else coverage.partialRounds++;
      if(!meta?.eventCoverage)coverage.legacyRounds++;
      const damageCovered=complete&&hasDamage;if(damageCovered){coverage.damageRounds++;map.damageRounds++;}
      const ev=(r.events??[]).filter(e=>e.tick>=r.live&&e.tick<=r.end).sort((a,b)=>a.tick-b.tick);
      // Missing subjects still receive observed counts, but no assumed survival.
      for(const e of ev)for(const prefix of ['user','attacker','assister']){const id=idOf(e,prefix),side=e[`${prefix}_team_num`];if(id&&[2,3].includes(side)&&!roster.has(id))roster.set(id,{id,team:side});}
      const local=new Map(),subject=new Map();
      for(const [id,p] of roster){
        if(options.playerId&&String(options.playerId)!==id||options.side&&Number(options.side)!==p.team||selectedSides&&!selectedSides.includes(p.team))continue;
        let row=players.get(id);if(!row){row={id,name:names.get(id)??id,...counts(),teams:[],maps:[],economy:{},sides:{}};players.set(id,row);}
        const tk=analysis.rounds[ri]?.teams[p.team]?.teamKey??`side-${p.team}`,label=String(entry.teamNames?.[tk]??'').trim(),teamId=label?`name:${label.toLowerCase()}`:`${entry.id}:${tk}`;
        let team=teams.get(teamId);if(!team){team={id:teamId,name:label||`${replay.source??'Imported match'} · ${tk==='team-1'?'started T':tk==='team-2'?'started CT':tk}`,...counts(),economy:{},matches:[]};teams.set(teamId,team);}
        if(!team.matches.includes(entry.id))team.matches.push(entry.id);
        if(!row.teams.includes(teamId))row.teams.push(teamId);if(!row.maps.includes(replay.map))row.maps.push(replay.map);
        local.set(id,counts());subject.set(id,{row,team,side:p.team,buy:analysis.rounds[ri]?.teams[p.team]?.label??'unknown'});
      }
      const sideOf=(e,prefix)=>roster.get(idOf(e,prefix))?.team??e[`${prefix}_team_num`];
      const enemy=e=>idOf(e,'attacker')&&idOf(e,'attacker')!==idOf(e,'user')&&[2,3].includes(sideOf(e,'attacker'))&&[2,3].includes(sideOf(e,'user'))&&sideOf(e,'attacker')!==sideOf(e,'user');
      const bump=(id,k,n=1)=>{if(local.has(id))local.get(id)[k]+=n;};
      const dead=new Set(),deaths=[],attempted=new Set(),alive=new Map([...roster].map(([id,p])=>[id,p.team]));
      const clutches=[];
      const detectClutch=()=>{if(!complete)return;for(const side of [2,3]){const own=[...alive].filter(([,s])=>s===side),opp=[...alive].filter(([,s])=>s!==side);if(own.length===1&&opp.length&& !attempted.has(own[0][0])){attempted.add(own[0][0]);clutches.push({id:own[0][0],side,opponents:opp.length});bump(own[0][0],'clutchAttempts');}}};
      const hp=new Map([...roster].map(([id,p])=>[id,finite(p.hp)?p.hp:100]));
      for(const e of ev){
        const a=idOf(e,'attacker'),v=idOf(e,'user');
        if(e.event_name==='player_death'){
          if(!v||dead.has(v))continue;dead.add(v);bump(v,'deaths');alive.delete(v);
          if(enemy(e)){
            bump(a,'kills');if(e.headshot)bump(a,'headshots');if(local.has(a))map.kills++;
            const w=weaponName(e.weapon);if(!weapons.has(w))weapons.set(w,{weapon:w,kills:0,headshots:0,damage:0,damageCovered:false});const wr=weapons.get(w);if(local.has(a)){wr.kills++;if(e.headshot)wr.headshots++;}
            const assister=idOf(e,'assister');if(assister&&assister!==a&&assister!==v&&roster.get(assister)?.team===sideOf(e,'attacker'))bump(assister,'assists');
            if(!deaths.length){bump(a,'openingKills');bump(v,'openingDeaths');}
            // One killer death can trade multiple teammates, but earns one trade kill.
            const traded=deaths.filter(d=>!d.traded&&d.attacker===v&&d.side===sideOf(e,'attacker')&&e.tick-d.tick<=tradeWindowSeconds*rate);
            if(traded.length){bump(a,'tradeKills');for(const d of traded){d.traded=true;bump(d.victim,'tradedDeaths');}}
            deaths.push({attacker:a,victim:v,side:sideOf(e,'user'),tick:e.tick,traded:false});
          }
          detectClutch();
        }
        if(e.event_name==='player_blind'&&a&&v&&finite(e.blind_duration)&&e.blind_duration>0){if(enemy(e)){bump(a,'enemyFlashes');bump(a,'enemyBlindSeconds',e.blind_duration);}else if(sideOf(e,'attacker')===sideOf(e,'user'))bump(a,'teamFlashes');}
        if(e.event_name==='player_hurt'&&v){
          const before=hp.get(v)??100,damage=finite(e.dmg_health)?Math.max(0,Math.min(e.dmg_health,before)):null;
          if(finite(e.health))hp.set(v,Math.max(0,e.health));else if(damage!==null)hp.set(v,Math.max(0,before-damage));
          if(damageCovered&&damage!==null&&enemy(e)){
            bump(a,'damage',damage);if(local.has(a))map.damage+=damage;
            const w=weaponName(e.weapon),isHE=/^(hegrenade|he)$/i.test(w),isFire=/inferno|molotov|incgrenade|incendiary/i.test(w);
            if(isHE)bump(a,'heDamage',damage);if(isFire)bump(a,'fireDamage',damage);if(isHE||isFire)bump(a,'utilityDamage',damage);
            if(!weapons.has(w))weapons.set(w,{weapon:w,kills:0,headshots:0,damage:0,damageCovered:false});if(local.has(a)){weapons.get(w).damage+=damage;weapons.get(w).damageCovered=true;}
          }
        }
      }
      for(const c of clutches)if(Number(r.winner)===c.side)bump(c.id,'clutchWins');
      const teamSeen=new Set();
      for(const [id,x] of local){const {row,team,side,buy}=subject.get(id);const lastPlayer=end?.players.find(p=>String(p.id)===id),survived=lastPlayer?.alive!==false&&finite(lastPlayer?.hp)&&lastPlayer.hp>0&&!dead.has(id);x.rounds=1;x.damageRounds=damageCovered?1:0;x.kastRounds=complete?1:0;x.kastSuccesses=complete&&(x.kills>0||x.assists>0||survived||x.tradedDeaths>0)?1:0;x.wins=complete&&Number(r.winner)===side?1:0;
        row.economy[buy]??={...counts()};row.sides[side]??={...counts()};team.economy[buy]??={...counts()};
        for(const k of Object.keys(counts())){row[k]+=x[k];row.economy[buy][k]+=x[k];row.sides[side][k]+=x[k];if(!['rounds','wins','damageRounds','kastRounds','kastSuccesses'].includes(k)){team[k]+=x[k];team.economy[buy][k]+=x[k];}}
        if(!teamSeen.has(team.id)){teamSeen.add(team.id);team.rounds++;team.wins+=x.wins;team.damageRounds+=x.damageRounds;team.economy[buy].rounds++;team.economy[buy].wins+=x.wins;team.economy[buy].damageRounds+=x.damageRounds;}
        // Team KAST is a player-round percentage, unlike team ADR (total team damage/round).
        team.kastRounds+=x.kastRounds;team.kastSuccesses+=x.kastSuccesses;team.economy[buy].kastRounds+=x.kastRounds;team.economy[buy].kastSuccesses+=x.kastSuccesses;
      }
    }
    if(mapUsed)map.matches++;
  }
  if(coverage.legacyRounds)warnings.add('Legacy exports do not declare event coverage. Reimport the original demos to calculate ADR and utility damage.');
  if(coverage.partialRounds)warnings.add(`${coverage.partialRounds} selected round(s) have incomplete or unverified visibility; observed counts may be partial. KAST, ADR and clutches exclude them.`);
  if(coverage.damageRounds<coverage.selectedRounds)warnings.add('Damage metrics use only complete broadcast rounds with parsed player_hurt coverage.');
  warnings.add('Flash counts are recorded blind events; blind seconds can overlap. Buy labels are equipment heuristics. Leaderboards describe only the imported cohort.');
  const nested=row=>({...finish(row),economy:Object.fromEntries(Object.entries(row.economy??{}).map(([k,v])=>[k,finish(v)])),...(row.sides?{sides:Object.fromEntries(Object.entries(row.sides).map(([k,v])=>[k,finish(v)]))}:{})});
  return {players:[...players.values()].map(nested).sort((a,b)=>b.kills-a.kills||a.name.localeCompare(b.name)),teams:[...teams.values()].map(nested),maps:[...maps.values()].map(m=>({...m,damage:m.damageRounds?m.damage:null})),weapons:[...weapons.values()].filter(w=>w.kills||w.damageCovered).map(({damageCovered,...w})=>({...w,damage:damageCovered?w.damage:null})).sort((a,b)=>b.kills-a.kills),coverage,warnings:[...warnings]};
}
