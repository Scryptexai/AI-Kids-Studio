# Motion and camera: rules for every shot with characters or action

Read this before writing or changing any shot that has a character or an action in it, and check each rule before rendering.
The numbers come from the 20-short reference study (reports/motion.md) and from shorts we have finished (lessons.md).
Units: px = pixels at 720x1280 (x1.5 at 1080x1920), f = frames at 30 fps.

## 1. Framing comes first (9:16 is narrow)
- Every character in a shot is fully in frame: no side or top crops. Only the bottom may crop, in medium shots and closer.
- The subject of the beat sits in the middle third. No important person or object within 20 % of a side edge.
- Horizontal half-width per metre of distance is tan(fov/2) x 9/16 (fov 40: 0.205; fov 44: 0.227). Characters are about
  0.3 m half-wide (more with a reaching arm). Compute the camera distance from this; never guess.
- At most two people side by side in a medium shot. For three or more:
  - a centred wide;
  - a depth triangle (one in front, two behind closer to the middle);
  - or the lens visits each person in turn.
- Use `group(pts, dir, fov)` / `G(...)` (templates/palace/story.ts) for two-shots and groups.
- Check every camera ray for posts, curtains and walls. Sight-line culling only covers house() and prop().
- In desk or prop inserts, leave out any character who would show only half at the top edge.
- After every camera change, run `COMP=<id> node scripts/frame_check.mjs 6`. Fix every CUT and EDGE outside a deliberate pan.

## 2. Camera grammar
- **Glides, not snaps.** Ease with a symmetric smootherstep (`glide`), 18-40 f, peak at most 25 px/f (reference median 14-16).
  - Peak = 1.875 x distance / duration, so keep the duration at least 0.075 x the move in px.
  - Start a glide dur/2 before the word it serves.
- **Cut on big reframes.** Anything over half a frame width or 40 % zoom is a hard cut, not a glide. Close-ups inside a group
  are cuts too, so the lens never drags across other people.
- **No dead holds.** Every hold creeps in:
  - 0.15-0.35 %/f on a single subject;
  - at most 0.1 %/f on group shots (a dolly toward a far look point moves the camera metres and pushes the outer people out);
  - 0.6 %/f for ~35 f on punch words.
- **A pan between people** (one by one) is an 18-24 f glide that lands on each person 0-3 f before their word. Each landing
  frames that person alone and centred.
- **Rolls:** 4-8° (0.06-0.14 rad) glided over at least 18 f, on emphasis beats only. Calm keys stay within ±0.035 rad.
- **Impacts:** 7-frame kicks whose offset flips sign every frame (~3 px x strength, roll ±0.23° per unit), starting on the
  impact frame. The push stops at the hit.
- **No hand-held float, ever.**
- **Whips** are rare: at most one per short, 7-25 f, and only with directional motion blur.
- **About 6 camera moves per 10 s.** Crowds stand still while the camera supplies the motion.
- **Light on billboards:** pick front or side view per key, not per frame (`keyEnd`), so cards don't pop mid-glide.

## 3. Character acting
- **On ones:** a moving character changes every frame. No pose holds of 2-3 f, no line boil, no squash/stretch, no smears.
- **Timing:** every expression or action change lands 0-3 f before the word (`LEAD = 2 / FPS`). Swaps are instant (1 f),
  hidden under a blink. A slow change of feeling (a dawning smile, sadness settling) morphs instead: cast.ts
  `exprMorph()` slides the face over 10-40 f, half-way 2 f before the word (bible/characters.md, "Expression morph").
  Body changes are curves too: `sizeAt()` grows or shrinks a body from the feet, `tugAt()` drives a pull on a locked
  door (bible/characters.md, "Growing body", "Pulling a locked door").
- **Blinks:** 4 frames (half, shut, shut, half), every 0.5-2.3 s, plus one across every expression swap. Freeze the lids
  (no blink) only on a deliberate stare.
- **Expressions:** push them further than feels natural (brows +6 to +10 for stern, suspicious and angry). Mild faces vanish
  at phone size.
- **Walks:**
  - 9-12 f per step;
  - body bob 3-7 % of height, lowest at contact;
  - lean 1° at passing and 5-7° at contact;
  - the stance foot planted (stride matched to speed: no skating).
