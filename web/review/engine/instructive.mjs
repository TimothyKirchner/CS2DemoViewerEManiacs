// Finds one focus player's most instructive rounds (mistakes and good examples) and turns their key
// moments into clip windows. The plan output is a normal recording plan (clip-plan.mjs), so
// recorder/record-clips.mjs --plan can record it once demo playback works again.
import {frameBefore, equipmentValue, primaryValue, clock, winnerTeam, grenadeCount, key, itemName, GRENADES, BOMB_SECONDS} from "./util.mjs";
import {TIPS} from "./clips.mjs";
import {buildRecordingPlan, accountId} from "./clip-plan.mjs";

export const INSTRUCTIVE_VERSION = 1;
export const INSTRUCTIVE_DEFAULTS = {max: 8, minEach: 2, minScore: 1.5, leadSeconds: 6, deathLeadSeconds: 12, tailSeconds: 3, tradeSeconds: 5, maxDeaths: 4, aloneUnits: 1000, closeUnits: 450};
// Picks whose primary category is one of your deaths; at most maxDeaths of them, so highlights and other mistakes show too.
const DEATHS = new Set(["opening-death-lost", "opening-death", "untraded-death"]);

// confidence: high = derived from game events (kills, plant, round result); medium = depends on sampled
// positions/inventories or the engine's trade/spot logic; low = a judgement call (economy, saving, isolation).
const META = {
  "opening-death-lost": {kind: "mistake", confidence: "high", title: "Died first in a lost round", look: "How you took first contact: information, utility support and whether a teammate could trade."},
  "opening-death": {kind: "mistake", confidence: "high", title: "Died first (round still won)", look: "How you took first contact: information, utility support and whether a teammate could trade."},
  "untraded-death": {kind: "mistake", confidence: "medium", title: "Death without a trade", look: "Where your teammates were when you died and whether anyone could refrag that angle."},
  "clutch-lost": {kind: "mistake", confidence: "high", title: "Lost a clutch", look: "Which duel you took first, your timing and whether you could isolate one enemy or play the clock/bomb."},
  "afterplant-lost": {kind: "mistake", confidence: "high", title: "Lost the post-plant", look: "Post-plant positions and crossfires: did you hold the bomb with time or give up a duel?"},
  "retake-lost": {kind: "mistake", confidence: "high", title: "Lost the retake", look: "Retake timing, utility before entering and whether the team grouped up first."},
  "force-alone": {kind: "mistake", confidence: "low", title: "Bought alone while the team saved", look: "The buy decision: one rifle among saving teammates rarely wins and breaks the team economy."},
  "under-buy": {kind: "mistake", confidence: "low", title: "Under-bought on a team buy round", look: "The buy decision: unspent money while teammates full-bought weakens the round."},
  "multikill": {kind: "highlight", confidence: "high", title: "Multi-kill round", look: "What made this work: positioning, timing and crosshair placement."},
  "clutch-won": {kind: "highlight", confidence: "high", title: "Won a clutch", look: "Information use and timing that isolated each duel."},
  "opening-kill": {kind: "highlight", confidence: "high", title: "Won the opening duel", look: "How you set up the first duel: angle, timing and support."},
  "afterplant-won": {kind: "highlight", confidence: "high", title: "Won the post-plant", look: "Post-plant position and how you used the bomb timer."},
  "retake-won": {kind: "highlight", confidence: "high", title: "Won the retake", look: "Retake timing, utility and the order in which you cleared angles."},
  "saved-weapon": {kind: "highlight", confidence: "medium", title: "Saved the weapon in a lost round", look: "Was the save the right call, or was the round still winnable?"}
};
// Review-engine findings that add evidence to a round. Multi-kills, clutches and opening deaths are
// detected here directly, so the engine's versions are skipped.
const ENGINE = {
  isolated: {score: f => 0.8 + 0.6 * f.severity, confidence: "low"},
  "no-trade": {score: () => 2, confidence: "medium"},
  "unused-utility": {type: "wasted-utility", score: f => 1 + 0.5 * f.severity, confidence: "medium"},
  "no-save": {score: () => 2, confidence: "low"},
  repeek: {score: () => 1.5, confidence: "medium"},
  "multi-exposure": {score: () => 1.5, confidence: "medium"},
  "team-flash": {score: f => f.severity >= 3 ? 2.5 : 0.8, confidence: "high"},
  crosshair: {score: f => 0.5 * f.severity, confidence: "medium"},
  "moving-shots": {score: () => 1, confidence: "medium"},
  reaction: {score: () => 0.4, confidence: "low"},
  trade: {score: () => 1.2, confidence: "medium"},
  "flash-assist": {score: () => 1.2, confidence: "high"},
  "clean-duel": {score: () => 0.6, confidence: "medium"}
};
const MULTI = {2: 1.5, 3: 3, 4: 4, 5: 5};

