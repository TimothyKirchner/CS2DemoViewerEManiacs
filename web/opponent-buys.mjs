// Opponent analyser, buy-type round library: classify the target team's rounds per map and side from
// equipment value, then describe the typical round of each buy type. Every label here is a heuristic:
// buy intent cannot be proven from equipment, and saved weapons count as bought equipment.

export const BUY_TYPES=Object.freeze([
  ['pistol','Pistol'],['eco','Eco'],['force','Force'],['half','Half buy'],['full','Full buy'],['anti-eco','Anti-eco'],['post-plant-save','Post-plant save'],['unknown','Unknown'],
]);
export const BUY_TYPE_LABELS=Object.freeze(Object.fromEntries(BUY_TYPES));
// Team totals (five players). Starting pistols count, as in the game's own equipment value.
export const THRESHOLDS=Object.freeze({eco:5000,full:20000,antiEcoEnemy:5000,forceBank:1000,valueWindowSeconds:5,siteRadius:1400});

const key=s=>String(s??'').toLowerCase().replace(/^weapon_/,'').replace(/[^a-z0-9]/g,'');
const PRICE_LIST={
  glock18:200,glock:200,usps:200,uspsilencer:200,p2000:200,hkp2000:200,p250:300,dualberettas:300,elite:300,
  fiveseven:500,tec9:500,cz75auto:500,cz75a:500,deserteagle:700,deagle:700,r8revolver:600,revolver:600,
  ak47:2700,m4a4:3100,m4a1:3100,m4a1s:2900,m4a1silencer:2900,famas:2050,galilar:1800,galil:1800,aug:3300,
  sg553:3000,sg556:3000,awp:4750,ssg08:1700,scar20:5000,g3sg1:5000,
  mac10:1050,mp9:1250,mp7:1500,mp5sd:1500,ump45:1200,p90:2350,ppbizon:1400,bizon:1400,
  nova:1050,xm1014:2000,mag7:1300,sawedoff:1100,m249:5200,negev:1700,zeusx27:200,taser:200,
  smokegrenade:300,flashbang:200,hegrenade:300,highexplosivegrenade:300,molotov:400,incendiarygrenade:500,incgrenade:500,decoygrenade:50,decoy:50,
};
export const PRICES=Object.freeze(PRICE_LIST);
const UTILITY={smoke:'smoke',flash:'flash',fire:'fire',he:'he'};

const itemName=item=>typeof item==='string'?item:(item?.name??item?.weapon_name??'');
// Equipment value of one player at one sample: inventory (plus the held weapon when missing), armor, kit.
export function playerValue(p){
  const items=(Array.isArray(p.inventory)?p.inventory:[]).map(i=>key(itemName(i)));
  const held=key(p.weapon);if(held&&!items.includes(held))items.push(held);
  let value=items.reduce((s,i)=>s+(PRICES[i]??0),0);
  if(Number(p.armor)>0)value+=p.hasHelmet||p.has_helmet?1000:650;
  if(p.hasDefuser||p.has_defuser)value+=400;
  return value;
}
const alive=p=>p.alive!==false&&p.hp!==0;

// Highest team value in the first seconds after freeze end (late buys and drops settle by then).
export function teamValue(round,side,rate=64){
  let best=null;
  for(const f of round.frames){
    if(f.tick<round.live)continue;if(f.tick-round.live>THRESHOLDS.valueWindowSeconds*rate)break;
    const ps=f.players.filter(p=>p.team===side&&alive(p));if(!ps.length)continue;
    const known=ps.every(p=>Array.isArray(p.inventory)&&p.inventory.length);
    const value=ps.reduce((s,p)=>s+playerValue(p),0),bank=ps.reduce((s,p)=>s+(Number(p.money)||0),0);
    if(!best||value>best.value)best={value,players:ps.length,meanBank:bank/ps.length,known,tick:f.tick};
  }
  if(!best)return {value:null,players:0,meanBank:0,known:false,scaled:null};
  // Four players scale to a five-player total; fewer is too incomplete to classify.
  return {...best,scaled:best.players>=4?Math.round(best.value*5/best.players):null};
}

