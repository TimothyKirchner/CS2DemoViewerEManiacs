import {weaponArt,weaponArtworkKey,equipmentArt} from "./loadout-art.mjs";
const clean=value=>String(value??"").replace(/^weapon_/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const weapons={ak47:["AK-47","rifle",3],m4a1:["M4A4","rifle",3],m4a1s:["M4A1-S","rifle",3],m4a1silencer:["M4A1-S","rifle",3],m4a4:["M4A4","rifle",3],famas:["FAMAS","rifle",3],galilar:["Galil","rifle",3],aug:["AUG","rifle",3],sg553:["SG 553","rifle",3],sg556:["SG 553","rifle",3],awp:["AWP","sniper",3],ssg08:["SSG 08","sniper",3],scar20:["SCAR-20","sniper",3],g3sg1:["G3SG1","sniper",3],mac10:["MAC-10","smg",3],mp9:["MP9","smg",3],mp7:["MP7","smg",3],mp5sd:["MP5-SD","smg",3],ump45:["UMP-45","smg",3],p90:["P90","smg",3],bizon:["Bizon","smg",3],nova:["Nova","shotgun",3],xm1014:["XM1014","shotgun",3],mag7:["MAG-7","shotgun",3],sawedoff:["Sawed-Off","shotgun",3],m249:["M249","rifle",3],negev:["Negev","rifle",3],deagle:["Deagle","pistol",2],deserteagle:["Deagle","pistol",2],usps:["USP-S","pistol",2],uspsilencer:["USP-S","pistol",2],hkp2000:["P2000","pistol",2],p2000:["P2000","pistol",2],glock:["Glock","pistol",2],glock18:["Glock","pistol",2],elite:["Dualies","pistol",2],dualberettas:["Dualies","pistol",2],tec9:["Tec-9","pistol",2],fiveseven:["Five-SeveN","pistol",2],cz75a:["CZ75","pistol",2],cz75auto:["CZ75","pistol",2],revolver:["R8","pistol",2],r8revolver:["R8","pistol",2],p250:["P250","pistol",2]};
const grenades={flashbang:["flash","Flash","#f6e7a6"],smokegrenade:["smoke","Smoke","#a9c4cf"],hegrenade:["he","HE","#d792a9"],highexplosivegrenade:["he","HE","#d792a9"],molotov:["fire","Molotov","#ff8151"],incgrenade:["incendiary","Incendiary","#ff8151"],incendiarygrenade:["incendiary","Incendiary","#ff8151"],decoy:["decoy","Decoy","#9fc9a5"],decoygrenade:["decoy","Decoy","#9fc9a5"]};
const knife=key=>key==="knife"||key==="knifet"||key.includes("knife")||key.includes("bayonet")||key.includes("karambit")||key.includes("daggers");
function itemName(item){return typeof item==="string"?item:item?.name??item?.weapon_name??item?.item_name??"";}
function weaponDef(key){return weapons[key]??(knife(key)?["Knife","knife",1]:null);}
export function getLoadoutIcons(player={},options={}){
  const {weapons=true,armor=true,grenades:showGrenades=true}=options,inventory=Array.isArray(player.inventory)?player.inventory.map(itemName).filter(Boolean):[],active=itemName(player.weapon),all=[...inventory];
  const sameItem=(a,b)=>{const ak=clean(a),bk=clean(b);return ak===bk||(grenades[ak]&&grenades[bk]&&grenades[ak][0]===grenades[bk][0])||(weaponDef(ak)&&weaponDef(bk)&&weaponDef(ak)[0]===weaponDef(bk)[0]);};
  if(active&&!all.some(value=>sameItem(value,active)))all.push(active);
  const entries=[];
  if(weapons){
    const best=all.map(value=>{const key=clean(value),def=weaponDef(key);return def?{key,def}:null;}).filter(Boolean).sort((a,b)=>b.def[2]-a.def[2]||a.key.localeCompare(b.key))[0];
    if(best)entries.push({kind:"weapon",key:best.key,label:best.def[0],value:best.def[2]});
  }
  if(armor){const raw=player.armor??player.armor_value;entries.push({kind:"armor",key:"armor",label:Number.isFinite(raw)?`Armor ${Math.max(0,Math.min(100,raw))}`:"Armor ?",value:Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):null,helmet:Boolean(player.hasHelmet??player.has_helmet)});}
  if(showGrenades){
    const counts=new Map();for(const value of all){const spec=grenades[clean(value)];if(spec)counts.set(spec[0],(counts.get(spec[0])??0)+1);}
    for(const [key,count] of counts){const spec=Object.values(grenades).find(x=>x[0]===key);entries.push({kind:"grenade",key,label:spec[1],count,color:spec[2]});}
  }
  return entries;
}
const artCache=new Map();
function drawArt(ctx,art,x,y,width,height){
  const [vx,vy,vw,vh]=art.viewBox,scale=Math.min(width/vw,height/vh);
  ctx.save();ctx.translate(x+(width-vw*scale)/2,y+(height-vh*scale)/2);ctx.scale(scale,scale);ctx.translate(-vx,-vy);
  for(const {d,rule} of art.paths){let path=artCache.get(d);if(!path){path=new Path2D(d);artCache.set(d,path);}ctx.fill(path,rule);}
  ctx.restore();
}
// Compact cells follow the actual shape: rifles are wide, grenades narrow.
export function layoutLoadoutIcons(entries,size=18,maxWidth=174){
  let x=0,y=0,width=0;
  const items=entries.map(entry=>{
    const cellWidth=entry.kind==="weapon"?size*1.8:entry.kind==="armor"?size*1.8:size*((entry.count??1)>1?1.12:.85);
    if(x&&x+cellWidth>maxWidth){x=0;y+=size+3;}
    const item={entry,x,y};width=Math.max(width,x+cellWidth);x+=cellWidth+3;return item;
  });
  return {items,width,height:items.length?y+size:0};
}
export function drawLoadoutIcon(ctx,entry,x,y,size=18){
  ctx.save();ctx.translate(x,y);ctx.fillStyle=entry.color??"#e1e9ee";
  if(entry.kind==="weapon"){
    drawArt(ctx,weaponArt[weaponArtworkKey(entry.key)],0,0,size*1.8,size);
  }else if(entry.kind==="armor"){
    const vest=equipmentArt.armor;ctx.fillStyle="#52616c";drawArt(ctx,vest,0,0,size*.8,size);
    if(Number.isFinite(entry.value)){
      ctx.save();const h=size*Math.max(0,Math.min(100,entry.value))/100;ctx.beginPath();ctx.rect(0,size-h,size,h);ctx.clip();ctx.fillStyle="#dce5eb";drawArt(ctx,vest,0,0,size*.8,size);ctx.restore();
    }
    ctx.fillStyle="#dce5eb";ctx.font=`600 ${Math.max(8,size*.44)}px Segoe UI, sans-serif`;ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillText(Number.isFinite(entry.value)?String(entry.value):"?",size*.9,size);
    if(entry.helmet)drawArt(ctx,equipmentArt.helmet,size*.9,0,size*.65,size*.5);
  }else{
    drawArt(ctx,equipmentArt[entry.key]??equipmentArt.decoy,0,0,size*.85,size);
    if((entry.count??1)>1){ctx.fillStyle="#fff";ctx.font=`700 ${Math.max(8,size*.44)}px Segoe UI, sans-serif`;ctx.textAlign="right";ctx.textBaseline="bottom";ctx.shadowColor="#101821";ctx.shadowBlur=2;ctx.fillText(`×${entry.count}`,size*1.12,size);}
  }
  ctx.restore();
}
