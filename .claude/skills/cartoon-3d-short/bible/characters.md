---
name: cartoon-3d-short-character
description: Character rig, acting, expressions, and pose library for cartoon 3D shorts
---

# Character System

## Core Files
- `toon.ts` — Canvas2D `Pen` drawing API, 600x1000 design canvas, soles at y=975, bean heads, stick limbs, plum variable-width outline, face library
- `cast.ts` — camera-facing billboards, crowds, effect cards, blinks, walk cycles. All billboards on `NOINK` layer
- `cardshade.ts` — cards lit by scene light, no emissive

---

## Pose Library (toon.ts)
Each pose works with every outfit. Grow after each short and copy back to templates.

| Pose | Description |
|------|-------------|
| lean forward and point | |
| crouch | |
| run, arms pumping | |
| fall or stumble | |
| startle (whole body jumps back, arms up) | |
| slump (shoulders down, head low) | |
| kneel | |
| sit relaxed / sit tense | |
| shrug (both hands out at shoulder height) | |
| facepalm | |
| push and pull | |
| reach (hand lands ~1.5 W from torso) | |

---

## Rig layer: `rig.ts` (springs + IK), approved 2026-11-18

In `templates/rail/` and `templates/diorama/` (copy next to `toon.ts`). Test: `src/sandboxes/rigtest` (RigTest, old vs new).
Use it for **lead characters in front view** instead of hand-keying `lean`/`armK` with `hit()`; the old curves stay for
extras and quick props.

- **Every part is a damped spring** chasing its own target (no canned bounce). Overlap comes from per-part delays:
  pelvis 0 f → shoulders 1 → chest/lean 2 → hands 2 → head 4; **eyes −3 f (they move first)**.
- **Anticipation** is automatic: any big change gets a small move the other way over the 4 f before it.
- **Planted feet (IK):** `hipX` shifts the pelvis, `sink` drops it; the soles never slide, the knees bend.
- **Life layer, always on:** weight moves to the other leg every ~3 s with contrapposto (chest leans back over the
  feet), breath in the shoulders and pelvis, head drift, blinks on eye jumps and expression snaps.
- **Hands** are world-space springs, so they trail every body move and travel on arcs (y slower than x).
- **Talking:** each word kicks the head, pelvis and the gesturing hand by its stress (0..1); the springs damp it.
- Face changes lead the body by 4 f (expression slides like `exprMorph`).

Script it as beats (only what changes):
```ts
const BEATS: Beat[] = [
  { f: 0, L: "palm" },
  { f: 31, sink: 9 },                                                     // crouch: anticipation of the startle
  { f: 36, sink: -3, lean: -9, shoulder: 9, R: "up", L: "up", look: 0.8 }, // startle
  { f: 66, lean: 10, hipX: 10, R: "point", L: "hip", look: 0.9 },         // units: deg, u (= head width / 100)
];
const { fo } = rigPose(f, outfit, BEATS, words /* [frame, len, stress] */, exprSeq, seed);
// stand() does NOT forward hipX/sink/shoulder/handR/handL yet: pass fo to person() (its FrontOpts) or bodyFront
// directly, and skip stand()'s own sway/talkBeat/pops for this person (the rig already does them)
```
Hand poses: `rest palm up point shrug chin hip`. Add new ones in `handPoint()` (body frame, side-aware).
Tune feel in `PART` (hz = speed, z = damping: lower z = more overshoot). Card stretch/roll pops are not needed with it.

---

## Acting Principles (from 2026-11-06 gap study, `references/reports/acting_gap.md`)

**Reference numbers (measured):**
- 2-3 body keys/second on acting lead
- Lean-ins ~28° in 4 frames
- ~28% overshoot, then hold
- Arm reach 1.5 W
- ~3.7 expression swaps/second on speaker
- Falls rotate to 85° over 12 f, then dust + flying hat
- **No body squash**

**Key curves (cast.ts) — NEVER use `smooth()`:**
- `hit(n, d=4, os=0.28, s=8)` — fast out, 28% overshoot, then hold
- `keys(f, [[f0,v0], [f1,v1], ...])` — chains hit() keys
- `pulse(n)` — one-shot accent that swings back