// Buy class from equipment value. Post-plant save is a separate behaviour tag (see roundFacts).
export function classifyBuy({pistol=false,own,enemy}){
  if(pistol)return {type:'pistol',reason:'Regulation half-opening round'};
  if(!own?.known||own.scaled===null)return {type:'unknown',reason:'Opening inventory unavailable or fewer than four players'};
  const v=own.scaled,e=enemy?.known&&enemy.scaled!==null?enemy.scaled:null;
  if(v<THRESHOLDS.eco)return {type:'eco',reason:`Team equipment ${v} < ${THRESHOLDS.eco}`};
  if(e!==null&&e<THRESHOLDS.antiEcoEnemy)return {type:'anti-eco',reason:`Enemy equipment ${e} < ${THRESHOLDS.antiEcoEnemy} (enemy eco)`};
  if(v>=THRESHOLDS.full)return {type:'full',reason:`Team equipment ${v} >= ${THRESHOLDS.full}`};
  if(own.meanBank<=THRESHOLDS.forceBank)return {type:'force',reason:`Team equipment ${v}, mean bank ${Math.round(own.meanBank)} after buying (spent out)`};
  return {type:'half',reason:`Team equipment ${v}, mean bank ${Math.round(own.meanBank)} kept (light buy)`};
}

// Nearest calibrated bombsite within the radius, else "mid / other"; unknown without map anchors.
export function siteOf(map,x,y){
  if(!Number.isFinite(map?.scale)||!Object.keys(map?.sites??{}).length||!Number.isFinite(x)||!Number.isFinite(y))return 'unknown';
  let best='mid / other',distance=THRESHOLDS.siteRadius;
  for(const [site,xy] of Object.entries(map.sites)){const d=Math.hypot(x-(map.x+xy[0]*map.scale),y-(map.y-xy[1]*map.scale));if(d<distance){distance=d;best=site;}}
  return best;
}

const lastFrame=round=>{for(let i=round.frames.length-1;i>=0;i--)if(round.frames[i].tick<=round.end)return round.frames[i];return round.frames.at(-1);};
const sideOfEvent=(e,prefix)=>Number(e[`${prefix}_team_num`]);

// Facts for one target-team round: buy, route, first contact, utility, outcome, post-plant save.
export function roundFacts(entry,ref,map){
  const replay=entry.replay,round=replay.rounds[ref.roundIndex],rate=replay.tickRate||64,side=ref.side,enemySide=side===2?3:2;
  const own=teamValue(round,side,rate),enemy=teamValue(round,enemySide,rate);
  const buy=classifyBuy({pistol:(replay.pistols??[]).includes(ref.roundIndex),own,enemy});
  const events=round.events??[];
  const plant=events.find(e=>e.event_name==='bomb_planted'&&e.tick>=round.live);
  const contact=events.find(e=>(e.event_name==='player_hurt'||e.event_name==='player_death')&&e.tick>=round.live&&[2,3].includes(sideOfEvent(e,'user'))&&[2,3].includes(sideOfEvent(e,'attacker'))&&sideOfEvent(e,'user')!==sideOfEvent(e,'attacker'));
  const plantSite=plant?siteOf(map,plant.user_X,plant.user_Y):null;
  // Route: T rounds by plant site (or "no plant"), CT rounds by where the first contact happened.
  const mine=contact&&(sideOfEvent(contact,'user')===side?'user':'attacker');
  const contactSite=contact?siteOf(map,contact[`${mine}_X`],contact[`${mine}_Y`]):null;
  const route=side===2?(plantSite?`${plantSite} plant`:'no plant'):(contactSite?`contact ${contactSite}`:'no contact');
  const utility={smoke:0,flash:0,fire:0,he:0};
  const roster=new Set((round.frames.find(f=>f.tick>=round.live)??round.frames[0])?.players.filter(p=>p.team===side).map(p=>String(p.id))??[]);
  for(const fx of round.effects??[])if(UTILITY[fx.type]&&(fx.team===side||(!fx.team&&roster.has(String(fx.thrower)))))utility[fx.type]++;
  const won=round.incomplete||round.winner==null?null:Number(round.winner)===side;
  const survivors=(lastFrame(round)?.players??[]).filter(p=>p.team===side&&alive(p)).length;
  const postPlantSave=Boolean(plant&&won===false&&survivors>=1);
  return {entryId:ref.entryId,roundIndex:ref.roundIndex,number:round.number,map:replay.map,side,source:replay.source||ref.entryId,live:round.live,
    type:buy.type,reason:buy.reason,value:own.scaled,enemyValue:enemy.scaled,meanBank:Math.round(own.meanBank),route,plantSite,
    contactSeconds:contact?(contact.tick-round.live)/rate:null,contactTick:contact?.tick??null,utility,won,survivors,postPlantSave};
}

