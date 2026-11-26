---
name: cartoon-3d-short-rendering
description: Remotion rendering pipeline, post-processing, and final export for cartoon 3D shorts
---

# Rendering Pipeline

## Core Files
- `Bridge.tsx` — main composition, composer setup
- `ink.ts` — ink outline pass
- `lensblur.ts` — depth of field
- `grade.ts` — colour grading

## Composer Order (Bridge.tsx, painted look)
Court/diorama and Minecraft use other chains: `bible/modes/pbr.md`, `bible/modes/minecraft.md`.
```
ink → lens pre → lens main → bloom → NEUTRAL tone map → grade (MSAA 4)
```
- Every pixel parameter scales with output height / 1920

## Post-Processing Effects
| Effect | Config | Toggle |
|--------|--------|--------|
| Ink lines | #030303, 5.1px near (6m) → 3.3px far (90m) at 1080x1920, creases ×0.8 from 35°, depth jumps 1%, fog tint 0.3 far | `ink` |
| Lens blur | cInf px at 1080: hook/CU 15-16, CU 12-14, MS 10-12, park 7, golden sway 5, wides/aerials 0. Focus on eyes. | `lens` |
| Bloom | thr 1.0, int 0.5, 6 levels, radius 0.6 | `bloom` |
| Colour grade | NEUTRAL tone map → grade | `grade` |
| Zoom blur | only when Bridge.tsx has it (or dim/colour script) | `zoom` |

**Character cards:** on `NOINK` layer (own plum ink)

---

Film grain: OFF (the reference has none; 2.5 % made the 2K file 910 MB vs ~250 MB and turns to mush on YouTube).
Ink colour, line weights and the world-ink rules, and the character ink colour: `bible/modes/painted.md`.

---

## Render Scripts
**Draft (10s test):**
```bash
node scripts/render_draft.mjs <Comp> out/<name>/draft.mp4 --range 0-299
```
- Honours `BRIDGE_ENTRY` for sandbox
- `--range a-b` muxes matching slice of mix

**Final (MUST pass QA gate first):**
```bash
# Test first 5s
node scripts/render_final.mjs <Comp> out/<name>/final/test_5s.mp4 out/<name>/gate --range 0-149 --check <gate frame>

# Full render
node scripts/render_final.mjs <Comp> out/<name>/final/video.mp4 out/<name>/gate --check <gate frame>
```
- h264, CRF 16, scale 4/3 (1440x2560), Chrome + ANGLE

**Final file name = the upload title (user rule, 2026-11-11).** The user uploads straight to YouTube Shorts without
renaming, so the muxed final is named with the video's English title, not `<Comp>_2K.mp4`:
```bash
ffmpeg -y -i video_silent.mp4 -i ../audio/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -shortest \
  -movflags +faststart "<Video Title>.mp4"
```
- Title: a hooky upload title, ≤ 70 chars, Title Case, Windows-safe (no `\ / : * ? " < > |`, no trailing dot or space).
  Never the reference channel's name. Use the same title in the delivery `--title`, and say it in the hand-off message.
- Example: `The Plumber Who Held the Door for the Mona Lisa Thief.mp4`.
- **NEVER use plain `npx remotion render`** — produced a 2K final with no ink, no lens blur and no grade
- Mux: `-map 0:v:0 -map 1:a:0` (Remotion writes silent audio track)

---

## Pre-Render QA Gate (MANDATORY)
Run `node scripts/fx_gate.mjs <Comp> out/<name>/gate --frames <a,b> [--fx ink,lens,bloom,grade,zoom]`

**Checks:**
1. **Duplicate dependencies** — `npm ls postprocessing three @react-three/postprocessing` — exactly one version each
2. **A/B test each effect** — render ON vs OFF, compare pixels. If <0.5% pixels change >3/255, effect not running → STOP
3. **Confirmation logs** — each effect prints `[FX] <name> active` first run. No log ON = fail. Log OFF = broken toggle = fail.
4. **Mandatory report** — paste `fx_gate.md` table to user: deps OK, each effect ON/OFF log, A/B result. Only then start final render.
5. **Post-render** — show `<video>_fxcheck.md` (render_final.mjs writes). Checks logs + frame from mp4 closer to gate's ON still than any OFF still.

**Frames to test:** pick where each effect has something to act on (DOF shot for lens, night+lanterns for bloom, zoom move for zoom). Include ≥1 gate frame inside 5s test range.

---

## Disk Management (Critical)
See also `references/lessons-summary.md` ("Paths and environment").
- Every Remotion bundle copies `public/` (~1.3 GB) into temp folder (`remotion-webpack-bundle-*`), never deletes
- 60+ GB filled system drive during bridge passes
- **Always render with:**
  ```bash
  export TEMP='<big drive>/remotion-tmp' TMP='<big drive>/remotion-tmp'
  ```
  (`bridge-stills.mjs` sets this itself)
- When project finished and nothing rendering: delete its `remotion-webpack-bundle-*` and `puppeteer_dev_chrome_profile-*` folders in temp
- In JS strings: `"<big drive>/remotion-tmp"` (NOT backslash — `\r` becomes carriage return)

---

## Performance
- 2K renders ~4 fps (≈10 min for 67s)
- Stills at 0.5 scale: 3-8s each after ~40s bundle
- Sub-agents can't write report files → ask for ≤150-word final message, save to `out/<name>/<n>/REPORT.md` yourself

---

## Delivery (Step 11)
Before naming/uploading: `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,duration -of json "<final>.mp4"`
must show 1440x2560 (final) or 1080x1920 (draft), `30/1`, and the planned duration (± 1 frame). Also check the audio stream exists.
```bash
node scripts/dump_shots.mjs src/videos/<name>/story.ts out/<name>/shots.json
python -I scripts/export_extras.py <words.json> out/<name>/shots.json <mix_dir> out/<name>/final --title "<Video Title>"
```
Writes: `captions.srt` (one cue/phrase), `shots.edl` (CMX3600), `stems/` (voice, music, sfx, mix). Copy voice.wav to mix folder first.