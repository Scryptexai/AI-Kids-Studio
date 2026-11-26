# Lessons from finished shorts

One line per lesson: what broke or worked, and the value that fixed it. Newest short at the bottom. These win over older values in SKILL.md when they disagree.

## Tiga Jenderal yang Menyadap Rajanya (2026-11-04, palace intrigue, Indonesian voice, 81 s)

### Setup
- Pin three@0.170.0, postprocessing@6.36.6 (exact) and @react-three/postprocessing@3.0.4. Check that node_modules/@react-three/postprocessing/node_modules/postprocessing does NOT exist: a second copy (3.0.4 needs ^6.36.6, so 6.36.4 at the top made npm nest 6.39.6) makes the composer silently drop every custom Effect/Pass (ink, lens, bloom, tone, grade) because instanceof fails. Test: a shader that outputs pure red must turn the still red.
- Keep the project on a short path (e.g. `E:\animated-shorts`): past Windows' 260-character limit, chrome-headless-shell fails to launch (ENOENT).
- Kenney.nl downloads work through the page's signed link (`/download-link/<hex>` with the page cookie; plain URLs 404/403). All 29 3D environment kits are already in E:ssets-library (see SKILL.md, Local asset library). Fantasy Town and Castle GLBs use an external `Textures/colormap.png`, so keep each kit's GLBs beside its own Textures folder.
- For words.json, run faster-whisper "small" with the language set, `vad_filter=True` and no `initial_prompt` (the prompt made it skip the first 27 s), then align to the script with difflib.
- Run the audio scripts with plain `python`, not `python -I`, or they can't import dsp.py.

### Final render
- Use `--scale=1.3333333333333333` for 1440x2560: `1.3333` gives a 2559.94 px height and stitching fails.
- The first frame each render tab draws comes out off (frames 0..concurrency-1). Re-render frames 0-15 with `--concurrency=1`, use frame 1 as frame 0, and splice with ffmpeg.
- Ground layers that overlap need at least a 2 cm height step and `cam.near` of 0.15 or more, or they z-fight (the plaza cobbles flickered to grass). Keep contact blobs above the highest ground layer.

### Framing (9:16)
- The frame's horizontal half-width is tan(fov/2) x 9/16 per metre of distance. Compute a two-shot's distance from how far apart the people stand instead of guessing (the `group()` helper in story.ts).
- Put at most two people side by side in a medium shot. For three, use a wide with all of them centred, stagger them in depth, or let the lens visit each one in turn.
- A dolly push toward a far look point moves the camera metres. On group shots keep the rate at 0.001/f or less, or the outer people get cut by the end of the shot.
- A close-up on one person in a tight group crops the neighbours at the frame edge. Cut to the group shot and rack focus instead.
- In desk inserts, hide any character whose body shows only half at the top of frame.
- Run `scripts/frame_check.mjs` after every camera change: it projects each character card and lists CUT/EDGE per shot. The user wants every character fully in frame and subjects centred.
- Sight-line culling only covers house() and prop(). Check posts, curtains and walls along every camera ray yourself (a kitchen curtain and a post blocked two shots).
- Billboards always face the lens. For "ear on the wall", draw profiles (bodySide) with the lens along the wall, so the wall sits on the side they face.

### Visual
- Flat cards: `rot` 0 puts the drawing's top toward -z. A lens looking +z needs PI and one looking -x needs PI/2 (the maps first came out upside down).
- Night needs world lit around [0.27, 0.33, 0.62] and a fog/sky near #141c3c. Warm the character tint when a lamp or candle is near the focus (a first pass at [0.5, 0.6, 0.95] read as day).
- Golden light under a deep roof leaves interiors purple-grey. Put the low sun behind the camera (az ~160, el ~11) so it rakes in under the eave.
- For a Javanese setting use beskap, batik jarik (knee length for soldiers) and a keris in the sash. Long "dress" robes read as shapeless blobs.
- A helmet plume drawn as one ellipse reads as an egg or a spoon: use three small feathers.
- Riders moving into depth need a back-view card. Side-view horses galloping away look wrong.
- Glow cards over small details (the hole in the wall) hide them: keep them at 0.5 m or less with tint 0.8 or less.
- Push expressions further than feels natural (brows +6 to +10 for stern, suspicious and angry). Mild faces vanish at 540 px.

