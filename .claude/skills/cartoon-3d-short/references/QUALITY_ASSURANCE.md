---
name: cartoon-3d-short-qa
description: QA gates, review rounds, thresholds, final audit and the gold loop for cartoon 3D shorts
---

# Quality Assurance

## Pass threshold (one number)
**8.5 / 10** for every scored category (look, acting, story, and each `presets/REVIEW_RUBRIC.md` category), with zero
critical issues (character cut by the frame, spoiler, covered face). There is no second, stricter bar.
The art review measured the Bridge-era template at about 5/10, so a stop in round 2 is expected on a weak set:
report it, do not loop.

## Review rounds
- **New projects (since 2026-11-13): one lightweight round on the key scenes** (the hook, the payoff, at most one scene the
  user names). One fresh `fable` reviewer scores them with `presets/REVIEW_RUBRIC.md`. Categories under 8.5 get fixed
  once, then the user sees it. No re-review loop unless the user asks.
- **Full review (only when the user asks): at most 2 rounds per draft.** If round 2 still fails, STOP and report the open issues.

## Script gates (no tokens, all must pass before any agent)
- **Sources first:** `sources.md` exists and every factual claim in SCRIPT.md has a row (read both, no tool); any on-screen number,
  date or name is in it too.
0. `npm run director -- validate out/director/<slug>`: the plan still matches SCRIPT.md, words.json and the story.ts takes.
   Rerun after any script or voice change.
1. `frame_check.mjs`: characters cut by the frame edge.
2. `fx_gate.mjs`: effect activity and dependency dedupe.
3. `short_qa.py`: black, white, frozen, pop frames; loudness −14 LUFS.
4. `beat_sheet.py`: one frame per narration phrase.

## Agent review (parallel, once per round, from the same beat sheet)
| Task | Model |
|------|-------|
| Sound-off review: picture matches the line at that moment, no spoiler, nobody cut by the frame, no face covered | **Sonnet** (Haiku missed subtle spoilers) |
| Art review (look, acting, story) and final audit | **Opus** |
| Side-by-side verifier | **Opus, effort max**, ONLY when look scores 7-8 (skip at ≥ 9 or ≤ 6) |
| Lightweight key-scene review | **fable** (rubric above) |
Everything else (builders, debuggers, renders, captions): `memory/agent-models.md`.

**Sound-off test (every draft):** `python -I scripts/beat_sheet.py draft.mp4 words.json out/<name>/beats`; watch muted, then
give the sheets and SCRIPT.md to a fresh agent. Per phrase: (1) picture shows what the line says, at that moment, not
before; (2) who it is and what they feel is clear without sound; (3) subject centred and every character whole;
(4) nothing covers a face or key prop. Fix every "no" before final.

**Phone test (every draft, no tokens):** `ffmpeg -i draft.mp4 -vf "fps=1/3,scale=360:-1,tile=6x4" -frames:v 1 out/<name>/review/phone.png`.
Look at it at 100 %: faces, the hero prop and the key action must read at 360 px wide. Anything that does not read is a fix.

**Fix requests (every correction, to an agent or to yourself):** four fields, frame numbers only.
```
WHERE    global frames 1248-1266 (shot id)
PROBLEM  what is wrong, measured (e.g. ball hits at 1268, hit SFX at 1262)
CHANGE   only this (e.g. fall starts 1254, contact 1262, ease-in, no bounce)
KEEP     what must not move (camera, cuts, word timing, other shots)
```
Then stills at the key frames + a `render_draft.mjs --range` of that slice only, never the whole episode.
Fix order: wrong or missing first, then readability, then timing, then visual detail. Per pass: list every problem
with a timestamp, fix the 3 worst, re-sheet, repeat (inside the round limits above).

## Final audit (Opus, once)
From the final contact sheet and the checklist only. Verdict **SHIP** or **FIX** (≤ 3 items).

## Learn from the best videos
- **After SHIP:** save to `gold/videos/<slug>/` (format in `gold/videos/README.md`): beat sheet, agent scores, key params.
- **7 days after upload:** pull performance (views, retention, swipe-away). **Gold** = top 20 % of the channel OR average
  art score ≥ 9. Gold: at most 3 lines to `gold/LESSONS.md` as `- [aspect] rule -> proof (slug, frame, metric)`; keep it ≤ 60
  lines (merge similar, drop unsupported). A poor performer gets one line in `gold/ANTI.md`.

## Report to the user at the end of each video
Final scores, number of review rounds, agents used (with model), estimated token count (from session usage), new lessons.

---

## Look-match loop (for "make it look like X" passes)
Prefer the lighter one-set version first (one sandbox, 6 rounds, metrics + 9 aspect scores, no agents):
`bible/modes/pbr.md`, "Look-match loop used". Use the multi-owner loop only for a whole-template overhaul.

1. **Measure the reference first.** One analysis agent per topic (motion, depth, textures, characters, lighting, outlines,
   grade) writes numbers, not adjectives, to `references/reports/<topic>.md` (shared brief: `references/reports/CONTEXT.md`).
2. **Sandboxes, one owner per file.** Copy the project to `src/videos/<name>_{cam,world,mat,char,pos}` with entries
   `src/sandboxes/<n>/index.tsx`. cam: story.ts. world: world.ts, lights.ts, shade.ts, grade.ts. mat: paint.ts, build.ts.
   char: toon.ts, cast.ts, cardshade.ts. post: ink.ts, Bridge.tsx, lensblur.ts. Agents edit only their own files; render with
   `BRIDGE_ENTRY=src/sandboxes/<n>/index.tsx node scripts/bridge-stills.mjs out/<name>/<n>/x_ <frames> 0.5`.
3. **Merge:** `python scripts/bridge_merge.py [cam,world,mat,char,pos]` (backs main up to `backup/bridge_<time>/`, copies
   owned files only), then `npx tsc --noEmit` (filter to the project folder), then re-sync every sandbox from main.
4. **Verify:** a fresh Opus max agent: side-by-side sheets, each area scored 0-10 + a numbered fix list with frame numbers;
   map each fix to its file owner and resume that owner's agent with SendMessage.
5. **Contracts between owners** live in exported constants: `NOINK` layer (ink.ts, character cards), `dofAt` / `FOREGROUND`
   (story.ts), `LIGHTS` / `LOOK` (lights.ts). Changing a contract = tell every owner that reads it.
