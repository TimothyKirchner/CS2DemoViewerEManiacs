# Clip recorder

Records review clips from CS2 demo playback and burns the critiques in as subtitles. Not part of the packaged
app; run it with Node.js 22+ (OBS mode uses the built-in WebSocket) from the repository.

## Setup

1. Install the tools (none are bundled):
   - HLAE (main recorder): https://github.com/advancedfx/advancedfx/releases, unzip anywhere.
   - or OBS Studio 28+ (alternative): enable Tools > WebSocket Server Settings.
   - FFmpeg with libass on PATH (for example `winget install Gyan.FFmpeg`).
2. Copy `recorder.example.json` to `recorder/recorder.json` (ignored by Git) and set `hlae.exe`.
   `cs2` is found from the Steam library when left empty.

## Run

```sh
node recorder/record-clips.mjs --review ../match.scopereview --top 2 --dry-run
node recorder/record-clips.mjs --review ../match.scopereview --top 2
node recorder/record-clips.mjs --plan ../match.clips.json --mode obs
```

- `--review` reviews the saved `.scopereview` and records featured clips; `--player <name>`, `--all`,
  `--only <id|index,...>` and `--top N` change the selection. `--plan` takes the UI's "Export clips" file.
- `"player"` in `recorder.json` (name or SteamID64; the SteamID is in `Steam\config\loginusers.vdf`) makes
  every run record only that player, keeping up to `playerClips` (default 10) clips. `--all`/`--only` override it.
  If the player is not in the demo, the run stops and lists the players it found.
- `--review` also takes a `.dem` and parses it first (about 1 minute for a 200 MB demo).
- The demo is expected next to the input file under its original name; override with `--demo`.
- `--dry-run` writes subtitles, `plan.json` and `clips.md` and prints every command without starting CS2.
- `--no-launch` attaches to a CS2 already started with `-netconport 2121`; `--keep-open` leaves it running.
- `--no-burn` keeps the raw cut; the `.srt` sidecar is always written.

Output goes to `<input>-clips/`: `NN_R<round>_<player>_<finding>.mp4`, its `.srt`, the raw capture and
`clips.md` with every critique.

## Your CS2 settings stay untouched

- CS2 starts with `-insecure -allow_third_party_software -console -novid` added to your own Steam launch
  options. No resolution or window arguments: CS2 would save those to `cs2_video.txt`.
- No saved (archived) console variables are changed; `setupCommands` is empty by default.
- Before launching, every file in `Steam\userdata\<id>\730\local\cfg` is backed up to
  `%LOCALAPPDATA%\StratScope\cs2-settings-backup\<time>`. After CS2 quits, the backup is copied back.
- With `--keep-open` or `--no-launch` the restore is up to you:
  `node recorder/record-clips.mjs --restore-settings "<backup folder>"` (close CS2 first).

## How it works

The demo is copied to `game/csgo/stratscope_review.dem`. CS2 starts (through HLAE in HLAE mode) with
`-insecure -netconport <port>`, and the script drives the console over TCP: `playdemo`, then per clip
`demo_pause`, `demo_gototick <start>`, `spec_player_by_accountid <id>`, `spec_mode 1`, recording start,
`demo_resume`, a wait of clip length times `slowFactor`, `demo_pause` and recording end. HLAE writes to
`hlae.outputDir` (newest video file wins); OBS reports its output path. FFmpeg then trims to the clip length
and burns in the subtitles, running in the output folder so Windows paths need no escaping.

`-insecure` is required by HLAE. Never join VAC-secured servers from a CS2 started this way.

## Tuning

- `slowFactor`: HLAE renders at a fixed frame rate, so playback runs slower than realtime. Raise it if clips
  end early; the trim keeps the final length exact.
- `leadSeconds`: trims frames recorded before `demo_resume` took effect.
- `startupSeconds`, `demoLoadSeconds`, `settleSeconds`: waits for menu, demo load and the camera.
- `hlae.recordStart` / `recordEnd`: console commands with `{outputDir}`, `{fps}`, `{name}` placeholders.
