import test from "node:test";
import assert from "node:assert/strict";
import {getLoadoutIcons} from "../web/loadout-icons.mjs";

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
