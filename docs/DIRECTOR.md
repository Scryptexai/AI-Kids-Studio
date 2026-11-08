# Director engine — story in, animation out

The missing layer between "we have characters and a world" and "here is a playable episode".
A writer supplies **intent**; the engine decides **blocking, poses, walk paths and camera** and
emits scene JSON the renderers already accept.

```bash
npm run studio:direct -- --episode ep-002            # story beats → scene JSON
npm run studio:direct -- --episode ep-002 --measure  # use real audio durations
npm run studio:direct -- --episode ep-002 --dry-run  # plan only, write nothing
npm run render:preview -- --episode ep-002 --scene sc-001-b01-play --at 3
npm run episode:render -- --episode ep-002 --allow-smoke --fast-bg
```

No audio is required to direct. Lines without a recording get an estimated duration so a story
can be blocked and previewed before any voice exists — the container is ready before the
performance.

---

## 1. The split of responsibilities

| Layer | File | Answers |
|---|---|---|
| World | `library/worlds/*.world.json` | what exists: locations, prop layout, marks, palettes, camera presets |
| Character | `library/characters/*.character.json` | who they are: palette, proportions, rig poses, expressions |
| **Script** | `projects/<ep>/script.json` | **what happens**: beats, who acts, what they say |
| **Director** | `apps/director/*` | **how it is staged**: marks, poses, shots, camera moves |
| Scene | `projects/<ep>/scenes/*.json` | the render contract — no intent left, only numbers |

The writer never types a coordinate. If a script contains `x: 0.38`, that is a bug: it belongs
to the director's output, not its input.

## 2. Beats and intents

A beat is one story moment:

```json
{ "id": "b02-miss", "location": "playground", "action": "discover",
  "emotion": "surprised", "actor": "pip", "target": "bobby",
  "prop": "toy-ball", "line": "Bobby, bolanya hilang!" }
```

`action` is a closed vocabulary (`apps/director/intents.mjs`):

| Action | Means | Pose | Shot |
|---|---|---|---|
| `entrance` | someone arrives and joins | walk → idle | wide |
| `discover` | finds something | surprise | medium |
| `explain` | speaks to the group | talk | medium |
| `ask` | turns to a partner with a question | talk | medium |
| `celebrate` | joy: jump, arms up | jump | wide |
| `explore` | moves through the world | walk | wide |
| `react` | one-beat reaction, no line | surprise | close-up |
| `console` | comforts someone | wave | medium |
| `depart` | leaves the frame | walk | wide |
| `idle` | holds, lets the audience settle | idle | wide |

Emotion (`neutral/happy/excited/sad/surprised/curious/laughing`) drives the **face**; the action
drives the **body**. That separation is why a surprised `discover` and a happy `discover` look
different while sharing blocking.

## 3. What the director solves

**Blocking** (`stage.mjs`)
* Actors are placed on lanes (`far/mid/near`) that set both ground line and z-order.
* Secondary actors flank the actor on alternating sides — queuing them to the right used to push
  the last one off-frame, and clamping then collapsed two characters onto the same mark.
* If the actor is pinned to a frame edge, everyone stacks on the open side; colliding marks are
  impossible by construction.
* Facing is relational: toward the partner, toward the prop, toward camera, or away.

**Poses** (`posesFor`)
* The actor performs the action's pose; everyone else reacts using their emotion pose, so idle
  characters never look frozen.
* Every pose/expression is checked against the character's own rig. `coco` has no `jump` in her
  rig, so she cannot be cast into a `celebrate` beat — the engine refuses rather than silently
  substituting.

**Camera** (`camera.mjs`)
* Shot comes from the intent, overridden by continuity: the first beat in a new location gets an
  `establishing` shot.
* Keyframes are solved, not authored: establish → settle → slow drift → hold. Times are monotonic
  and always start at 0.
* If two actors are too far apart for the requested shot, the camera widens automatically
  (`widenedForSpread`) instead of cropping someone out.
* Focus sits between the actor and their partner, not on the actor alone.

**Timing**
* `durationSec = 0.6s head pad + max(line, 1.2s) + 0.5s tail pad`.
* Line length is measured audio when available (`--measure`), otherwise estimated at ~2.4
  words/sec. Estimation drifts: an eSpeak line came out 34% longer than the estimate, which made
  scenes shorter than their own dialogue. `--measure` exists so retiming is a property of the
  story, not a post-render fix.

## 4. One beat = one scene (and why)

