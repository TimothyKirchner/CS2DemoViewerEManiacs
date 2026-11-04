import test from "node:test";
import assert from "node:assert/strict";
import {getLoadoutIcons,layoutLoadoutIcons} from "../web/loadout-icons.mjs";
import {weaponArt,weaponArtworkKey,equipmentArt} from "../web/loadout-art.mjs";

test("best carried gun beats held knife and normalizes aliases",()=>{
  const icons=getLoadoutIcons({weapon:"weapon_knife_t",inventory:["knife_t","weapon_deagle","weapon_m4a1_silencer"]},{armor:false,grenades:false});
  assert.deepEqual(icons,[{kind:"weapon",key:"m4a1silencer",label:"M4A1-S",value:3}]);
});

test("primary, pistol and knife hierarchy is deterministic",()=>{
  assert.equal(getLoadoutIcons({inventory:["knife","Glock-18","ak47"]},{armor:false,grenades:false})[0].label,"AK-47");
  assert.equal(getLoadoutIcons({inventory:["knife","weapon_deagle"]},{armor:false,grenades:false})[0].label,"Deagle");
  assert.equal(getLoadoutIcons({inventory:["weapon_knife"]},{armor:false,grenades:false})[0].key,"knife");
});

test("armor preserves amount, unknown state and helmet cue",()=>{
  assert.deepEqual(getLoadoutIcons({armor:37,hasHelmet:true},{weapons:false,grenades:false}),[{kind:"armor",key:"armor",label:"Armor 37",value:37,helmet:true}]);
  assert.equal(getLoadoutIcons({},{weapons:false,grenades:false})[0].label,"Armor ?");
});

test("grenades count duplicates without doubling the active item",()=>{
  const icons=getLoadoutIcons({weapon:"weapon_flashbang",inventory:["Flashbang","weapon_flashbang","Smoke Grenade"]},{weapons:false,armor:false});
  assert.deepEqual(icons.map(({key,count})=>[key,count]),[["flash",2],["smoke",1]]);
});

test("filters are independent",()=>{
  const player={weapon:"ak47",armor:50,inventory:["ak47","hegrenade"]};
  assert.deepEqual(getLoadoutIcons(player,{armor:false,grenades:false}).map(x=>x.kind),["weapon"]);
  assert.deepEqual(getLoadoutIcons(player,{weapons:false,grenades:false}).map(x=>x.kind),["armor"]);
  assert.deepEqual(getLoadoutIcons(player,{weapons:false,armor:false}).map(x=>x.kind),["grenade"]);
});
test("actual sample names never promote utility, C4 or knives above guns",()=>{const icons=getLoadoutIcons({weapon:"Huntsman Knife",inventory:["Huntsman Knife","AK-47","High Explosive Grenade","C4 Explosive"]},{armor:false});assert.deepEqual(icons.map(x=>[x.kind,x.key,x.count]),[["weapon","ak47",undefined],["grenade","he",1]]);for(const p of ["USP-S","P2000","Glock-18","Five-SeveN","CZ75-Auto","R8 Revolver"])assert.equal(getLoadoutIcons({inventory:[p]},{armor:false,grenades:false})[0].value,2,p);for(const k of ["Bowie Knife","Huntsman Knife","M9 Bayonet","knife_t"])assert.equal(getLoadoutIcons({inventory:[k,"C4 Explosive"]},{armor:false,grenades:false})[0].value,1,k);});
test("active display alias does not double carried grenade",()=>assert.equal(getLoadoutIcons({weapon:"High Explosive Grenade",inventory:["weapon_hegrenade"]},{weapons:false,armor:false})[0].count,1));

test("Source weapon names select the correct M4 and scoped rifle silhouettes",()=>{
  for(const [name,label,key] of [["weapon_m4a1","M4A4","m4a4"],["weapon_m4a1_silencer","M4A1-S","m4a1silencer"],["weapon_sg556","SG 553","sg553"]]){
    const entry=getLoadoutIcons({inventory:[name]},{armor:false,grenades:false})[0];
    assert.equal(entry.label,label);assert.equal(weaponArtworkKey(entry.key),key);assert.ok(weaponArt[key]);
  }
  assert.notEqual(weaponArt.m4a4,weaponArt.m4a1silencer);
});

test("Molotov bottles and incendiary canisters retain separate art and counts",()=>{
  const entries=getLoadoutIcons({weapon:"Incendiary Grenade",inventory:["weapon_molotov","weapon_incgrenade"]},{weapons:false,armor:false});
  assert.deepEqual(entries.map(({key,label,count})=>[key,label,count]),[["fire","Molotov",1],["incendiary","Incendiary",1]]);
  assert.ok(equipmentArt.incendiary);assert.notEqual(equipmentArt.fire,equipmentArt.incendiary);
});

test("reference silhouettes retain native proportions and valid geometry",()=>{
  for(const art of [...Object.values(weaponArt),...Object.values(equipmentArt)]){
    assert.equal(art.viewBox.length,4);assert.ok(art.viewBox.every(Number.isFinite));
    assert.ok(art.viewBox[2]>0&&art.viewBox[3]>0);assert.ok(art.paths.length);
    for(const {d,rule} of art.paths){assert.ok(d.length>20);assert.ok(['nonzero','evenodd'].includes(rule));}
  }
  assert.ok(weaponArt.ak47.viewBox[2]/weaponArt.ak47.viewBox[3]>2);
  assert.ok(equipmentArt.armor.viewBox[3]>equipmentArt.armor.viewBox[2]);
});

test("compact loadout preserves every item and count when wrapping",()=>{
  const entries=getLoadoutIcons({inventory:['ak47','flashbang','flashbang','smokegrenade','hegrenade','molotov','incgrenade','decoy'],armor:100,hasHelmet:true});
  const layout=layoutLoadoutIcons(entries);
  assert.deepEqual(layout.items.map(item=>item.entry),entries);
  assert.ok(layout.width<=174);assert.ok(layout.height<=39);
  assert.equal(layout.items.find(({entry})=>entry.key==='flash').entry.count,2);
  assert.ok(layoutLoadoutIcons(entries.slice(0,5)).height===18);
});