export const mmss = seconds => { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
// Team buy of one side, from equipment 20 s into the round (thresholds as in the opponent analyser).
export function teamBuy(replay, index, team) {
  const round = replay.rounds[index];
  if (index === 0 || index === 12) return "pistol";  // MR12: first round of each half
  const f = frameBefore(round.frames, round.live + 20 * replay.tickRate), mates = (f?.players ?? []).filter(p => p.team === team);
  if (!mates.length) return null;
  const v = mates.reduce((s, p) => s + equipmentValue(p), 0);
  return v < 5000 ? "eco" : v < 20000 ? "force/half" : "full";
}
export function playerName(replay, id) { return replay.players.find(p => p.id === String(id))?.name ?? String(id); }

// Accepts a SteamID64 or a (partial, case-insensitive) player name.
export function findPlayer(replay, query) {
  const q = String(query ?? "").trim(); if (!q) return null;
  return replay.players.find(p => p.id === q) ?? replay.players.find(p => p.name?.toLowerCase() === q.toLowerCase()) ?? replay.players.find(p => p.name?.toLowerCase().includes(q.toLowerCase())) ?? null;
}

export function roundCategories(replay, index, me, opts = {}, findings = []) {
  const o = {...INSTRUCTIVE_DEFAULTS, ...opts}, round = replay.rounds[index], rate = replay.tickRate, out = [];
  // Round time left; after the plant the bomb timer instead.
  const planted = round.events.find(e => e.event_name === "bomb_planted" && e.tick >= round.live && e.tick <= round.end);
  const at = t => planted && t > planted.tick ? `${mmss(Math.max(0, BOMB_SECONDS - (t - planted.tick) / rate))} (bomb)` : clock(round, t, rate), nm = id => playerName(replay, id);
  const roster = (frameBefore(round.frames, round.live)?.players ?? []).filter(p => p.team === 2 || p.team === 3);
  const self = roster.find(p => p.id === me); if (!self) return out;
  const team = self.team, teams = new Map(roster.map(p => [p.id, p.team])), teamOf = id => teams.get(String(id));
  const decided = winnerTeam(round.winner) !== null && !round.incomplete, won = winnerTeam(round.winner) === team;
  const add = (type, score, moments, why) => out.push({type, ...META[type], score, why, moments: moments.map(m => ({...m, type, why}))});
  const deaths = round.events.filter(e => e.event_name === "player_death" && e.tick >= round.live && e.tick <= round.end).sort((a, b) => a.tick - b.tick);
  const isEnemyKill = (d, id) => String(d.attacker_steamid) === id && teamOf(d.attacker_steamid) !== undefined && teamOf(d.user_steamid) !== undefined && teamOf(d.attacker_steamid) !== teamOf(d.user_steamid);
  const myKills = deaths.filter(d => isEnemyKill(d, me)), myDeath = deaths.find(d => String(d.user_steamid) === me);
  const killer = myDeath?.attacker_steamid && String(myDeath.attacker_steamid) !== me && teamOf(myDeath.attacker_steamid) !== team ? String(myDeath.attacker_steamid) : null;
  const killMoments = ks => ks.map(k => ({tick: k.tick, label: `Kill on ${nm(k.user_steamid)}`}));
  const deathMoment = d => ({tick: d.tick, label: d.attacker_steamid ? `Died to ${nm(d.attacker_steamid)}` : "Died", lead: o.deathLeadSeconds});
  // What the demo says about a death: callout, killer weapon, flashed, distance to the nearest teammate and
  // grenades still in hand. The cause picks the look-at text instead of one template for every death.
  const deathContext = d => {
    const f = frameBefore(round.frames, d.tick), meP = f?.players.find(p => p.id === me), facts = [], causes = [];
    if (meP?.place) facts.push(`you at ${meP.place}`);
    const kP = d.attacker_steamid ? f?.players.find(p => p.id === String(d.attacker_steamid)) : null;
    const kDist = kP && meP ? Math.hypot(kP.x - meP.x, kP.y - meP.y) : null;
    if (d.weapon) facts.push(`(${key(d.weapon)}${d.headshot ? ", headshot" : ""})`);
    const blind = round.events.find(e => e.event_name === "player_blind" && String(e.user_steamid) === me && teamOf(e.attacker_steamid) !== team && e.tick <= d.tick && e.tick >= d.tick - 3 * rate && Number(e.blind_duration ?? 1) > 0.7);
    if (blind) causes.push("flashed");
    const mates = (f?.players ?? []).filter(p => p.id !== me && teamOf(p.id) === team && p.alive !== false && meP);
    const near = mates.length ? Math.min(...mates.map(p => Math.hypot(p.x - meP.x, p.y - meP.y))) : null;
    if (near !== null && near > o.aloneUnits) causes.push("alone");
    const nades = meP ? grenadeCount(meP) : 0, types = meP ? (meP.inventory ?? []).map(itemName).filter(n => GRENADES.test(key(n))).map(n => key(n).replace(/grenade$/, "")) : [];
    if (nades >= 2) causes.push("utility");
    if (near !== null && near <= o.closeUnits) causes.push("close");
    const parts = facts.length ? [facts.join(" ")] : [];
    if (kP) parts.push(`killer ${kP.place ? `at ${kP.place}, ` : ""}${Math.round(kDist)} units (${Math.round(kDist * 0.0254)} m) away`);
    parts.push(blind ? `flashed (${Number(blind.blind_duration ?? 0).toFixed(1)} s, ${((d.tick - blind.tick) / rate).toFixed(1)} s before)` : "no enemy flash on you in the last 3 s");
    if (near !== null) parts.push(`nearest teammate ${Math.round(near)} units away`);
    parts.push(nades ? `unused: ${types.join(", ") || `${nades} grenade${nades > 1 ? "s" : ""}`}` : "no grenades left");
    const look = causes[0] === "flashed" ? "You were flashed before the duel: watch the flash come, and whether you could turn away or fall back behind cover."
      : causes[0] === "alone" ? "You took the duel far from your team: was there a teammate close enough to trade, or should you have fallen back or waited?"
      : causes[0] === "utility" ? "You died with utility in hand: which grenade could have taken this fight for you (flash before the peek, smoke the angle)?"
      : causes[0] === "close" ? "A teammate was close but the kill was not traded back fast: check spacing and timing (was he ready to swing with you, or were you peeking the same angle?)."
      : null;
    return {text: parts.length ? `: ${parts.join(", ")}` : "", look};
  };
  const addDeath = (type, score, d, head, tail) => { const c = deathContext(d); add(type, score, [deathMoment(d)], `${head}${c.text}${tail}`); if (c.look) out.at(-1).look = c.look; out.at(-1).killer = nm(d.attacker_steamid); };

  // Opening duel.
  const first = deaths.find(d => d.attacker_steamid && teamOf(d.attacker_steamid) !== teamOf(d.user_steamid));
  if (first && myDeath === first && killer) addDeath(decided && !won ? "opening-death-lost" : "opening-death", decided && !won ? 4 : 2, first, `Died first with ${at(first.tick)} left to ${nm(killer)}`, decided ? won ? "; the team still won." : "; the team lost the round." : ".");
  if (first && isEnemyKill(first, me)) add("opening-kill", won ? 3 : 2, killMoments([first]), `Opening kill on ${nm(first.user_steamid)} with ${at(first.tick)} left${decided ? won ? "; the round was won." : ", but the round was lost." : "."}`);

  // Death without a trade: the killer survives the next tradeSeconds against your team.
  if (myDeath && killer) {
    const traded = deaths.some(x => String(x.user_steamid) === killer && x.tick > myDeath.tick && x.tick <= myDeath.tick + o.tradeSeconds * rate && teamOf(x.attacker_steamid) === team);
    if (!traded) addDeath("untraded-death", decided && !won ? 3 : 2.5, myDeath, `Killed by ${nm(killer)} with ${at(myDeath.tick)} left`, `; not traded within ${o.tradeSeconds}s.`);
  }

  if (myKills.length >= 2) {
    const secs = (myKills.at(-1).tick - myKills[0].tick) / rate;
    add("multikill", MULTI[Math.min(5, myKills.length)], killMoments(myKills), `${myKills.length === 5 ? "Ace" : `${myKills.length} kills`} in ${secs.toFixed(1)}s (${myKills.map(k => nm(k.user_steamid)).join(", ")}).`);
  }

  // Clutch: last player alive on your side against at least one enemy.
  const alive = new Set(roster.filter(p => p.alive !== false).map(p => p.id));
  let clutch = null;
  for (const d of deaths) {
    alive.delete(String(d.user_steamid));
    const mine = [...alive].filter(id => teamOf(id) === team), theirs = [...alive].filter(id => teamOf(id) !== team);
    if (!clutch && mine.length === 1 && mine[0] === me && theirs.length >= 1) { clutch = {tick: d.tick, n: theirs.length}; break; }
  }
  if (clutch && decided) {
    const kills = myKills.filter(k => k.tick > clutch.tick), died = myDeath && myDeath.tick > clutch.tick ? myDeath : null;
    const moments = [{tick: clutch.tick, label: `1v${clutch.n} starts`}, ...killMoments(kills), ...(died ? [deathMoment(died)] : [])];
    const why = `1v${clutch.n} from ${at(clutch.tick)} left${kills.length ? ` with ${kills.length} kill${kills.length > 1 ? "s" : ""}` : ""}; ${won ? "won" : "lost"}.`;
    if (won) add("clutch-won", 2 + 1.5 * clutch.n, moments, why);
    else add("clutch-lost", clutch.n === 1 ? 3 : clutch.n === 2 ? 2.5 : 1.5, moments, why);
  }

  // Post-plant (T) and retake (CT), only when you were alive at the plant.
  const plant = round.events.find(e => e.event_name === "bomb_planted" && e.tick >= round.live && e.tick <= round.end);
  if (plant && decided && (!myDeath || myDeath.tick > plant.tick)) {
    const outcome = round.events.find(e => (e.event_name === "bomb_defused" || e.event_name === "bomb_exploded") && e.tick > plant.tick);
    const kills = myKills.filter(k => k.tick > plant.tick), died = myDeath && myDeath.tick > plant.tick ? myDeath : null;
    const moments = [{tick: plant.tick, label: "Bomb planted"}, ...killMoments(kills), ...(died ? [deathMoment(died)] : []), ...(outcome ? [{tick: outcome.tick, label: outcome.event_name === "bomb_defused" ? "Bomb defused" : "Bomb exploded"}] : [])];
    const why = `Alive at the plant (${at(plant.tick)} left)${kills.length ? `, ${kills.length} kill${kills.length > 1 ? "s" : ""} after it` : ""}; ${outcome ? outcome.event_name === "bomb_defused" ? "bomb defused" : "bomb exploded" : won ? "round won" : "round lost"}.`;
    // Lost post-plant: say how it was lost for you (died and to whom, or alive while they defused).
    const lostWhy = died ? `${why} You died after the plant to ${died.attacker_steamid ? nm(died.attacker_steamid) : "?"} with ${at(died.tick)} left${deathContext(died).text}.`
      : `${why} You were alive when it was defused: check whether you could hear or contest the defuse.`;
    if (team === 2) add(won ? "afterplant-won" : "afterplant-lost", won ? 2.5 + 0.5 * kills.length : 3, moments, won ? why : lostWhy);
    if (team === 2 && !won && died) { const mates = (frameBefore(round.frames, died.tick)?.players ?? []).filter(p => p.id !== me && teamOf(p.id) === team && p.alive !== false), meP = frameBefore(round.frames, died.tick)?.players.find(p => p.id === me);
      if (meP && mates.some(p => Math.hypot(p.x - meP.x, p.y - meP.y) <= o.closeUnits)) out.at(-1).look = "You and a teammate held the bomb from the same spot: one grenade or one swing can take both, so split into a crossfire with separate angles."; }
    else add(won ? "retake-won" : "retake-lost", won ? 3 + 0.5 * kills.length : 2, moments, why);
  }

  // Saved weapon: alive at the end of a lost round with a rifle/AWP.
  if (decided && !won && !myDeath) {
    const end = frameBefore(round.frames, round.end)?.players.find(p => p.id === me), value = primaryValue(end);
    if (end && end.alive !== false && value >= 2700) add("saved-weapon", 1.5, [{tick: round.end, label: "Round lost, weapon saved"}], `Survived the lost round with a $${value} weapon.`);
  }

  // Buy versus team economy, sampled at the end of buy time (or the first death, if earlier).
  const buyTick = Math.min(round.live + 20 * rate, (deaths[0]?.tick ?? Infinity) - 1, round.end);
  const buy = (frameBefore(round.frames, buyTick)?.players ?? []).filter(p => teamOf(p.id) === team);
  const meBuy = buy.find(p => p.id === me), mates = buy.filter(p => p.id !== me);
  if (meBuy && mates.length >= 2) {
    const mine = equipmentValue(meBuy), avg = mates.reduce((s, p) => s + equipmentValue(p), 0) / mates.length, money = Number(meBuy.money);
    if (mine >= avg + 2500 && avg < 2000) add("force-alone", decided && !won ? 2.5 : 1.5, [{tick: Math.max(round.live, buyTick), label: "Buy decision"}], `Bought $${mine} of equipment while teammates averaged $${Math.round(avg)}.`);
    else if (mine < 2000 && avg >= 3300 && Number.isFinite(money) && money + mine >= 3700) add("under-buy", 2, [{tick: Math.max(round.live, buyTick), label: "Buy decision"}], `Only $${mine} of equipment with $${money} unspent while teammates averaged $${Math.round(avg)}.`);
  }

  // Evidence from the review engine (one category per finding type).
  const engine = new Map();
  for (const f of findings) {
    const m = ENGINE[f.type]; if (!m || f.round !== index) continue;
    const type = m.type ?? f.type, prev = engine.get(type), score = m.score(f);
    const moment = {tick: f.tick, label: f.title, type, why: f.detail};
    if (prev) { prev.moments.push(moment); prev.score = Math.max(prev.score, score); continue; }
    engine.set(type, {type, kind: f.kind, confidence: m.confidence, title: f.title, look: TIPS[f.type] ?? "", score, why: `${f.title}: ${f.detail}`, moments: [moment]});
  }
  out.push(...engine.values());
  return out;
}

// Main entry: ranked, capped picks for one player. review = reviewReplay(...) result (for its findings).
export function instructiveRounds(replay, review, opts = {}) {
  const o = {...INSTRUCTIVE_DEFAULTS, ...opts}, me = String(o.player), rate = replay.tickRate;
  if (!replay.players.some(p => p.id === me)) throw new Error(`Player ${me} is not in this demo`);
  const findings = (review?.findings ?? []).filter(f => f.player === me), candidates = [], pattern = {rounds: 0, deaths: 0, untraded: 0, openingDeaths: 0, byKiller: {}};
  replay.rounds.forEach((round, index) => {
    const cats = roundCategories(replay, index, me, o, findings).sort((a, b) => b.score - a.score);
    pattern.rounds++;
    const dead = cats.find(c => DEATHS.has(c.type));
    if (dead) { pattern.deaths++; pattern.byKiller[dead.killer] = (pattern.byKiller[dead.killer] ?? 0) + 1; }
    if (cats.some(c => c.type === "untraded-death")) pattern.untraded++;
    if (cats.some(c => c.type === "opening-death" || c.type === "opening-death-lost")) pattern.openingDeaths++;
    if (!cats.length) return;
    const total = cats[0].score + 0.4 * cats.slice(1).reduce((s, c) => s + c.score, 0);
    if (total < o.minScore) return;
    const sum = kind => cats.filter(c => c.kind === kind).reduce((s, c) => s + c.score, 0), bad = sum("mistake"), good = sum("highlight");
    const primary = cats[0], self = frameBefore(round.frames, round.live)?.players.find(p => p.id === me);
    const moments = cats.flatMap(c => c.moments.map(m => ({...m, kind: c.kind, look: c.look, severity: c.kind === "highlight" ? 1 : c.score >= 3.5 ? 3 : c.score >= 2 ? 2 : 1})));
    const windows = clipWindows(moments, round, rate, o), keyTick = primary.moments[0].tick;
    // Win-probability swing of the key moment for your team (hand-set model, an estimate).
    // From just before the first moment of the primary category to just after its last one.
    const wp = review?.rounds?.[index]?.winProbability ?? [], lastTick = primary.moments.at(-1).tick, sign = self?.team === 2 ? 1 : -1, mine = x => r2(sign > 0 ? x.t : 1 - x.t);
    const pre = wp.filter(x => x.tick < keyTick).at(-1), post = wp.filter(x => x.tick <= lastTick).at(-1);
    const swing = pre && post && post.tick >= keyTick && !(primary.kind === "highlight" && mine(post) >= 0.99) ? {before: mine(pre), after: mine(post)} : null;
    candidates.push({
      round: index, roundNumber: round.number, score: r1(total), kind: bad >= 2 && good >= 2 ? "mixed" : bad >= good ? "mistake" : "highlight",
      category: primary.type, title: primary.title, confidence: primary.confidence, why: [primary.why, ...cats.slice(1).filter(c => (c.type in ENGINE || c.type === "wasted-utility") && !(c.type === "isolated" && DEATHS.has(primary.type))).slice(0, 2).map(c => `Also: ${c.why}`)].join(" "), lookAt: primary.look,
      side: self?.team === 2 ? "T" : "CT", buy: self ? teamBuy(replay, index, self.team) : null, won: winnerTeam(round.winner) !== null ? winnerTeam(round.winner) === self?.team : null,
      startTick: round.live, endTick: round.end, keyTick, keySeconds: r2(keyTick / rate), keyClock: mmss(keyTick / rate), roundClock: clock(round, keyTick, rate),
      winChance: swing, categories: cats.map(c => ({type: c.type, kind: c.kind, score: r1(c.score), confidence: c.confidence, why: c.why})),
      windows, spectate: {steamId: me, name: playerName(replay, me), accountId: accountId(me)}
    });
  });
  return {
    format: "strat-scope-instructive-rounds", version: INSTRUCTIVE_VERSION, map: replay.map, tickRate: rate, rounds: replay.rounds.length,
    player: {steamId: me, name: playerName(replay, me), accountId: accountId(me)},
    settings: {max: o.max, leadSeconds: o.leadSeconds, deathLeadSeconds: o.deathLeadSeconds, tailSeconds: o.tailSeconds, tradeSeconds: o.tradeSeconds, maxDeaths: o.maxDeaths},
    candidates: candidates.length, patterns: pattern, picks: choose(candidates, o).map((p, i) => ({rank: i + 1, ...p}))
  };
}

// Best rounds by score, keeping at least minEach mistakes and minEach good examples when available.
export function choose(candidates, {max = INSTRUCTIVE_DEFAULTS.max, minEach = INSTRUCTIVE_DEFAULTS.minEach, maxDeaths = INSTRUCTIVE_DEFAULTS.maxDeaths} = {}) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.roundNumber - b.roundNumber), picked = new Set();
  const others = sorted.filter(c => !DEATHS.has(c.category)).length, allowed = Math.max(maxDeaths, max - others);
  let deaths = 0; const ranked = sorted.filter(c => !DEATHS.has(c.category) || ++deaths <= allowed);
  for (const kind of ["mistake", "highlight"]) ranked.filter(c => c.kind === kind || c.kind === "mixed").filter(c => !picked.has(c)).slice(0, Math.min(minEach, Math.floor(max / 2))).forEach(c => picked.add(c));
  // Highlights fill at most half the list while mistakes are left, so lessons are not crowded out.
  const maxHighlights = Math.ceil(max / 2), highlights = () => [...picked].filter(c => c.kind === "highlight").length;
  for (const c of ranked) { if (picked.size >= max) break; if (c.kind === "highlight" && highlights() >= maxHighlights && ranked.some(x => x.kind !== "highlight" && !picked.has(x))) continue; picked.add(c); }
  for (const c of ranked) { if (picked.size >= max) break; picked.add(c); }
  return ranked.filter(c => picked.has(c));
}

