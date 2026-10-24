const clean=value=>String(value??"").replace(/^weapon_/i,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const weapons={ak47:["AK-47","rifle",3],m4a1:["M4A1-S","rifle",3],m4a1s:["M4A1-S","rifle",3],m4a1silencer:["M4A1-S","rifle",3],m4a4:["M4A4","rifle",3],famas:["FAMAS","rifle",3],galilar:["Galil","rifle",3],aug:["AUG","rifle",3],sg553:["SG 553","rifle",3],awp:["AWP","sniper",3],ssg08:["SSG 08","sniper",3],scar20:["SCAR-20","sniper",3],g3sg1:["G3SG1","sniper",3],mac10:["MAC-10","smg",3],mp9:["MP9","smg",3],mp7:["MP7","smg",3],mp5sd:["MP5-SD","smg",3],ump45:["UMP-45","smg",3],p90:["P90","smg",3],bizon:["Bizon","smg",3],nova:["Nova","shotgun",3],xm1014:["XM1014","shotgun",3],mag7:["MAG-7","shotgun",3],sawedoff:["Sawed-Off","shotgun",3],m249:["M249","rifle",3],negev:["Negev","rifle",3],deagle:["Deagle","pistol",2],deserteagle:["Deagle","pistol",2],usps:["USP-S","pistol",2],uspsilencer:["USP-S","pistol",2],hkp2000:["P2000","pistol",2],p2000:["P2000","pistol",2],glock:["Glock","pistol",2],glock18:["Glock","pistol",2],elite:["Dualies","pistol",2],dualberettas:["Dualies","pistol",2],tec9:["Tec-9","pistol",2],fiveseven:["Five-SeveN","pistol",2],cz75a:["CZ75","pistol",2],cz75auto:["CZ75","pistol",2],revolver:["R8","pistol",2],r8revolver:["R8","pistol",2],p250:["P250","pistol",2]};
const grenades={flashbang:["flash","Flash","#f6e7a6"],smokegrenade:["smoke","Smoke","#a9c4cf"],hegrenade:["he","HE","#d792a9"],highexplosivegrenade:["he","HE","#d792a9"],molotov:["fire","Molotov","#ff8151"],incgrenade:["fire","Incendiary","#ff8151"],incendiarygrenade:["fire","Incendiary","#ff8151"],decoy:["decoy","Decoy","#9fc9a5"],decoygrenade:["decoy","Decoy","#9fc9a5"]};
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
function drawWeapon(ctx,type,s){ctx.beginPath();if(type==="pistol"){ctx.moveTo(s*.2,s*.25);ctx.lineTo(s*.72,s*.25);ctx.lineTo(s*.78,s*.4);ctx.lineTo(s*.53,s*.43);ctx.lineTo(s*.46,s*.78);ctx.lineTo(s*.3,s*.78);ctx.lineTo(s*.34,s*.42);ctx.lineTo(s*.2,s*.38);}else if(type==="knife"){ctx.moveTo(s*.12,s*.62);ctx.lineTo(s*.7,s*.2);ctx.lineTo(s*.93,s*.16);ctx.lineTo(s*.76,s*.4);ctx.lineTo(s*.24,s*.72);ctx.closePath();}else if(type==="sniper"){ctx.moveTo(s*.04,s*.45);ctx.lineTo(s*.95,s*.45);ctx.moveTo(s*.36,s*.45);ctx.lineTo(s*.26,s*.7);ctx.moveTo(s*.58,s*.45);ctx.lineTo(s*.66,s*.68);ctx.moveTo(s*.43,s*.32);ctx.lineTo(s*.67,s*.32);ctx.strokeRect(s*.45,s*.25,s*.2,s*.14);}else if(type==="smg"){ctx.moveTo(s*.1,s*.35);ctx.lineTo(s*.78,s*.35);ctx.lineTo(s*.93,s*.48);ctx.lineTo(s*.62,s*.5);ctx.lineTo(s*.55,s*.75);ctx.lineTo(s*.4,s*.75);ctx.lineTo(s*.42,s*.49);ctx.lineTo(s*.18,s*.55);}else if(type==="shotgun"){ctx.moveTo(s*.05,s*.39);ctx.lineTo(s*.93,s*.39);ctx.moveTo(s*.15,s*.48);ctx.lineTo(s*.72,s*.48);ctx.moveTo(s*.34,s*.48);ctx.lineTo(s*.25,s*.7);}else{ctx.moveTo(s*.04,s*.4);ctx.lineTo(s*.76,s*.4);ctx.lineTo(s*.96,s*.3);ctx.moveTo(s*.26,s*.4);ctx.lineTo(s*.16,s*.69);ctx.moveTo(s*.55,s*.4);ctx.lineTo(s*.64,s*.66);}type==="knife"?ctx.fill():ctx.stroke();}
export function drawLoadoutIcon(ctx,entry,x,y,size=14){
  ctx.save();ctx.translate(x,y);ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=entry.color??"#d7e0e6";ctx.fillStyle=entry.color??"#d7e0e6";ctx.lineWidth=Math.max(1,size*.1);
  if(entry.kind==="weapon"){
    drawWeapon(ctx,weaponDef(entry.key)?.[1]??"rifle",size);const caption={"Five-SeveN":"5-7",Dualies:"DUAL",Deagle:"DEAGLE"}[entry.label]??entry.label;ctx.font=`600 ${Math.max(6,size*.36)}px Segoe UI, sans-serif`;ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(caption,0,size*.73,42);
  }else if(entry.kind==="armor"){
    ctx.strokeStyle="#9fb3c2";ctx.strokeRect(1,1,size*.72,size*.78);if(Number.isFinite(entry.value)){ctx.fillStyle="#70b9e9";const h=size*.74*entry.value/100;ctx.fillRect(3,2+size*.74-h,size*.72-4,h);}ctx.fillStyle="#e3ebf0";ctx.font=`600 ${Math.max(6,size*.46)}px Segoe UI`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(Number.isFinite(entry.value)?String(entry.value):"?",size*.37,size*.4);if(entry.helmet){ctx.beginPath();ctx.arc(size*.83,size*.22,size*.15,Math.PI,0);ctx.lineTo(size*.98,size*.42);ctx.stroke();}
  }else{
    if(entry.key==="flash"){ctx.fillRect(size*.36,1,size*.28,size*.2);ctx.beginPath();ctx.arc(size*.5,size*.58,size*.3,0,Math.PI*2);ctx.fill();}
    else if(entry.key==="smoke"){ctx.fillRect(size*.25,size*.18,size*.5,size*.7);ctx.strokeRect(size*.34,1,size*.32,size*.2);}
    else if(entry.key==="he"){ctx.beginPath();ctx.arc(size*.5,size*.56,size*.34,0,Math.PI*2);ctx.fill();ctx.strokeRect(size*.4,1,size*.2,size*.22);}
    else if(entry.key==="fire"){ctx.beginPath();ctx.moveTo(size*.5,size*.05);ctx.bezierCurveTo(size*.9,size*.42,size*.75,size*.9,size*.5,size*.92);ctx.bezierCurveTo(size*.12,size*.76,size*.22,size*.35,size*.5,size*.05);ctx.fill();}
    else{ctx.beginPath();ctx.arc(size*.5,size*.55,size*.3,0,Math.PI*2);ctx.stroke();}
    if((entry.count??1)>1){ctx.fillStyle="#fff";ctx.font=`600 ${Math.max(7,size*.48)}px Segoe UI`;ctx.textAlign="right";ctx.textBaseline="bottom";ctx.fillText(`×${entry.count}`,size,size);}
  }
  ctx.restore();
}
