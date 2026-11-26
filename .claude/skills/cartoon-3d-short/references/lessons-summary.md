# Lessons summary (mandatory cheap read before step 1)

The full log is `lessons.md` (newest short at the bottom; it wins over SKILL.md when they disagree).
This file is the subset that must be read before anything else — the silent failures and the
one-line commands that cost a whole render.

## Dependencies (silent-kill everything)
- Pin exactly: `three@0.170.0`, `postprocessing@6.36.6`, `@react-three/postprocessing@3.0.4`.
- **Check `node_modules/@react-three/postprocessing/node_modules/postprocessing` does NOT exist.**
  A nested second copy makes the composer silently drop every custom Effect/Pass (ink, lens, bloom,
  tone, grade) — `instanceof` fails, no error. Test: a shader that outputs pure red must keep the still red.
- Run `npm ls postprocessing three @react-three/postprocessing` before any render.

## Paths and environment
- Keep the project on a short path (`E:\animated-shorts`). Past Windows' 260-char limit,
  `chrome-headless-shell` fails to launch (ENOENT).
- Render with `export TEMP='<big drive>/remotion-tmp' TMP='<big drive>/remotion-tmp'`.
  Every Remotion bundle copies `public/` (~1.3 GB) into `remotion-webpack-bundle-*` and never deletes it.
  In JS strings write the path with a forward slash (`\r` becomes a carriage return).

## Final render (the two that ate a whole short)
- **Never use plain `npx remotion render` for the final.** It produced a 2K file with no ink, no lens blur
  and no grade while the stills looked fine and nothing errored. Render only through `render_final.mjs`.
- `--scale=1.3333333333333333` for 1440x2560. `1.3333` gives a 2559.94 px height and stitching fails.
- The first frame each render tab draws comes out off (frames 0..concurrency-1). Re-render frames 0-15
  with `--concurrency=1`, use frame 1 as frame 0, splice with ffmpeg.
- Ground layers that overlap need a 2 cm height step and `cam.near` ≥ 0.15, or they z-fight.
  Keep contact blobs above the highest ground layer.

## Audio
- Run audio scripts with plain `python`, not `python -I` — they cannot import `dsp.py`.
- faster-whisper "small", language set, `vad_filter=True`, **no `initial_prompt`** (it skipped the first 27 s).
  Then align to the script with difflib.
- Make a provisional `words.json` at ~3.7 words/s until the voice exists; re-check camera speeds after the real one lands.

## Camera and framing (repeat offenders)
- Run `scripts/frame_check.mjs` after every camera change — it lists CUT/EDGE per shot.
  Seated characters report CUT (it assumes a 1.85 m standing card); check those by eye.
- Sight-line culling covers `house()` and `prop()` only. Check posts, curtains and walls along every ray yourself.
- Never aim a camera ray at a facade: the culler removes any house a ray ends inside.
- Keep every camera at least 1 m from any character mark (a lens at ~0.5 m fills the frame with the card).
- Keep every camera position outside all buildings (a lens inside a box is invisible in colour but fills the ink pass).
- A dolly push toward a far look point moves the camera metres: on group shots keep the rate ≤ 0.001/f.
- For three people in frame, use a wide with all centred, staggered in depth — never three side by side in a medium shot.
- Staging rule for long takes: consecutive framings must look the same way. A 180° turn between phrases = a whip of 500+ px/f.

## Characters and props
- A prop held at the face (phone, receipt) is covered by the head/hijab: draw it after the head, at the cheek.
- A prop held near the chin hides behind the head: give it its own hand position, out beside the chest.
- A helmet plume drawn as one ellipse reads as an egg or a spoon: use three small feathers.
  For a big crest (court dome helm), use one swept-back curved brush with a ragged edge; give the card canvas headroom (`TOP`) or the top is clipped.
- Objects that appear mid-shot must enter (drop, slide), never pop in.
- Hide what the voice has not named yet with a cover plate toggled per shot. Never pop a prop in mid-shot.
- An fx card standing inside world geometry is clipped: put insert cards outside every box, or lift them.
- A huge additive glow card (12 m) strobes when the lens flies past it: fade by lens distance.
  Ease post effects out over 15-20 f, never 4 f.

- Big worlds: render_draft/render_final `--concurrency 3/2` (else D3D 0x8007000e); frame_check output is on stderr.
- "Slower than" = both in one frame on the word; crowds walk in on the word that names them, never stand in the way.

## Process
- Before writing, ask: narration language, real story or fiction, who records the voice.
- Review a contact sheet of one still per shot before any full render; send a 540x960 draft with audio
  for notes before rendering 2K.
- Audit every shot against motion-camera.md §2 and §3 before the first draft (~6 glides or cuts per 10 s).
- After every new `words.json`, run `node scripts/cam_speed.mjs src/videos/<name>/story.ts 30` and space keys by word.
- The Opus sound-off pass finds what sheet review misses: run it on every draft, pre-telling deliberate choices.

## PBR look (court template, `bible/modes/pbr.md`)
- Run the lens blur BEFORE N8AO. After it, the lens reads alpha-tested cards at background depth and blurs in-focus characters. That is invisible at low DOF and obvious at diorama DOF. Debug a soft subject with `{"post":{"ao":false}}`.
- Diorama: the miniature scale cue comes from the camera (above, looking down), not from blur alone. At eye level a heavily blurred set still reads as a big world.
- An additive light-shaft cone wider than the opening turns the whole arch into a flat blob: keep it narrow and streaked; debug with lens + bloom off.
- Saturation comes from albedo (warm stone, lime grass tips), not the grade.
- To swing a camera without re-blocking, move the whole layout rigidly with it (`rig` in Court.tsx).
- Never judge a look test from the two comparison stills only: render a 10-frame strip across the clip and check framing and transitions against the analysis shot table. Two stills hid a hard cut and a subject on the frame edge.