### Process
- Before writing, ask the user: narration language, real story or fiction, and who records the voice.
- (The Thief Who Cried Wolf, 2026-11-04) Do not stop at framing. A draft of one creeping hold per shot with frozen
  characters reads "flat":
  - Audit every shot against motion-camera.md sections 2 and 3 before the first draft: about 6 glides or cuts per 10 s,
    rolls on punch words, wind-up / hold / strike actions, startles, and blinks on expression swaps.
  - Check the camera speed with `frame_check.mjs` (CAMSPD).
- Anchor shots to words (`W("word", k)` reading words.json, exact match: a prefix match hit "officers" for "off") so a new
  recording re-times the film. Make a provisional words.json at ~3.7 words/s until the voice exists.
- Review a contact sheet of one still per shot before any full render. Then send a 540x960 draft with audio for notes before rendering 2K.
- (The Thief Who Cried Wolf, 2026-11-05) One location = one take: a camera `rail` of framings pinned to word frames, passed
  through with non-uniform Catmull-Rom (never stops); after every framing add a hold key ~12-17 f later, and `ease: true`
  on both ends of a big move so the speed stays inside it. Measure all frames with an esbuild'd camAt (no render needed).
- Staging rule for long takes: arrange marks so consecutive framings look the same way (a 180° turn between phrases = a
  whip of 500+ px/f). If the next beat is behind the camera, change the beat (a wall clock above the switch instead of
  turning back to the diamond).
- Never aim a camera ray at a facade (look in front of it): the sight-line culler removes any house a ray ends inside.
- An effect card behind a billboard is hidden by it: put held fx (a plum for scale) nearer the lens than the person.
- (Tiga Jenderal, 2026-11-05) The first 2K final had NO ink, lens blur or grade (plain `npx remotion render` path) while the stills were fine, and nothing errored. Fix: the Pre-render QA gate (`fx_gate.mjs`), then render only through `render_final.mjs` (Chrome + ANGLE, `[FX]` logs, final frame vs ON/OFF stills). Use scale 4/3, not 1.3333: renderMedia rejects a 2559.94 px height.
- (Thief, 2026-11-05) A flashback in the same night grade does not read as a flashback: give it warm amber + a dark edge
  (colour script). Never show a missing object before the voice says so: hide it with angle, darkness or a strong backlight
  core over its place (silhouette), and drop the light on the word itself; check every frame up to the word.
- (Thief, 2026-11-05) A lens inside any box (a city block beside the museum) is invisible in colour but fills the ink
  pass (DoubleSide normals): no outlines until the lens leaves it. Keep every camera position outside all buildings.
- (Thief, 2026-11-05) A huge additive glow card (dome glow, 12 m) strobes when the lens flies past it: fade such cards by
  lens distance. Ease post effects out over 15-20 f, never 4 f.

## Jebakan Kardus Durian (2026-11-05, framed-for-corruption comedy, Indonesian voice, 70 s, 14 sets)
- Real reads run faster than the provisional pace (2.4 w/s guessed, 2.57 w/s recorded): rail keys bunched up, one pair
  went out of order (977 px/f) and inserts got 10-frame whips. After every new words.json run `node scripts/cam_speed.mjs
  src/videos/<name>/story.ts 30` (camera px/f per shot, no render) and space keys by word, not by fixed offsets.
- When the voice leaves no time to pull back from an insert to a face (16 f), keep the insert and put the reaction in it
  (his glasses fall into the ruler close-up) instead of a whip.
- toon.ts "sit" mode drew no held props (the calculator, the phone and the receipt silently vanished). Fixed: a seated
  right arm uses the prop chain. A prop held at the face (phone, receipt) must be drawn after the head, at the cheek, or
  the head/hijab covers it.
- A lens closer than ~0.5 m to a character billboard fills the frame with the card (a black frame in the bank). Keep
  every camera at least 1 m from any character mark, including silhouettes.