const median=v=>{const s=v.filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const top=values=>{const counts=new Map();for(const v of values)if(v)counts.set(v,(counts.get(v)??0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).map(([name,count])=>({name,count}));};

// Typical round of one bucket: most common route, median first contact, mean utility, win rate,
// and a representative round (most common route, contact time nearest the median, then most utility-typical).
export function summarizeBucket(type,rounds,sideTotal){
  const routes=top(rounds.map(r=>r.route)),contact=median(rounds.map(r=>r.contactSeconds));
  const utility=Object.fromEntries(Object.keys(UTILITY).map(k=>[k,rounds.length?rounds.reduce((s,r)=>s+r.utility[k],0)/rounds.length:0]));
  const decided=rounds.filter(r=>r.won!==null),wins=decided.filter(r=>r.won).length;
  const typical=routes[0]?.name,util=r=>Object.keys(UTILITY).reduce((s,k)=>s+Math.abs(r.utility[k]-utility[k]),0);
  const score=r=>(r.route===typical?0:1000)+(contact===null||r.contactSeconds===null?100:Math.abs(r.contactSeconds-contact))+util(r);
  const representative=[...rounds].sort((a,b)=>score(a)-score(b)||a.source.localeCompare(b.source)||a.roundIndex-b.roundIndex)[0]??null;
  return {type,label:BUY_TYPE_LABELS[type],count:rounds.length,sideTotal,sample:`${rounds.length} of ${sideTotal} rounds`,
    routes,route:routes[0]?{...routes[0],sample:`${routes[0].count} of ${rounds.length}`}:null,contactSeconds:contact,contactSample:rounds.filter(r=>r.contactSeconds!==null).length,
    utility,wins,decided:decided.length,winRate:decided.length?wins/decided.length:null,
    representative:representative&&{entryId:representative.entryId,roundIndex:representative.roundIndex,number:representative.number,source:representative.source,tick:representative.live},
    rounds:rounds.map(r=>({entryId:r.entryId,roundIndex:r.roundIndex,number:r.number,source:r.source}))};
}

// Library per map and side. `refs` comes from opponentRounds(); `mapDefs` holds the calibrated site anchors.
export function buyLibrary(entries,refs,{mapDefs={}}={}){
  const byId=new Map(entries.map(e=>[e.id,e])),facts=[];
  for(const ref of refs){const entry=byId.get(ref.entryId);if(entry?.replay.rounds[ref.roundIndex])facts.push(roundFacts(entry,ref,mapDefs[entry.replay.map]));}
  const maps=new Map();
  for(const f of facts){if(!maps.has(f.map))maps.set(f.map,{2:[],3:[]});maps.get(f.map)[f.side].push(f);}
  const out=[...maps].sort((a,b)=>a[0].localeCompare(b[0])).map(([map,sides])=>({map,sites:Boolean(Object.keys(mapDefs[map]?.sites??{}).length),sides:[2,3].map(side=>{
    const rounds=sides[side],buckets=BUY_TYPES.map(([type])=>type).filter(t=>t!=='post-plant-save').map(t=>[t,rounds.filter(r=>r.type===t)]);
    buckets.push(['post-plant-save',rounds.filter(r=>r.postPlantSave)]);
    return {side,rounds:rounds.length,types:buckets.filter(([,list])=>list.length).map(([t,list])=>summarizeBucket(t,list,rounds.length))};
  })}));
  return {maps:out,rounds:facts,warnings:[
    'Heuristic: buy types come from equipment value in the first 5 s (rifles, pistols, grenades, armor, kit); saved weapons count as bought.',
    `Heuristic: eco < ${THRESHOLDS.eco}, full >= ${THRESHOLDS.full}; between them force (mean bank <= ${THRESHOLDS.forceBank} after buying) or half buy; anti-eco when the enemy is below ${THRESHOLDS.antiEcoEnemy}.`,
    'Heuristic: post-plant save = round lost after a plant with at least one target-team player alive. These rounds also count under their buy type.',
    'Route: T rounds by plant site, CT rounds by the bombsite nearest the first contact (within 1400 units, else "mid / other"). Team-level: every matched round counts, stand-ins included.',
  ]};
}
