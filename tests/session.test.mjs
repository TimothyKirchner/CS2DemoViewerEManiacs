import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {makeEntry,filterRounds,sessionBundle,readBundle,replayKey} from '../web/session.mjs';

const fixture=JSON.parse(gunzipSync(readFileSync(new URL('../web/sample.strats',import.meta.url))));
const replay=()=>structuredClone(fixture);
test('entry metadata starts blank and normalizes imported names and audio settings',()=>{
 const entry=makeEntry(replay());assert.deepEqual(entry.teamNames,{'team-1':'','team-2':''});assert.equal(entry.date,'');
 const imported=makeEntry(replay(),{teamNames:{'team-1':'  Emaniacs  '},date:'yesterday',voice:{name:'voice.wav',offset:NaN,volume:3}});
 assert.equal(imported.teamNames['team-1'],'Emaniacs');assert.equal(imported.date,'');assert.deepEqual(imported.voice,{name:'voice.wav',offset:0,volume:1});
});
test('combined match, team, date, side and outcome filters retain only the selected subjects',()=>{
 const a=makeEntry(replay(),{id:'a',date:'2026-10-20',teamNames:{'team-1':'Emaniacs'}}),b=makeEntry(replay(),{id:'b',date:'2026-10-25'});
 const refs=filterRounds([a,b],{map:fixture.map,team:'Emaniacs',from:'2026-10-19',to:'2026-10-21',side:'2',result:'win'});
 assert.ok(refs.length);for(const ref of refs){assert.equal(ref.entryId,'a');assert.deepEqual(ref.sides,[2]);assert.equal(a.replay.rounds[ref.roundIndex].winner,2);}
 assert.deepEqual(filterRounds([a,b],{from:'2026-10-26'}),[]);assert.deepEqual(filterRounds([a,b],{map:'not-a-map'}),[]);
});
test('player filtering excludes rounds and sides where that player is absent',()=>{
 const entry=makeEntry(replay(),{id:'a'}),r=entry.replay.rounds[0],p=r.frames.find(f=>f.tick>=r.live).players.find(p=>p.team===2);
 assert.deepEqual(filterRounds([entry],{player:'not-in-recording'}),[]);
 const refs=filterRounds([entry],{player:p.id,side:'3'});assert.ok(!refs.some(ref=>ref.roundIndex===0));
});
test('session round trip carries notes, playlist order and metadata without local audio handles',()=>{
 const entry=makeEntry(replay(),{id:'a',date:'2026-10-20',teamNames:{'team-1':'Emaniacs'},voice:{name:'voice.wav',offset:2,volume:.4}}),r=entry.replay.rounds[0];entry.replay.notes=[{round:r.number,tick:r.live,text:'Review this opening'}];
 const clips=[{entryId:'a',roundIndex:0,start:r.live,end:r.end,title:'First',tags:'execute',note:'Timing'}, {entryId:'a',roundIndex:0,start:r.live+64,end:r.end,title:'Second',tags:'',note:''}];
 const imported=readBundle(JSON.parse(JSON.stringify(sessionBundle([entry],clips))));assert.deepEqual(imported.clips,clips);assert.deepEqual(imported.entries[0].replay.notes,entry.replay.notes);assert.deepEqual(imported.entries[0].voice,entry.voice);assert.equal(imported.entries[0].date,entry.date);assert.equal(imported.entries[0].teamNames['team-1'],'Emaniacs');
});
test('bundle rejects duplicate matches and drops invalid clip references without crashing',()=>{
 const entry=makeEntry(replay(),{id:'a'}),bundle=sessionBundle([entry],[]),r=entry.replay.rounds[0];
 assert.throws(()=>readBundle({...bundle,entries:[bundle.entries[0],bundle.entries[0]]}),/duplicate/);
 const valid={entryId:'a',roundIndex:0,start:r.live,end:r.end};bundle.clips=[null,{}, {...valid,entryId:'missing'}, {...valid,roundIndex:'0'}, {...valid,end:r.end+1}, {...valid,start:r.end},valid];
 assert.equal(readBundle(bundle).clips.length,1);assert.throws(()=>readBundle({...bundle,version:2}),/Unsupported/);
});
test('content identity deduplicates renamed replays but preserves distinct event recordings',async()=>{
 const a=replay(),b=replay();b.source='renamed.strats';b.notes=[{text:'Local note'}];assert.equal(await replayKey(a),await replayKey(b));const c=replay();c.rounds[0].winner=c.rounds[0].winner===2?3:2;assert.notEqual(await replayKey(a),await replayKey(c));
});