// leadSeconds before / tailSeconds after each moment, clamped to the round, merged when they overlap.
export function clipWindows(moments, round, rate, {leadSeconds = INSTRUCTIVE_DEFAULTS.leadSeconds, tailSeconds = INSTRUCTIVE_DEFAULTS.tailSeconds} = {}) {
  const lo = round.start ?? round.live, hi = Math.max(round.end, round.eventEnd ?? round.end), out = [];
  const byTick = new Map();
  for (const m of [...moments].sort((a, b) => a.tick - b.tick)) byTick.set(m.tick, [...(byTick.get(m.tick) ?? []), m]);
  for (const [tick, ms] of byTick) {
    const lead = Math.max(leadSeconds, ...ms.map(m => m.lead ?? 0)), start = Math.max(lo, Math.round(tick - lead * rate)), end = Math.min(hi, Math.round(tick + tailSeconds * rate)), last = out.at(-1);
    if (last && start <= last.endTick) { last.endTick = Math.max(last.endTick, end); last.moments.push(...ms); }
    else out.push({startTick: start, endTick: end, moments: [...ms]});
  }
  return out.map(w => ({
    startTick: w.startTick, endTick: w.endTick, seconds: r2((w.endTick - w.startTick) / rate),
    startSeconds: r2(w.startTick / rate), endSeconds: r2(w.endTick / rate), startClock: mmss(w.startTick / rate), endClock: mmss(w.endTick / rate),
    moments: w.moments.map(m => ({tick: m.tick, seconds: r2(m.tick / rate), clock: mmss(m.tick / rate), roundClock: clock(round, m.tick, rate), type: m.type, kind: m.kind, severity: m.severity, label: m.label, why: m.why, look: m.look}))
  }));
}

