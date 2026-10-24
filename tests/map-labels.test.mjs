import test from 'node:test';
import assert from 'node:assert/strict';
import {wrapLabel,placeLabel} from '../web/map-labels.mjs';
import {formatLoadout} from '../web/core.mjs';
test('clustered map loadouts stay in viewport without overlapping',()=>{
  const boxes=[];for(let i=0;i<10;i++)placeLabel(650,300,185,78,900,650,boxes);
  for(const [i,a] of boxes.entries()){
    assert.ok(a[0]>=0&&a[1]>=0&&a[0]+a[2]<=900&&a[1]+a[3]<=650);
    for(const b of boxes.slice(i+1))assert.ok(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1]);
  }
});
test('wrapped loadout keeps every item and duplicate grenade count',()=>{
  const items=formatLoadout({inventory:['AK-47','Flashbang','Flashbang','Smoke Grenade'],armor:100,hasHelmet:true,hasDefuser:true});
  assert.ok(items.includes('Flashbang ×2'));assert.ok(items.includes('Defuse kit'));
  const text=items.join(' · ');assert.equal(wrapLabel(text,t=>t.length*6,100).join(' '),text);
});
