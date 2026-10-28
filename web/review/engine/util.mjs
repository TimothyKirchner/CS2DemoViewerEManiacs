// Strat Scope review: shared geometry, timing and equipment helpers.
export const EYE_HEIGHT = 64, DUCK_EYE_HEIGHT = 46;
export const ROUND_SECONDS = 115, BOMB_SECONDS = 40;

export const key = s => String(s ?? "").toLowerCase().replace(/^weapon_/, "").replace(/[^a-z0-9]/g, "");
// Approximate CS2 retail prices (USD in-game). Used only for equipment-value context.
const PRICES = {
  glock:200, glock18:200, usps:200, hkp2000:200, p2000:200, p250:300, fiveseven:500, tec9:500, cz75a:500, cz75auto:500,
  elite:300, dualberettas:300, deagle:700, deserteagle:700, revolver:600, r8revolver:600,
  mac10:1050, mp9:1250, mp7:1500, mp5sd:1500, ump45:1200, p90:2350, bizon:1400, ppbizon:1400,
  galilar:1800, famas:2050, ak47:2700, m4a1:2900, m4a4:2900, m4a1silencer:2900, m4a1s:2900, sg556:3000, sg553:3000, aug:3300,
  ssg08:1700, awp:4750, g3sg1:5000, scar20:5000, nova:1050, xm1014:2000, mag7:1300, sawedoff:1100, m249:5200, negev:1700,
  hegrenade:300, highexplosivegrenade:300, flashbang:200, smokegrenade:300, molotov:400, incgrenade:500, incendiarygrenade:500,
  decoy:50, decoygrenade:50, taser:200, zeusx27:200
};
const GRENADES = /(hegrenade|highexplosive|flashbang|smokegrenade|molotov|incgrenade|incendiary|decoy)/;
const PISTOL = /^(glock|glock18|usps|hkp2000|p2000|p250|fiveseven|tec9|cz75a|cz75auto|elite|dualberettas|deagle|deserteagle|revolver|r8revolver)$/;
const SMG = /^(mac10|mp9|mp7|mp5sd|ump45|p90|bizon|ppbizon)$/;
const RIFLE = /^(galilar|famas|ak47|m4a1|m4a4|m4a1silencer|m4a1s|sg556|sg553|aug)$/;
const SNIPER = /^(ssg08|awp|g3sg1|scar20)$/;
const SHOTGUN_MG = /^(nova|xm1014|mag7|sawedoff|m249|negev)$/;
export const NON_GUN = /(knife|bayonet|karambit|dagger|bowie|butterfly|falchion|navaja|stiletto|talon|ursus|kukri|grenade|flashbang|smoke|molotov|incendiary|decoy|c4|healthshot|taser|zeus|world|inferno)/i;

export function itemName(item) { return typeof item === "string" ? item : (item?.name ?? item?.weapon_name ?? ""); }
export function price(item) { return PRICES[key(itemName(item))] ?? 0; }
export function weaponClass(name) {
  const k = key(name);
  if (PISTOL.test(k)) return "pistol";
  if (SMG.test(k)) return "smg";
  if (RIFLE.test(k)) return "rifle";
  if (SNIPER.test(k)) return "sniper";
  if (SHOTGUN_MG.test(k)) return "heavy";
  if (GRENADES.test(k)) return "grenade";
  return NON_GUN.test(String(name)) ? "other" : (k ? "unknown" : "other");
}
export function isGun(name) { return ["pistol", "smg", "rifle", "sniper", "heavy"].includes(weaponClass(name)); }
export function grenadeCount(player) { return (Array.isArray(player?.inventory) ? player.inventory : []).filter(i => GRENADES.test(key(itemName(i)))).length; }
export function equipmentValue(player) {
  if (!player) return 0;
  const items = Array.isArray(player.inventory) ? player.inventory : [];
  let value = items.reduce((sum, i) => sum + price(i), 0);
  if (player.armor > 0) value += player.hasHelmet ? 1000 : 650;
  if (player.hasDefuser) value += 400;
  return value;
}
export function primaryValue(player) {
  return Math.max(0, ...(Array.isArray(player?.inventory) ? player.inventory : []).filter(i => !PISTOL.test(key(itemName(i))) && isGun(itemName(i))).map(price));
}
// Movement-accuracy thresholds (34% of a representative max speed). SMGs/shotguns/MGs are excluded.
export function strafeThreshold(name) {
  const c = weaponClass(name), k = key(name);
  if (c === "rifle") return 75;
  if (c === "pistol") return 82;
  if (c === "sniper") return k === "ssg08" ? 80 : 68;
  return null;
}

export function viewVector(yaw = 0, pitch = 0) {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)];
}
export function eye(p) { return [p.x, p.y, (p.z ?? 0) + (p.duck ? DUCK_EYE_HEIGHT : EYE_HEIGHT)]; }
// Angle between a player's view and the target's head. pitch=null measures yaw only.
export function aimError(from, target) {
  const a = eye(from), b = eye(target), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const yawTo = Math.atan2(d[1], d[0]) * 180 / Math.PI, flat = Math.hypot(d[0], d[1]);
  const pitchTo = -Math.atan2(d[2], flat) * 180 / Math.PI;
  const yawErr = Math.abs(((yawTo - from.yaw) % 360 + 540) % 360 - 180);
  if (!Number.isFinite(from.pitch)) return {total: yawErr, yaw: yawErr, pitch: null, distance: Math.hypot(flat, d[2])};
  const v = viewVector(from.yaw, from.pitch), len = Math.hypot(...d) || 1;
  const dot = Math.max(-1, Math.min(1, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / len));
  return {total: Math.acos(dot) * 180 / Math.PI, yaw: yawErr, pitch: Math.abs(pitchTo - from.pitch), distance: len};
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const mean = xs => { const s = xs.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const round1 = x => Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
export const round2 = x => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;

// Last frame at or before tick (no interpolation: reviews cite recorded samples).
export function frameBefore(frames, tick) {
  if (!frames?.length || frames[0].tick > tick) return frames?.[0] ?? null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].tick <= tick) lo = mid; else hi = mid - 1; }
  return frames[lo];
}
export function playerAt(frames, id, tick) { return frameBefore(frames, tick)?.players.find(p => p.id === id) ?? null; }
export function clock(round, tick, rate) {
  const s = Math.max(0, ROUND_SECONDS - (tick - round.live) / rate);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
