const fs=require('node:fs');
const revision='92fa323cb5f954f310b8d653a7c280f5d1335163';
const names={ak47:'ak47',m4a4:'m4a1',m4a1silencer:'m4a1_silencer',sg553:'sg556',uspsilencer:'usp_silencer'};
const weapons='ak47 m4a4 m4a1silencer galilar famas aug sg553 awp ssg08 scar20 g3sg1 mac10 mp9 mp7 mp5sd ump45 p90 bizon nova xm1014 mag7 sawedoff m249 negev deagle uspsilencer glock hkp2000 p250 fiveseven tec9 cz75a revolver elite knife'.split(' ');
const equipment={armor:'kevlar',helmet:'helmet',flash:'flashbang',smoke:'smokegrenade',he:'hegrenade',fire:'molotov',incendiary:'incgrenade',decoy:'decoy'};
async function read(name){
 const response=await fetch(`https://raw.githubusercontent.com/Juknum/counter-strike-icons/${revision}/cs2/panorama/images/icons/equipment/${name}.svg`);
 if(!response.ok)throw Error(`${name}: ${response.status}`);
 const svg=await response.text();
 const unsupported=svg.match(/<(?:polygon|polyline|rect|circle|ellipse|line)\b|\btransform=/g);
 if(unsupported)throw Error(`${name}: unsupported geometry ${unsupported}`);
 const viewBox=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
 const paths=[...svg.matchAll(/<path\b[\s\S]*?\bd="([^"]+)"[\s\S]*?\/?\s*>/g)].map(m=>({d:m[1].replace(/\s+/g,' '),rule:/fill-rule="evenodd"/.test(m[0])?'evenodd':'nonzero'}));
 if(!paths.length)throw Error(`${name}: missing paths`);
 return {viewBox,paths};
}
(async()=>{
 const weaponArt=Object.fromEntries(await Promise.all(weapons.map(async key=>[key,await read(names[key]??key)])));
 const equipmentArt=Object.fromEntries(await Promise.all(Object.entries(equipment).map(async([key,name])=>[key,await read(name)])));
 const aliases={m4a1:'m4a4',m4a1s:'m4a1silencer',sg556:'sg553',deserteagle:'deagle',usps:'uspsilencer',p2000:'hkp2000',glock18:'glock',dualberettas:'elite',cz75auto:'cz75a',r8revolver:'revolver'};
 fs.writeFileSync('web/loadout-art.mjs',`// Counter-Strike equipment silhouettes, property of Valve Corporation.\n// Source: https://github.com/Juknum/counter-strike-icons/tree/${revision}/cs2/panorama/images/icons/equipment\n// SVG viewBoxes and fill rules are preserved; only whitespace was compacted.\nexport const weaponArt=${JSON.stringify(weaponArt)};\nexport const equipmentArt=${JSON.stringify(equipmentArt)};\nconst aliases=${JSON.stringify(aliases)};\nexport function weaponArtworkKey(key){return aliases[key]??(weaponArt[key]?key:'knife');}\n`);
 console.log(`Imported ${Object.keys(weaponArt).length} weapons and ${Object.keys(equipmentArt).length} equipment silhouettes at ${revision}`);
})().catch(e=>{console.error(e);process.exitCode=1});