**stand() options:**
- `lean` — whole-body lean in degrees (upper body turns at hips, knees push other way)
- `armRaw: true` — armK already eased with hit(), may overshoot
- `talkBeat: <line>` — head nods on every word onset with dip before, head tilt changes every 3 words

**Swap pop:** 1.5% squash, 2% stretch, 3° roll pulse (no body squash in reference)

**Toon arms:**
- `point` = real reach (hand lands ~1.5 W from torso)
- New kinds: `reach`, `shrug`

**Body rules:**
- Act with whole body, not just face: shock throws torso back, sadness drops shoulders, anger leans in
- Every body action = 3 stages: anticipation (3-6 f opposite), action, follow-through/settle (overshoot then rest)
- Nobody is ever frozen (user rule 2026-11-10, overrides the old "Idles: none"): background figures breathe, sway and tip their heads (cast.ts stand(), automatic); they cheer, wave or hop only inside cue windows taken from words.json, time-offset so the crowd is never uniform.
- Acting layer in rail cast.ts (monalisa f852323): hit() has a 3 f, 7 % anticipation before every key; arms given armK default to armRaw (keep the overshoot); a ghost pass (world.ts runs stage() 2 f earlier) gives each person their angular speed, from which hats/hair/curl drag up to 6 deg behind (FrontOpts/SideOpts.drag) and the card stretches up to 3.5 %; talkers beat their held pose on every word, empty hands open a new gesture every 3 words; Opt.laugh = shoulders bounce every 5 f; expression "aha" = brows shot up. Bridge/palace have the toon side (drag, aha) but not the cast layer.
- One distinct silhouette per lead (hat, posture, colour) readable from wide
- Push expressions past natural — mild faces vanish at phone size
- **Acting line per shot (write it in the shot plan before animating, 2026-11-16):**
  ```
  SHOT 07 (2.1 s) "the whole court laughed"
    thought:      what the character knows or wants right now (one line)
    anticipation: eyes/brows move first, ~4 f before the head or body
    action:       the main move lands ON the stressed word (frame from words.json)
    hold:         ~10 f on the result so it reads, idle keeps running (never frozen)
  ```
  Every move starts with a look: eyes lead, then head, then body. No move without a thought behind it. Mouth/expression
  accents go on stressed words. This adds a "think first" beat; the never-frozen idle rule still wins.
- **Physics timing (falls, drops, throws):** free fall t = sqrt(2h/g). At 30 fps and real scale: 10 cm ≈ 4 f,
  30 cm ≈ 7-8 f, 1 m ≈ 14 f, 2 m ≈ 19 f. Ease-in (accelerate), contact on one exact frame, the hit SFX on that frame.
  Slower reads as floaty; only slow it on purpose (comic hang, slow-mo beat) and say so in the plan.

**Face v3 — the channel's face language (rail toon.ts, `FACE_V3 = true`; approved 2026-11-11 from monalisa):**
- Parametric `V3: Record<Expr, FaceV>` replaces the fixed eye/mouth kinds. Per eye: upper lid 0..1, lower lid / cheek line,
  pupil size, look; brows per side `[inner, outer]` (clamped -8..+12u, forehead band); mouth `{w, c curve, tilt, open,
  round, teeth 0/1 band/2 gritted, tongue, wave, lick}`; fx sweat / tears / ticks. Pairs index [back, front].
- Six house rules: (1) deadpan baseline; (2) the upper lid tilts with the brow; (3) brows travel far and may be uneven;
  (4) white eyes only at peaks, pupil size carries it; (5) mouths never symmetric except deadpan; (6) a real smile has
  a cheek line under the eye (FACS AU6).
- Talking keeps the expression: the mouth opens to max(open, 0.12 + 0.5·TALK) on its own curve, no swap to "o".
- 41 names: the 26 v2 names (scene files unchanged) + skeptic, determined, sheepish, awe, disgust, fake_smile, smug,
  bored, confused, fear, terror, cry, furious, joy, idea. Tune values in V3 only; `FACE_V3 = false` gives v2 back.