- **Idles:** Nobody is ever frozen (user rule 2026-11-10, overrides the old "Idles: none"): leads breathe, sway, drift the head and dart the eyes; extras breathe (0.8 %), sway and tip the head to a new angle every ~2.5 s; profiles breathe; walkers squash on each footfall. Big crowd moves (cheer, wave, hop) still happen only inside cue windows taken from words.json.
- **Actions** (hits, strikes, hand-overs):
  - a 3-4 f wind-up, held ~6-7 f at the top;
  - a 1-frame strike on the word;
  - a 4-5 f burst or ring;
  - a camera kick on the same frame.
- **Billboards always face the lens:**
  - Someone acting on a wall, a door or another person in profile is drawn with `bodySide`, with the lens beside them.
  - Riders or walkers going into depth need a back-view card.
- **Props that matter** (letters, maps, keys, the hole in the wall) sit in the middle of the frame. Glow cards over them are
  at most 0.5 m with tint 0.8 or less.

## 4. Before rendering a draft, check every shot
1. Who is the subject of each beat? Is the subject centred, fully in frame, and not covered?
2. Does each camera move land 0-3 f before its word, and is it a glide (18-40 f) or a cut?
3. Does every hold creep in at a rate that keeps everyone in frame to the shot's last frame?
4. Does every reaction, swap and action land 0-3 f before its word?
5. Are blinks on, extras still outside their cues, and walks planted?
6. Did `frame_check.mjs` come back clean, apart from deliberate pans?
7. **No clipping, no z-fighting** (the user's standing rule): no character, prop, wall or floor passes through another;
   feet rest exactly ON the surface under them; no two surfaces overlap on the same plane (offset overlapping faces by
   0.001-0.01 m, never stack duplicate geometry). Run `COMP=<id> node scripts/frame_check.mjs 8` and fix every
   COLLIDE / FLOOR / ZFIGHT line it prints before any draft or final.
8. Sound-off test: with the audio muted, does every phrase read from faces and actions alone, and does no picture give
   away a beat before the voice says it? (`scripts/beat_sheet.py`, then a fresh Opus pass; SKILL.md step 9.)

## 5. Formula B camera mode (the weird choice that was right; see formula-weird-choice.md)
These rules are measured from the 22M-view railroad short: 27 setups in 64 s. Use them only for a Formula B short. Everything
in §1-§4 still holds unless a line below changes it.
- **Pace:** about one shot per narration sentence or clause, with an average of ~2.3 s (about 70 f). The cut lands 0-3 f
  before the clause's first word.
- **Transitions** (the user watched the reference and saw this pattern):
  - **Same place:** hard cut.
  - **New place** (a different location, or the rival's world): a **dip to black of 6-10 f out plus 6-10 f in**, using
    `XFADE` with black as the middle colour.
  - **Impact or punchline:** a smash cut plus a kick (§2 Impacts).
  - **The last shot:** cut to the end on the impact frame, with no fade out.
- **Shot vocabulary.** Rotate these:
  1. Track-level low angle: the lens sits 0.1-0.3 m above the ground or rail and glides along the object. Use it for every
     proof or measurement beat.
  2. Linear dolly along a long line (rail, bridge, road) to sell depth.
  3. One crane plunge down the danger (canyon, drop) when the stakes are set.
  4. A fast fly-over to enter the rival's world.
  5. A slow push-in on a face for anger or smugness (the §2 creep rates).
  6. A static two-shot for the confrontation: the only fully still shot.
  7. Macro inserts with heavy `DOF` blur for the proof objects (coin, paper, gauge).
  8. A low tilt-up from below for the disaster.
- **Allowed here only:**
  - **Snap zooms:** up to 3 per short, on punchlines and the climax. They change the FOV by ≥40 % in 5-7 f with ease-out.
    This is an exception to "glides, not snaps".
  - **Continuous shake:** only on a "discomfort" beat (a rattling ride), ≤1 s, flip-sign at low amplitude (~1.5 px).
    This is the one exception to "no hand-held float".
- **Intensity rises towards the end:** slow dollies → dutch roll plus fast tracking → snap zoom → kick plus smash cut.
- **Colour follows the temperature of the story:** a normal day palette, then a magenta or purple heat glow on the stressed
  object near the climax, then high-contrast fire orange at the impact. Key it per shot in the grade.
- **World text is a 3D prop in the scene,** never an overlay: a newspaper headline, a calendar flip, a banner. The no-captions
  rule stays (the reference's kinetic subtitles are NOT copied).
- **Acting:** the rest of §3 stays. The authority's rage gag (purple face, steam card) is allowed as one deliberate
  expression swap plus an effect card. It is not squash/stretch.
