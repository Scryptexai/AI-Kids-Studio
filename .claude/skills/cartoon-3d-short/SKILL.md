---
name: cartoon-3d-short
description: Make a ~55-70 s vertical cartoon story short ("2D characters in a 3D world", rendered with three.js in Remotion). Looks - painted (rail, bridge, palace), PBR (court), diorama (our house style), Minecraft voxel. Use for any story short with cartoon characters in 3D, formula-B (mocked then proven right) or formula-C (how you invented X) stories, or "use the cartoon short skill".
---

# Cartoon 3D story short (three.js + Remotion)

Proven example: **The Bridge That Fell for a Song** — an original 67 s short about the 1831 Broughton bridge
and 74 soldiers marching in step.
- Code: `src/videos/bridge/` of the Remotion project (composition `BridgeShort`, 1080x1920, 30 fps).
- Style research: `references/`.

The style reference is a channel studied privately. **Never upload, publish or send those videos.**
**Never copy their scripts, characters or shots.** Story, characters and voice are always OUR OWN.
**Never say the channel's name in a voice-over or description.**

## User rules (non-negotiable)
- No captions, labels or title cards in the video (captions are a separate green-screen clip).
- Language comes from the script preamble (`Language:` / `Bahasa:`); default English.
- Voice: one steady tone, flowing without pauses.
- Jokes are researched real facts.
- Standard mix (single standard): music +3 dB, SFX -6 dB, voice unchanged. SFX = free recordings only.
- Review pass threshold: 8.5 per category. One light round for new projects, max 2 for full review.
- Nobody is ever frozen: idle at all times, extras included.
- Characters and mobs stay in the Shorts safe zone (top 8, right 16, bottom 25, left 4 %).
- Final export 2K vertical: 1440x2560, `--scale 1.3333333333333333`.
- Save after every step. "Just do it" once the script is approved.

## Read first (cheap, mandatory, before step 1)
1. `references/lessons-summary.md` — the silent failures and one-line commands that cost a whole render.
2. `gold/LESSONS.md` (≤ 60 lines) and `gold/ref_cards/<style>.json` (today: `ink-painted.json`).
   Start from the gold parameters, never from zero.
`references/lessons.md` (full log, newest at the bottom, wins over this file) is on demand: open it only when
the summary does not cover a problem.

## Modular references (read only the file for the task)
| Task | File |
|------|------|
| Index of the bible (style, characters, environment, camera, modes) | `bible/README.md` |
| Director mode, token rules, stages, templates, hard rules | `references/WORKFLOW.md` |
| Story beats, Formula B, Formula C (evolution ladder), script, thumbnails, colour script | `references/STORYTELLING.md` |
| toon.ts, cast.ts, cardshade.ts, poses, acting numbers | `bible/characters.md` |
| Spring rig for leads (rig.ts: overlap, planted feet, weight shift, eyes first) | `bible/characters.md` "Rig layer" |
| Default face (v3.3 emote, 33 names), wide head v3, bald by default (hair only when the story needs it) | `bible/characters.md` "Face v3.3" |
| Framing, camera grammar, story.ts data structure, readability traps | `bible/camera.md` |
| Sets, lighting, world, paint, build, measured targets, assets | `bible/environment.md` |
| Composer order, effects, QA gate, render scripts, disk, delivery | `references/RENDERING.md` |
| Voice, SFX, music, mix, sound-off test | `references/AUDIO.md` |
| Review rounds, script gates, final audit, look-match loop | `references/QUALITY_ASSURANCE.md` |
| Director plan: script -> validated animation plan, preview.md, gap report | `references/DIRECTOR.md` |
| PBR look (no world ink, HDRI/IBL, bevelled masonry, lit cards), its traps, the look-match round loop, the diorama style knobs | `bible/modes/pbr.md` |
| Motion presets (expressions, acting, mob, camera) + review rubric; plans name them instead of inventing motion | `presets/` (+ `bible/modes/minecraft.md`, "Motion presets") |
| Painted look numbers (ink, lens, bloom, grade) | `bible/modes/painted.md` |
| Minecraft environment mode: voxel sets from local Minecraft assets, asset extractor + manifest, VoxelSet schema, `mc-validate`, voxel renderer + `mc-preview` stills, 3D mobs + props + 2D cast cards, director plans voxel sets from SCRIPT.md (`World: minecraft`), phase status | `bible/modes/minecraft.md` |

