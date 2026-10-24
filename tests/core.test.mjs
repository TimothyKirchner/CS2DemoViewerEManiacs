import test from "node:test";
import assert from "node:assert/strict";
import {detectPistols,findRounds,activeEffects,worldToRadar,nextRoundIndex,frameAt,assemble,effectForPath,formatLoadout,visibleGunshots} from "../web/core.mjs";
const players=flip=>Array.from({length:10},(_,i)=>({id:String(i),team:(i<5?2:3)^(flip?1:0),alive:true,x:i,y:0,z:0,yaw:179,hp:100}));
const round=(number,flip=false)=>({number,start:0,live:64,end:640,frames:[{tick:64,players:players(flip)}],effects:[],events:[],grenades:[]});
test("MR12 pistol mode advances directly from R1 to R13 and stops before overtime",()=>{const rounds=Array.from({length:30},(_,i)=>round(i+1,i>=12&&i<24));const pistols=detectPistols(rounds);assert.deepEqual(pistols,[0,12]);assert.equal(nextRoundIndex({rounds,pistols},0,"pistols",false),12);assert.equal(nextRoundIndex({rounds,pistols},12,"pistols",false),null);});
test("legacy MR15, short matches and partial recordings",()=>{assert.deepEqual(detectPistols(Array.from({length:25},(_,i)=>round(i+1,i>=15))),[0,15]);assert.deepEqual(detectPistols([round(1),round(2)]),[0]);assert.deepEqual(detectPistols([round(13,true)]),[]);});
test("warmup excluded and repeated aborted rounds replaced",()=>{const events=[{event_name:"round_freeze_end",tick:10,is_warmup_period:true},{event_name:"round_announce_match_start",tick:100},{event_name:"round_freeze_end",tick:100,total_rounds_played:0},{event_name:"round_end",tick:200,winner:3},{event_name:"round_freeze_end",tick:300,total_rounds_played:0},{event_name:"round_end",tick:400,winner:2}];const out=findRounds(events);assert.equal(out.length,1);assert.equal(out[0].live,300);});
test("utility survives seeking backwards and disappears exactly at recorded expiry",()=>{const r={effects:[{start:100,end:200,type:"smoke"}]};assert.equal(activeEffects(r,150).length,1);assert.equal(activeEffects(r,200).length,0);assert.equal(activeEffects(r,150).length,1);assert.equal(activeEffects(r,99).length,0);});
test("world Y inversion and radar scale",()=>assert.deepEqual(worldToRadar({x:-3230,y:1713,scale:5},-2230,713),[200,200]));
test("loadouts include carried gear and shot windows exclude non-firearms",()=>{assert.deepEqual(formatLoadout({weapon:"weapon_ak47",inventory:["AK-47","Smoke Grenade"],armor:100,hasHelmet:true}),["AK-47","Smoke Grenade","Kevlar + helmet"]);const events=[{event_name:"weapon_fire",tick:100,weapon:"ak47"},{event_name:"weapon_fire",tick:101,weapon:"knife"},{event_name:"weapon_fire",tick:80,weapon:"m4a1"}];assert.deepEqual(visibleGunshots(events,102,64).map(e=>e.weapon),["ak47"]);});
test("facing interpolation crosses 180 degrees by the short route",()=>{const r=round(1);r.frames.push({tick:128,players:players(false).map(p=>({...p,yaw:-179,x:p.x+64}))});const p=frameAt(r,96)[0];assert.equal(p.x,32);assert.equal(p.yaw,180);});
test("recorded early fire extinguish wins over the fallback duration",()=>{const events=[{event_name:"round_freeze_end",tick:64,total_rounds_played:0},{event_name:"inferno_startburn",tick:100,entityid:20,x:0,y:0,z:0},{event_name:"inferno_expire",tick:180,entityid:20},{event_name:"round_end",tick:640,winner:2}];const rows=[{tick:64,steamid:"1",name:"P",X:0,Y:0,team_num:2,health:100}];const replay=assemble({map_name:"de_mirage"},events,rows,[]);assert.equal(replay.rounds[0].effects[0].end,180);assert.equal(replay.rounds[0].effects[0].estimatedLifetime,false);});
test("Molotov flight links to its separate fire entity without taking another player's fire",()=>{
  const path={id:"417",type:"fire",thrower:"1",points:[[17205,-824,-2312,-107],[17281,102,-1635,-167]],lastTick:17281};
  const effect={id:421,type:"fire",thrower:"1",start:17282,end:17732,x:109,y:-1630,z:-169};
  assert.equal(effectForPath([{...effect,thrower:"2"},effect],path),effect);
  assert.equal(effectForPath([{...effect,start:18000}],path),undefined);
});
test("new grenade IDs preserve separate simultaneous flights and legacy IDs",()=>{
 const events=[{event_name:"round_freeze_end",tick:64,total_rounds_played:0},{event_name:"round_end",tick:640,winner:2}];
 const rows=[{tick:64,steamid:"1",name:"P",X:0,Y:0,team_num:2,health:100}];
 const grenades=[{grenade_entity_id:20,grenade_type:"CSmokeGrenadeProjectile",tick:100,x:10,y:20,steamid:"1"},{grenade_entity_id:21,grenade_type:"CSmokeGrenadeProjectile",tick:100,x:30,y:40,steamid:"2"},{entity_id:22,grenade_type:"flash",tick:100,x:50,y:60,steamid:"3"}];
 const paths=assemble({map_name:"de_mirage"},events,rows,grenades.flatMap(g=>[g,{...g,tick:108}])).rounds[0].grenades;
 assert.deepEqual(paths.map(p=>[p.id,p.type,p.thrower]),[["20","smoke","1"],["21","smoke","2"],["22","flash","3"]]);
});