- Reference sheet + mixer (prints a FaceV line): https://claude.ai/artifact/8MwLeEkddyFV2vtckrzALa
- Bridge/palace still draw v2 (older face code; port by hand when a short uses them).
- **Expression morph (added 2026-11-11, user request: "flat face slowly smiles, no hard cut"):** `expr` also takes a mix
  `{ from, to, k }` (toon.ts `ExprIn`); every number slides (lids, cheek line, brows, pupils, gaze, mouth width / curve /
  tilt / opening, teeth band, tongue). Happy-arc eyes are a dial eye with the lower lid up, so a deadpan face smiles its
  eyes shut frame by frame. Parts that cannot slide (squeeze / spiral / cross eyes, white shock eyes, round O mouth,
  sweat / tears) switch at k = 0.5 under a blink. Drive it from cast.ts:
  `stand(..., { ...exprMorph(f, [[0, "neutral"], [at(3, "smiled"), "smile", 30]]), ... })` - each entry is
  `[frame, expr, dur = MORPH (10)]`, half-way 2 f before its frame; `blinks` comes back for the snapping parts.
  Use it for slow emotional turns (a dawning smile 25-40 f, sadness settling 20-30 f); keep quick reactions as swaps.
  Whole expressions draw pixel-identical to before (checked on all 41).
- **Growing body (added 2026-11-11):** `stand()` / `profile()` take `scale`; the card origin is at the soles, so scaling grows
  the body from the feet (the shoe stays on the ground, the blob shadow and frame-check column scale too). Drive it with
  cast.ts `sizeAt(f, [[frame, scale, dur = 20], ...])`: each key eases in (smootherstep), overshoots 6 % of the change and
  settles, e.g. `scale: sizeAt(f, [[0, 1], [at(5, "bigger"), 1.35, 30]])`. The ink outline thickens with the card. Checked in
  3D (2026-11-11): feet stay planted, the shadow grows with the body.
- **Pulling a locked door (added 2026-11-11, checked in 3D):** `bodySide` mode `"pull"` through `profile(..., { mode: "pull", ... })`:
  feet braced (front foot planted ahead, back foot behind), both hands fixed on the handle; `pose` 0 = at the handle, elbows
  bent, upper body 6 deg back; 1 = hips dropped, 20 deg back, arms straight. The lean stops where the arms run out of reach,
  so overshoot or a high knob never slides the hands off; the handle is never placed closer than the face plus a knob's
  depth, so the head never goes through the door. `reach` = grip 0 (hands hanging) to 1 (on the handle).
  - **Placing it:** `const sp = pullSpot(cam, knob, who, dx, dz)` with the knob's world point (its front face) and the way
    the character faces gives `sp.at` (the feet) and `sp.hand`; pass both: `profile(out, cam, t, who, sp.at, dx, dz,
    { mode: "pull", hand: sp.hand, ... })`. Cards turn to the camera, so the feet go on the card plane through the knob.
  - **Camera:** see the pull from the side, 30-60 deg off the door's normal (head-on hides the pull, edge-on hides the door);
    keep the lens still or slow (a swinging lens slides the hands off). Keep props out of the line from lens to knob
    (the first 3D test had a coat stand covering the hands).
  - **Knob height:** these short shoulders reach best at 0.9-1.0 m (`pullReach(o, seed).up`); a 1.1-1.25 m knob works but
    the lean stops earlier (less drama). The set knob needs some depth (about 5 cm) so the face clears the door.
  - **Driving it:** `tugAt(f, f0, tugs = 3, every = 12)` returns `{ pose, grip, rattle, strain }`: grip lands, each yank
    snaps back with `hit()` and sags to 0.4; `rattle` (damped, -1..1) shakes the knob or door; pass `strain` to `profile()`
    and the upper body trembles on the yanks. The breath also rocks the upper body (`shake`), not the card, so the hands
    stay put. Pair with `exprMorph(f, [[0, "neutral"], [f0 + 4, "determined", 6], [f0 + 12, "pained", 8]])`.
  - **Effort (added 2026-11-11, checked in 3D):** pass the whole result as `profile(..., { mode: "pull", tug, hand })`. It
    fills pose, grip, the strain tremble, and:
    - `squash`: a 3 f squash before each yank, a stretch on it, and a small recoil squash. The torso changes, the head
      rides on it, and the hands keep their grip.
    - `flush`: the whole face warms to red over the tugs and cools over 40 f. This is not blush spots; the no-blush rule
      stands. From 0.5 a sweat bead sits on the back of the head.
    - `sweat`: two drops fly off the back of the head after each yank.
  - **The door:** `pullFx(out, f, tug, knob, dx, dz, doorTop)` puts strain ticks over the knob for 8 f and dusty-tan dust
    sinking from the door top on each yank. Keep the head at least 0.35 m behind the knob so the ticks never cover the
    face.
  - **Sound:** audio `sfx_gen.door_yank(r, a)` goes on each `tug.yanks` frame (bolt clack, slab thump, knob rattle).
    `effort(r, dur, base, a)` is the strained "nnngh"; start it 2 f before the yank and keep one `base` pitch per
    character. Raise `a` on each yank (0.6 / 0.8 / 1.0).
  - **Red face without an outfit swap:** `FrontOpts.flush` and `SideOpts.flush` (0..1) also fit rage. Slide the number
    instead of hard-cutting to a red-skin outfit.