- An fx card standing inside world geometry is clipped (the ruler card's bottom, where the 2 cm mark was, sat inside the
  road's gravel box). Put insert cards outside every box, or lift them.
- frame_check.mjs reports seated characters as CUT (it assumes a 1.85 m standing card); check seated shots by eye.
- The Opus sound-off pass found what my own sheet review missed: the money and the band were hidden at the three key
  beats (hook, pointing, "masih berpita"). Two rounds took it from 6 to 6.5 and the fixes after both mattered. Run it on
  every draft, and pre-tell it the deliberate choices (silhouettes, gags) so it flags real problems only.
- Objects that appear mid-shot must enter (drop, slide), never pop in: short_qa flagged the new box appearing on a frame.
- Thin set dressing between lens and subject (bank counter posts, a partition bar) cuts through the middle of every frame
  of a long take: leave it out of sets that the lens looks across.
- Indonesian setting: KPK-style orange detainee vest, blue hijab + white gloves, safari suit + gold watch, batik shirt,
  rantang/lunch box with rice and tempe, a durian box, Rp100.000 red bundles with a stamped paper band all read at phone size.
- scripts/render_draft.mjs (Chrome + ANGLE, scale 0.5, mux) renders a 70 s draft in ~4 min with every effect active.

## The Thief Who Died on Time (2026-11-06, English, the user's voice, 85 s)
- USER RULE for every next short: each phrase's visual must match the line AT that moment, so viewers understand the
  story from the picture alone. Camera moves are as fast as possible but smooth. Plan the shot list per phrase (subject
  + camera key pinned to the word), not per beat. Check the beat sheet before every draft.
- Sound-off review findings (draft 3 7/10, after 6/10):
  - A hanging character covers the very thing she hangs from. Swing her as a pendulum about her hands (Place.roll,
    soles = hands - R(roll)*(0,H)), timed so she is out to the side on the key words; the minute hand then reads.
  - "nine p.m." needs a 9:00 on screen at that word: a big held prop (pocket watch, ~11 cm, at ~1.7 m) reads at phone size.
  - A newspaper held at face height hides the reader. Lower it (dy -0.2) on his line. Show a neutral front page first
    and flip it (x-scale |cos|, 8 f) to the obituary / correction ON the word: that avoids spoiling the text.
  - A procession in 9:16: shoot it 3/4 from ahead and low. The marchers in front, the hearse behind with its cargo in
    the side window, the lead car moved far ahead out of frame. A side-on view makes everything tiny.
  - "it arrived safely": open the next location's shot on that phrase (the filled grave above ground), not the street.
  - Hold a gag prop (the mirror) through the end of its line (WE(word) + 4), then walk.
- A tilt from a near subject to a far one: aim the start key's look point far behind the subject on the same line of
  sight. Linear look interpolation from a near point to a far one front-loads the rotation (132 -> 48 px/f).
- Do not end a code line with a // comment and then append more code on that line. A comment swallowed the second
  police car's position, and the car stayed at the origin (inside the chapel set). Re-check stills after every patch.
- A held prop drawn near the chin can hide behind the head: give it its own hand position (out beside the chest).
- short_qa.py wants {"shots": [...], "xfade", "flash", "planned"}. dump_shots.mjs writes a bare list, so build the meta
  from story.ts exports (out/diedontime/_qa_meta.mjs).
- The world ink's "card in front" test (ink.ts: zm < zc*0.985 - 0.03) needs a gap of ~1.5 % of the depth plus 3 cm. A card
  only 9 cm in front of a thin dark part (the clock hand at 6 m) still got the part's ink line drawn over its face. Keep
  hanging/leaning cards >= 0.3 m in front of what they touch.
- Hide what the voice has not named yet with a cover plate toggled per shot (the tunnel's cut face is covered with earth
  until MIDNIGHT). Never pop a prop in mid-shot.
- Final Opus review: v1 8/10. Its fixes (above) went into v2. SendUserFile caps phone delivery at 30 MB: also export a
  720p preview (~2.2 Mb/s, 23 MB for 85 s).

## Stopped by Thin Air (2026-11-06, Westinghouse air brake, formula B rail short, English, the user's voice, 65 s)
- The reference short (formula-weird-choice.md) is about rail expansion gaps: take a different true rail story
  (here the 1868 air brake) so only the trope is shared. Ask the topic as an AskUserQuestion option list.
- Trains built from primitives (rolling.ts: loco, tender, boxcar, coach as groups with spinning spoked wheels, side rods,
  sliding brake shoes, parting hoses) beat the Kenney train kit, which is modern and stubby. Ride-along cameras use a
  `ride()` wrapper (keys in the train's frame); `handoff()` blends a world camera into a riding one when the cab draws level.
- A location whose beats are 60-80 m apart cannot be one smooth take: split it into hard cuts inside the same set (the
  wagon / the run / the bosses) instead of 4 m/f whips.
- The Opus sound-off beat sheet takes each phrase at 60 %: actions pinned to the phrase's last word (blow on "air", clamp
  on "once") land after that frame. Pin the visual to an earlier word of the phrase.
- A camera 5 m beside a running man, looking along the train, puts him at the frame edge: put the lens on the man's
  line (z ~0.3), then frame forward.
- Parented hose halves: rotation.z sign matters. Positive on the -x half and negative on the +x half droops them; the
  wrong sign swung them up into an inverted V.
- Heightfield hills with a tunnel: drop the cells over the bore between the portal fronts and roof the slot with a
  strip, or the slope shows green inside the arch. Add a dark floor plane inside the bore.
- USER RULES (2026-11-06): cross dissolves between sets, never black (XFADE 12 f; layersAt draws both shots); the look
  must not be "cheap" and the acting must not be "stiff". See memory dissolves-rich-look-lively-acting.
  - Look pass that helped (art review 4 -> 5/10): painted meadow (muted olive, 22 m tiles; 6 m tiles show a checker
    from a crane), boxcar/coach/boiler textures with frames, lettering, rivets and wear; SSAO computed inside the ink pass
    from its own depth + normals (b channel of the mask, 5x5 blur, x0.75; it rides on the ink toggle); soft shadows
    (`shadows="soft"`, radius 4); interiors' shade lifted toward warm grey (no purple slabs); additive window light pools
    and shafts; a 0.32 vignette; props on every set; day saturation 0.96; far hill billboards in haze.
  - Acting pass: in stand(), leads get breath (y-scale +-1.4 % about the soles via Place.sy), sway (roll), a lean
    stance (tilt +-5), head drift, eye darts; every swap gets 3 f squash then a 9 f stretch overshoot; lip flaps from
    words.json (talkAt -> toon `talk`); two-arm poses hips / fold / up / fist and `armK` easing from hanging.
- Bloom gate: daylight shorts have no emissive above 1.0, so the gate failed on bloom. An "add" fx card with tint > 1
  now scales the add colour (HDR lantern cores, sparks); gate on a sparks frame.
- Windows SAPI TTS (rate 3, ~3.2 w/s) plus words_from_voice.py gives a guide voice and real timings for drafts. The
  user's read was 65 s, faster than TTS: re-check camera speeds per shot after the real words.json lands.

## Look/acting gap study and upgrade (2026-11-06, 5 reference shorts at 1080p vs Stopped by Thin Air + Died on Time)
- Global stats (luma, saturation, contrast, detail) already matched the reference. "Cheap" and "stiff" were design gaps,
  not colour gaps: subject darker than its surroundings (0.8x vs ~2x), frame edges as bright as the centre (1.10 vs 0.66),
  5-7 props per interior vs 12-15, 0-1 warm practicals vs 2-6, brown shadows vs plum. Reports: reports/look_gap.md, acting_gap.md.
- Acting gap: the reference uses 2-3 big body keys per second that overshoot (~28 %) and then hold; ours were slow sine
  loops. Use hit()/keys() from templates/rail/cast.ts for every pose change.
- A lean of 22-26° in a close-up pushed the head out of frame. Keep 12-14° in CUs, or frame the shot for the lean.
- A window/backdrop plate on MeshBasicMaterial ignores the light pool: dim its colour (~0.6), or it outshines the subject.
- Test look/acting changes on ONE 10 s range (render_draft.mjs --range) with a before/after hstack, checking only 2-3
  stills by eye. The office test cost two still sheets plus one frame, not a full draft.

## Cut the Rope (Otis 1854 safety elevator, 2026-11-10; English, user's voice 66.8 s, 15 shots, 2 review rounds)
- GPU memory: a big world (15 sets in one scene) crashed the draft with D3D 0x8007000e at f1572 on default concurrency.
  render_draft.mjs and render_final.mjs now take `--concurrency n`; use 3 for 540x960 drafts, 2 for the 2K final.
  Never run frame_check or stills in parallel with a render (wasm "unreachable" crash).
- frame_check.mjs prints FRAMECHK / ZFIGHT on stderr: redirect `2> fc.txt`. A ytop below -1 NDC is an off-screen
  figure (false CUT). addSolid() collision slabs report "plate-top" z-fights but are never drawn: ignore those.
- "X is slower than Y" needs X and Y in ONE frame at the comparison word. A side view across a 7 m store made the boy
  tiny and cut the lift lady; a front camera on the lift (fov 58-60) with the stairs behind it, and the runner entering
  on the word "stairs", read at once.
- Background people standing between the lens and the action hide it. Bring a crowd in on the word that names it
  ("People"), walking in from off-screen (profile march, ease-out 24 f, staggered 5 f): never pop them in mid-frame.
- Queue faces: compute each head's screen angle from the camera (python, 10 lines) and keep >= 7 degrees between
  neighbours; dropping one hidden extra beat any amount of x-jitter by hand.
- Props held by the wrong person: check which stand() call gets `prop`; the hammer was on a worker, not Otis.
- A whip/zoom-blur bell over the subject's word blurs the subject: end the whip 2-4 f before the word.
- Raised axe: swing the prop out to the side (145 deg) or the head card hides the blade.
- fx_gate bloom = 0 % on daylight frames again: gate with `--frames` on spark frames (bite / clamp), then
  `render_final --check <that frame>`.

## The Plumber Held the Door (Mona Lisa 1911, 2026-11-10; English, user's ElevenLabs voice 68 s, 19 shots, 2 review rounds)
- A short not in Root.tsx (the user kept uncommitted work there): every script takes BRIDGE_ENTRY=src/sandboxes/<name>/index.tsx.
- fx coordinates (pools, focus, marks) must be world points from p(), never set-local numbers: sets sit 700 m apart.
- The toon shader's two tones read the sun shadow map directly: sun.intensity = 0 does NOT remove shadows. A thin caster
  above a skylight drew long diagonal bands on every day wall. Fix per set: an empty shadow depth range (near 1, far 1.001)
  rather than toggling castShadow (no shader recompile).
- A lens inside or beside a queue shows giant cut heads. Use a long lens (fov 28-36) from the side or back, keep the camera
  on ONE side of the line for the whole take (a swing across it flies through heads), and drop the members nearest the lens.
- A glide from a character to a wall detail sweeps the held prop (here the painting) full-frame past the lens: hard-cut instead.
- Hide a spoiler (the bare wall before "Four pegs") with the lens angle: put the camera on the far side of the
  character so the spoiler sits outside the horizontal half-fov (vertical fov x 0.5625 at 9:16).
- fx_gate zoom FAILS at 0 % if no set defines a ZOOM bell: give the short at least one whip (bell 0.05-0.06 over 12 f)
  and gate on a frame inside it.
- Audio kit: pad(trem=) takes a function of t, not a float; scripts run with `python -I` need sys.path.insert(0, HERE).
  A -1.0 limiter left -0.8 dBTP: ceiling -1.4.
- Subagents: an animation-reviewer or general-purpose agent with model "sonnet" still sent "auto" and failed (404).
  model "opus" works: run review rounds as general-purpose + opus with all inputs listed in the prompt.
- CRLF source files: Python str.replace on "\n" patterns silently misses; read/write with newline="" and match the file's EOL.
- Profile faces (user rule): a classic cheated profile. Both eyes level, grouped around hx + 17u (±11u); the nose between them,
  9u down; the mouth under the nose at +21u. The old one-eye face put the nose on the outline (44-47.5u of a 50u head).
  Now in templates rail/bridge/palace (faceSide).
- [character] Hats, hair and accessories never reach below `edge = hc - FACE_TOP*u` (33u above the eye line); brows fixed at BROW_Y = 18u for every hat; brims short and tipped up (front = upper half-ellipse); no bangs; a curl springs up off the crown. User rule (2026-11-10): the full face stays visible from any angle. In toon.ts of all three templates.
- [acting] User rule (2026-11-10): nobody is ever frozen; squash/stretch, anticipation and overshoot on every move; hands gesture while talking; hat/hair/clothes follow with a delay. Built as a generic layer in cast.ts (hit() anticipation, extras idle, walk squash, ghost-pass drag + stretch, talk gestures, laugh bounce). Check it on a beat strip (every 3-4 f across the action), not single stills: a camera that pans early cuts the actor mid-gesture (plumber f897-905, fixed by holding the two-shot until he sets off).