The rig can play exactly one animation per character per scene. A scene is therefore a single
cleared performance: walk in or settle, perform, hold. Multi-beat scenes need per-character
animation tracks, which the renderer does not have yet — that is a renderer feature, tracked in
`docs/RENDERER.md`. Pretending otherwise would produce scenes where the pose changes depending
on which beat you look at.

## 5. The world is now a stage, not just a list

`library/worlds/bobby-forest.world.json` gained, for every location:

* `props[]` — permanently staged objects with `x`, optional `y`, `scale`, and a `hero` flag
  marking the object stories usually centre on.
* `marks` — default blocking positions (`leadX`, `partnerX`, entry points).

And four director-facing camera presets: `wide`, `medium`, `close-up`, `establishing`.
All five locations now have a background plate, so no scene renders against flat sky.

## 6. Verified end to end

`ep-002` (a complete 8-beat story, "Bobby dan Bola yang Hilang"):

```
8 beats → 8 scenes, 55.6s
shots:   wide, medium, medium, wide, wide, establishing, medium, wide
render:  8 scenes concatenated → renders/ep-002/ep-002-2026-11-08T08-38-00.mp4
         12.2 MB, h264 1280x720 24fps + aac, 55.63s
```

Frames inspected at 4s, 20s, 33s and 50s: characters spread across the frame, nobody clipped,
feet above the subtitle band, no blank canvas at the edges, different framing per intent.

### Composition bugs found by looking at frames (all fixed)

| Symptom | Cause | Fix |
|---|---|---|
| white strip at frame edge, character sliced | camera translate unclamped at high zoom with off-centre focus | clamp translate so the scaled world always covers the viewport |
| third character pushed off-frame | reactors queued right of the actor | alternate sides, clamp to safe margins |
| two characters exactly overlapping | both reactors clamped to the edge | advance the ring per actor when pinned |
| subtitle covering the characters' feet | ground line at 0.845 vs band at 0.975 | lanes raised to 0.78/0.82/0.86, band tightened |
| scene shorter than its own line | text estimate vs real audio | `--measure` adopts measured durations |

## 7. Motion and prop interaction (implemented)

A scene used to hold one static position per character, so `walk` meant walking in place.
Scenes now carry a **motion track** — a timed path sampled every frame:

```json
"motion": {
  "path": [{ "t": 0, "x": 0.18, "y": 0.82 }, { "t": 1.2, "x": 0.56, "y": 0.82 }, { "t": 7.4, "x": 0.56, "y": 0.82 }],
  "ease": "ease-in-out"
}
```

* `apps/renderer/motion.mjs` samples it; **both backends import the same sampler**, so SVG and
  Remotion move identically.
* While travelling, the rig blends in the walk cycle (legs and arms swing) even if the beat's
  pose is something else, and facing follows the direction of travel.
* `y` is optional: a level walk only needs `x`.

**Prop interaction.** A beat may attach a prop to a character for a window of the scene:

```json
"interactions": [{ "propId": "toy-ball", "characterId": "bobby",
                   "fromSec": 1.0, "toSec": 6.9, "attach": "hands" }]
```

The prop is then drawn at the character's hands instead of its staged ground position, with a
small lift at pickup/release. In the script, a beat opts in with `interact: "hold"`
(picked up and carried), `"touch"` (default, interacts but stays put) or `"none"`.

Verified on ep-002: Coco enters from x = −154 px and walks to 736 px over 1.4 s in
`sc-004-b04-coco`; Bobby travels 410 → 717 px in `sc-001-b01-play` while carrying the ball.

## 8. Limits (do not claim otherwise)

* **No inverse kinematics.** Arms swing on a fixed rotation; a character does not reach for a
  specific point on an object. Prop attachment is "at the hands", not "gripping the handle".
* **No object physics.** A carried prop follows the hand; nothing rolls, bounces or is thrown.
* **Travel is horizontal.** `y` exists in the schema and the sampler, but the director only
  emits level paths — walking "into depth" is not solved yet.
* **No lip sync.** `talk` opens the mouth on a sine wave, not on phonemes.
* **One line per beat.** Real conversations with overlap need multiple dialogue entries and
  audio mixing per line, which the scene schema allows but the director does not yet emit.
* **No transitions rendered.** The director records `transition: cuts` in scene metadata, but the
  renderer concatenates hard cuts. Crossfades are planned, not implemented.
* **Intent table is small.** Ten actions cover a simple 4–6 story; more verbs are additive, not
  architectural.
