---
name: cartoon-3d-short-workflow
description: Director mode workflow, token rules, and production stages for cartoon 3D shorts
---

# Workflow & Director Mode

User rules (language, captions, mix, export) are in SKILL.md. Reviews, models, thresholds and the gold loop are in
`QA.md`. This file is the order of work and the token rules.

## Token Rules
1. **Scripts before agents.** Never call an agent before every script gate passes (QA.md).
2. **Agents never read code or whole files.** Send only a beat or contact sheet at most 512 px wide (`beat_sheet.py`),
   the frame numbers, and one paragraph of context (deliberate choices: silhouettes, gags).
3. **Agent output** = compact JSON, ≤ 150 words:
   ```json
   {"score":{"look":0-10,"acting":0-10,"story":0-10},"fixes":[{"frame":123,"file":"cast.ts","issue":"...","fix":"..."}],"pass":true}
   ```
4. **Fix only named frames/files.** Re-render a short clip (±2 s, `render_draft.mjs --range`), never the whole video.
5. **Research/sandbox agents** (cam / world / mat / char / post) ONLY for a NEW reference style. Save to
   `gold/ref_cards/<style>.json`; never repeat for the same style.

## Stages Per Video
1. **Script.** Write `SCRIPT.md` and `words.json`. Hook in the first second; facts verified with sources; key words in CAPS.
   - **Director plan** (main session, no agent): `npm run director -- plan stories/<slug>/SCRIPT.md --lean` until
     it exits 0, then review `out/director/<slug>/review.md`. Loop and rules: `DIRECTOR.md`.
2. **Read first (cheap, mandatory):** `references/lessons-summary.md`, `gold/LESSONS.md`, `gold/ref_cards/<style>.json`.
   Start from gold parameters, never from zero. `references/lessons.md` (the full log) only when a failure needs it.
3. **Build.** Pick the template (below). Order: story.ts, rail / build / paint.ts, lights / world / shade / grade.ts,
   toon.ts, cast.ts, ink / lensblur / Bridge.tsx, audio. Test each aspect on a 10 s clip before any full render.
   Read `references/motion-camera.md` for every shot with a character or an action.
4. **Script gates**, then **agent review**, then **final audit**: all in `QA.md`.

## Template Selection
- **Default: `templates/rail/`** — newest base, has all acting/look upgrades.
- `templates/bridge/` — only to reproduce or adapt the Bridge set (river bridge). `templates/palace/` — indoor/outdoor
  multi-character, night, Javanese. Port upgrades from rail into them when needed.
- `templates/court/` (PBR look) and `templates/diorama/` (our house style): `bible/modes/pbr.md`.
- Minecraft mode: `bible/modes/minecraft.md` (voxel sets and mobs; no template copy).