## Templates
- **Rail** (`templates/rail/`) — the default. Newest base; every acting and look upgrade. Use for everything
  except the special sets below. Port the upgrades into bridge and palace after each short.
- **Bridge** (`templates/bridge/`) — river bridge, 1831 Broughton setting.
- **Palace** (`templates/palace/`) — indoor/outdoor intrigue, night scenes, Javanese setting.
- **Court** (`templates/court/`) — the PBR look: no world ink, HDRI light + shadowing sun, instanced bevelled
  masonry, dense grass, AO + thin-lens DOF + bloom, lit cards with costume overlays. Castle/gate courtyard set.
  Read `bible/modes/pbr.md` first. Its toon.ts has hats mop/dome, crest, bigBeard, hbelt, skirt, drill, crouch:
  port them to rail when a rail short needs them.
- **Diorama** (`templates/diorama/`) — OUR OWN house style (approved 2026-11-11), built on court:
  - paper-cutout cards (white margin, cut edge, cast shadow) in a warm toy model;
  - macro DOF, cameras above looking down, dirt spots under the cast.
  - Read its README and the diorama section of `bible/modes/pbr.md`.
  - Use it when the user wants "our style" or the diorama look.

## Pipeline (stages, details and numbers are in the modular files)
1. Topic and facts (one surprising true story with a physical cause and effect). Every claim gets a row in `sources.md`
   (link the user can open); the user checks sources before the voice (`references/STORYTELLING.md`).
2. Read first (above).
3. Script: `SCRIPT.md` + `words.json`, then the director plan, then the thumbnail storyboard (MANDATORY before any 3D).
   Director plan: `npm run director -- plan stories/<slug>/SCRIPT.md --lean`; this session writes the draft it asks
   for, reruns until exit 0, and reads `out/director/<slug>/review.md`. The loop is in `references/DIRECTOR.md`.
4. Shot plan in `story.ts` (copy the right template to `src/videos/<name>/`, register the composition in `src/Root.tsx`).
5. World — set density and lighting **from the start**, not as a late pass. Hero shot first (target ≥ 6/10).
   Hero prop (the story's object) = real 3D build with a 6-angle look sheet first (`bible/environment.md`).
6. Characters — grow the pose library; key every body change through `hit()`, never `smooth()`.
   Acting line per shot (thought → eyes first → action on the stressed word → hold) and physics timing for falls
   (`bible/characters.md`).
   The director's `gap-report.json` lists the actions this short needs that have no clip yet.
7. Post — composer order, effects, grade.
8. Sound — lock picture time constants BEFORE making sound. Cues in frames, SFX peak on the contact frame,
   music resolves on the final frame (`references/AUDIO.md`).
9. Look checks — contact sheet, phone test (360 px sheet), side-by-sides, sound-off test, Opus inspection.
   Every fix = WHERE / PROBLEM / CHANGE / KEEP in frames; fix the 3 worst, re-render only that range.
10. Final render — **Pre-render QA gate first**, then `render_final.mjs` only. Never plain `npx remotion render`.
11. Deliver — `ffprobe` check (1440x2560, 30/1, planned duration), then the final mp4 is named with the upload title (`<Video Title>.mp4`, Windows-safe), then `dump_shots.mjs` + `export_extras.py` (captions.srt, shots.edl, stems/).
    Then the green-screen captions clip (skill `captions`): 10 s test to the user first, full length after OK. Never skip it.

Mode branch: `World: minecraft` in the script preamble -> voxel pipeline (`src/minecraft`, `mc-*` commands,
safe-zone check; `frame_check` does not see mobs): `bible/modes/minecraft.md`. Otherwise pick a template above.

## Learn from the best videos
- **After SHIP:** save to `gold/videos/<slug>/` (beat sheet, agent scores, key params).
- **7 days after upload:** pull performance. A video is **gold** if it is in the channel's top 20 %
  OR its average art score is ≥ 9. Write at most 3 new lines to `gold/LESSONS.md` in the form
  `- [aspect] rule -> proof (slug, frame, metric)`. Keep it ≤ 60 lines. A poor performer gets one line in `gold/ANTI.md`.

## Report to the user at the end of each video
Final scores, number of review rounds, agents used (with model), estimated token count, new lessons if any.