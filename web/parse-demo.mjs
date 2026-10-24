import * as core from "./core.mjs";
import {beginStep, headerDetails, warnReport} from "./diagnostics.mjs";

// Shared by the worker and tests so failure reports exercise the real pipeline.
export async function parseDemo(bytes, name, parser, report, onProgress = () => {}) {
  const progress = (stage, operation, pct) => {
    beginStep(report, stage, operation);
    onProgress({type: "progress", stage, pct, report});
  };
  progress("Checking demo format", "validateSignature", 8);
  const stamp = new TextDecoder().decode(bytes.subarray(0, 7));
  report.context.signature = stamp.replace(/[^\x20-\x7e]/g, ".");
  if (stamp !== "PBDEMS2") throw new Error("This is not an uncompressed CS2 .dem file. Extract .zip, .bz2 or .zst archives first. CS:GO demos are not supported.");

  progress("Reading demo header", "parseHeader", 10);
  const header = core.plain(parser.parseHeader(bytes));
  report.context.header = headerDetails(header);

  progress("Reading rounds, kills and utility events", "parseEvents", 15);
  report.context.eventNames = core.EVENT_NAMES;
  report.context.eventPlayerProps = ["X", "Y", "Z", "yaw", "team_num"];
  report.context.eventOtherProps = ["total_rounds_played", "is_warmup_period"];
  const events = core.plain(parser.parseEvents(bytes, core.EVENT_NAMES, report.context.eventPlayerProps, report.context.eventOtherProps));

  progress("Finding live rounds", "findRounds", 30);
  const rounds = core.findRounds(events);
  report.context.roundCount = rounds.length;
  if (!rounds.length) throw new Error("No live match rounds found. Use a complete matchmaking, FACEIT or GOTV demo.");
  const ticks = core.wantedTicks(rounds);
  report.context.requestedTickCount = ticks.length;
  report.context.requestedTickRange = {first: ticks[0], last: ticks.at(-1)};
  report.context.playerProps = core.PLAYER_PROPS;

  progress("Reading player positions and view angles", "parseTicks", 35);
  const rows = parser.parseTicks(bytes, core.PLAYER_PROPS, ticks, undefined, false);
  report.context.playerSampleCount = rows.length;

  progress("Tracing grenade trajectories", "parseGrenades", 70);
  let grenades = [], warning;
  try {
    grenades = parser.parseGrenades(bytes, undefined, false);
    report.context.grenadeSampleCount = grenades.length;
  } catch (error) {
    warning = "Grenade flight paths could not be parsed. Detonation and area effects remain available.";
    warnReport(report, error, warning);
  }

  progress("Preparing replay timeline", "assemble", 90);
  const replay = core.assemble(header, events, rows, grenades, name);
  if (warning) replay.warnings.push(warning);
  report.context.replayWarnings = replay.warnings;
  report.context.replayRoundCount = replay.rounds.length;
  report.context.replayPlayerCount = replay.players.length;
  return replay;
}
