// Turns review clips into a recording plan: demo ticks, spectator target and burned-in critique subtitles.
// Shared by the review UI (export) and recorder/record-clips.mjs (CS2 + HLAE/OBS capture).
export const PLAN_VERSION = 1;
const STEAM64_BASE = 76561197960265728n;

export function accountId(steamId) {
  try { const id = BigInt(String(steamId)); return id > STEAM64_BASE ? String(id - STEAM64_BASE) : null; } catch { return null; }
}
export function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000)), p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}
export function safeName(s) { return String(s ?? "").normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "clip"; }

// Subtitles: a title card, then each critique from shortly before its tick until the next one (max 6 s).
export function clipSubtitles(clip, playerName, rate) {
  const at = tick => (tick - clip.start) / rate, duration = (clip.end - clip.start) / rate, cues = [];
  cues.push({from: 0, to: Math.min(3.5, duration), text: `${playerName} · Round ${clip.roundNumber} · ${clip.clock}\n${clip.title}`});
  const notes = [...clip.notes].sort((a, b) => a.tick - b.tick);
  notes.forEach((n, i) => {
    const from = Math.max(cues.at(-1).to, at(n.tick) - 0.4), next = notes[i + 1] ? at(notes[i + 1].tick) - 0.4 : duration;
    const to = Math.min(duration, Math.max(from + 2.5, Math.min(next, from + 6)));
    if (from >= duration) return;
    cues.push({from, to, text: `${n.kind === "highlight" ? "GOOD" : ["", "MINOR", "MAJOR", "CRITICAL"][n.severity] ?? "NOTE"}: ${n.title}\n${n.tip || n.detail}`});
  });
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`).join("\n");
}

export function buildRecordingPlan(replay, review, clips, {demoFile = replay.source} = {}) {
  const rate = replay.tickRate, names = new Map(replay.players.map(p => [p.id, p.name]));
  return {
    format: "strat-scope-recording-plan", version: PLAN_VERSION, demoFile, map: replay.map, tickRate: rate,
    clips: clips.map((c, i) => {
      const player = names.get(c.player) ?? c.player;
      return {
        id: c.id, index: i + 1, file: `${String(i + 1).padStart(2, "0")}_R${c.roundNumber}_${safeName(player)}_${safeName(c.title)}`,
        kind: c.kind, title: c.title, player, steamId: c.player, accountId: accountId(c.player), roundNumber: c.roundNumber,
        startTick: c.start, endTick: c.end, seconds: Math.round((c.end - c.start) / rate * 100) / 100,
        subtitles: clipSubtitles(c, player, rate),
        notes: c.notes.map(n => ({seconds: Math.round((n.tick - c.start) / rate * 10) / 10, title: n.title, detail: n.detail, tip: n.tip}))
      };
    })
  };
}

// Console commands that lock the demo camera onto the clip player in first person.
export function spectateCommands(clip) {
  const target = clip.accountId ? `spec_player_by_accountid ${clip.accountId}` : `spec_player "${clip.player.replace(/"/g, "")}"`;
  return [target, "spec_mode 1"];
}