**Face v3.3 "emote" + head v3 — the default face (rail + diorama toon.ts, approved 2026-11-18 from the user's 20-face
reference; sandbox src/sandboxes/rigtest, compositions FaceFamily / MatchSheet):**
- Head v3: near-round and WIDE (`headBlob` a × 1.15, height 0.94 a), small asym/tilt/lumps, flat skin `#fbeadf`
  (`SKIN`) with a soft grey-pink rim shade (`SH_RIM`, `headPaint()` = blurred inner fill), plum ink outline.
- Face set high: with `emote: true` the face moves up 4u (eyes on the head's middle line, big chin below), eyes 16u
  apart, mouth at +18u. Eye = small dark oval under a thick lid line (4.8u) that runs outward with a hook; `white` ring
  eyes = white ovals, no pupil. Brows long, thin, softly arched, sitting high. Mouths are soft red `#d9675f`, tongue
  `#f39d92` (only while `EMOTE` is on, other faces keep the old colours).
- FaceV fields added: `emote` (use this style), `sit` (brow sits on the eye and cuts it, number or [back, front]),
  `arch`, `big`, `shine`; mouth `cat` (":3"), `square` (1 = box shout, 2 = "D" laugh); fx `blush` (3 pink hatch strokes
  under each eye, ONLY on the `blush` expression — the no-blush look rule stands elsewhere) and `flush` (red heat from
  the crown down; `rage`). Sweat drops stay (awkward, annoyed, alarmed, pout, thinking, vexed, tired, nervous_ring).
  No floating marks (?, !, anger cross, zzz): the user said "tidak perlu ada tanda".
- 33 emote names: neutral, deadpan, awkward, unamused, annoyed, smirk, worried, plotting, alarmed, puzzled, delighted,
  cringe, overwhelmed, gloom, thinking, unbothered, sleepy, cool, pout, yell, laugh_xd, smile_side, kiss, blush, vexed,
  tired, nervous_ring, smug_content, rage, shout_xd, content, unimpressed. Older v3 names (smile, shock, angry, ...) still
  draw the v3.1 face; prefer the emote names. Morphs between two emote faces slide as before.
- **Bald by default (user rule 2026-11-18):** an Outfit with no `hat` draws no hair. Presets (PARENT etc.) are bald.
  Add `hat: "hair"` (+ `hair` colour) or another hat only when the story needs it (a period look, telling two
  characters apart, a woman with a bun); hair always sits above the brows (clear-face rule).

---

## Character Specs (final look values)
- 3.5 head-heights tall, legs 1.4 HH
- Stick limbs ~0.055 of head width, ink-dot hands
- Bean head (h/w ~0.93, narrower chin, pointier crown)
- No blush or eye highlights. Faces at brightness ~0.93
- Walk bob 3-7%, lean 1-7°, planted feet (0.8 m stride)
- Blinks every 0.5-2.3 s, lasting 4 frames
- Tight contact shadow ~0.5 under feet + sun-direction tail by day
- Golden rim: inner only (head/torso), never offset outer copy
- Character ink: dark plum #241726 (#201628–#2f1d28 range), thicker on bottom/shadow side; default face = v3.3 emote (eyes 0.32 W apart, set high), head v3 wide; bald unless the story needs hair

---

## Palace Template Additions (templates/palace/)
- Hats: crown, diadem, blangkon, helm with 3-feather plume, caping, braid, bun
- Dress: beskap, jarik, keris
- Spear
- Arm poses: hug, point, chest
- Held props: letter, scroll, pouch, brick
- Expressions: sly, suspicious, sad, angry