// One recording-plan clip per window (the same format as the review's "Export clips").
export function instructivePlan(replay, result, {demoFile = replay.source} = {}) {
  const me = result.player.steamId;
  const clips = result.picks.flatMap(p => p.windows.map((w, k) => ({
    id: `r${p.roundNumber}-${me}-${w.startTick}`, player: me, round: p.round, roundNumber: p.roundNumber, start: w.startTick, end: w.endTick,
    score: p.score, kind: p.kind, title: p.windows.length > 1 ? `${p.title} (${k + 1}/${p.windows.length})` : p.title, clock: w.moments[0].roundClock,
    notes: w.moments.map(m => ({tick: m.tick, clock: m.roundClock, kind: m.kind, type: m.type, severity: m.severity, title: m.label, detail: m.why, tip: m.look}))
  })));
  return buildRecordingPlan(replay, null, clips, {demoFile});
}

const cell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
export function instructiveMarkdown(result, {demo = "", plan = ""} = {}) {
  const lines = [
    `# Instructive rounds: ${result.player.name} on ${result.map}`, "",
    `Demo: ${demo || "?"} · ${result.rounds} rounds · ${result.tickRate} ticks/s · ${result.picks.length} picks from ${result.candidates} candidate rounds.`,
    `Clip window: ${result.settings.leadSeconds} s before (${result.settings.deathLeadSeconds ?? result.settings.leadSeconds} s before your deaths) and ${result.settings.tailSeconds} s after each key moment, merged on overlap. Demo time and clip windows are time since the demo start; "left" times in the text are the round clock (round time left; after the plant the bomb timer, marked (bomb)). Spectate: ${result.player.name}.`,
    "Confidence: high = from game events, medium = from sampled positions/inventories, low = judgement call.", "",
    ...(result.patterns ? [`Patterns: you died untraded (no trade within ${result.settings.tradeSeconds}s) in ${result.patterns.untraded} of ${result.patterns.rounds} rounds and died first in ${result.patterns.openingDeaths}; ${result.patterns.deaths} rounds have either. Killers in those rounds: ${Object.entries(result.patterns.byKiller).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}.`, ""] : []),
    "| # | Round | Type | Category | Conf. | Demo time | Clip window | Why / what to look at |", "|---|---|---|---|---|---|---|---|"
  ];
  for (const p of result.picks) {
    const clips = p.windows.map(w => `${w.startClock}-${w.endClock} (${w.startTick}-${w.endTick})`).join("<br>");
    lines.push(`| ${p.rank} | ${p.roundNumber} (${p.side}, ${p.won === null ? "?" : p.won ? "won" : "lost"}${p.buy ? `, ${p.buy}` : ""}) | ${p.kind} | ${cell(p.title)} | ${p.confidence} | ${p.keyClock} (${p.keySeconds}s, tick ${p.keyTick}) | ${clips} | ${cell(p.why)}${p.winChance ? ` Team win chance (model estimate) ${Math.round(p.winChance.before * 100)}% to ${Math.round(p.winChance.after * 100)}%.` : ""} Look at: ${cell(p.lookAt)} |`);
  }
  for (const p of result.picks) {
    const extra = p.categories.slice(1).map(c => `${c.type} (${c.confidence})`).join(", ");
    if (extra) lines.push("", `- Round ${p.roundNumber} also: ${extra}`);
  }
  if (plan) lines.push("", "## Record (once CS2 playback works)", "", "```", `node recorder/record-clips.mjs --plan "${plan}" --demo "${demo}" --dry-run`, "```");
  return lines.join("\n") + "\n";
}
